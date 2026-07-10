import { DataType, NormalizedEvent, SourceType } from '../types';
import { AppleHealthKitAdapter } from '../adapters/apple-healthkit.adapter';
import { GoogleHealthConnectAdapter } from '../adapters/google-healthconnect.adapter';
import { FitbitAdapter } from '../adapters/fitbit.adapter';
import { GarminAdapter } from '../adapters/garmin.adapter';
import { BluetoothAdapter } from '../adapters/bluetooth.adapter';
import { PrivacyService } from './privacy.service';
import { IngestionQueue } from './ingestion.queue';
import { getOAuthConnection } from '../database/pg-client';

export class SyncService {
  private static hkAdapter = new AppleHealthKitAdapter();
  private static hcAdapter = new GoogleHealthConnectAdapter();
  private static fbAdapter = new FitbitAdapter();
  private static gmAdapter = new GarminAdapter();
  private static bleAdapter = new BluetoothAdapter();

  // Active background subscription handles per user
  private static activeSubs: Map<string, { unsubscribe: () => Promise<void> }[]> = new Map();

  // Tracks the adaptive sync intervals in milliseconds for each user
  private static userSyncIntervals: Map<string, number> = new Map();

  // Simulate device battery status (can be set by client endpoint)
  private static userBatteryLevels: Map<string, number> = new Map();

  /**
   * Run a manual/immediate sync for a user from all connected sources.
   * Completes within 5 seconds as per performance NFR.
   */
  static async runManualSync(userId: string): Promise<NormalizedEvent[]> {
    console.log(`SyncService: Running manual sync for user '${userId}'`);
    const startTime = Date.now();
    const syncedEvents: NormalizedEvent[] = [];

    // 1. Identify which sources are active
    const activeAdapters = await this.getActiveAdaptersForUser(userId);
    
    // 2. Fetch latest data from each active source
    for (const { source, adapter } of activeAdapters) {
      try {
        const supportedTypes = adapter.getSupportedDataTypes();
        // Filter types by user's active consent scopes
        const consentedTypes: DataType[] = [];
        for (const type of supportedTypes) {
          if (await PrivacyService.isConsentGranted(userId, type)) {
            consentedTypes.push(type);
          }
        }

        if (consentedTypes.length === 0) {
          console.log(`SyncService: Skipping source '${source}' for user '${userId}' because no scopes are consented.`);
          continue;
        }

        console.log(`SyncService: Syncing source '${source}' for user '${userId}' with scopes:`, consentedTypes);
        const rawEvents = await adapter.fetchLatest(userId, consentedTypes);
        
        syncedEvents.push(...rawEvents);
      } catch (err) {
        console.error(`SyncService: Failed to sync source '${source}' for user '${userId}':`, err);
      }
    }

    // 3. Push events to ingestion queue (asynchronous, non-locking)
    if (syncedEvents.length > 0) {
      await IngestionQueue.pushEvents(syncedEvents);
    }

    const duration = Date.now() - startTime;
    console.log(`SyncService: Manual sync completed for user '${userId}' in ${duration}ms. Ingested ${syncedEvents.length} events.`);
    
    return syncedEvents;
  }

  /**
   * Helper to identify connected adapters for a user
   */
  private static async getActiveAdaptersForUser(userId: string): Promise<{ source: SourceType; adapter: any }[]> {
    const list: { source: SourceType; adapter: any }[] = [];

    // HealthKit and Health Connect are native integrations. We simulate them being active by default if consented.
    const hkConsent = await getOAuthConnection(userId, 'healthkit');
    // If user clicked 'Connect' on UI, it saves connection
    if (hkConsent) {
      list.push({ source: 'healthkit', adapter: this.hkAdapter });
    }

    const hcConsent = await getOAuthConnection(userId, 'health_connect');
    if (hcConsent) {
      list.push({ source: 'health_connect', adapter: this.hcAdapter });
    }

    // OAuth integrations
    if (await getOAuthConnection(userId, 'fitbit')) {
      list.push({ source: 'fitbit', adapter: this.fbAdapter });
    }
    if (await getOAuthConnection(userId, 'garmin')) {
      list.push({ source: 'garmin', adapter: this.gmAdapter });
    }
    if (await getOAuthConnection(userId, 'bluetooth_device')) {
      list.push({ source: 'bluetooth_device', adapter: this.bleAdapter });
    }

    return list;
  }

  /**
   * Update the simulated device battery level.
   */
  static setBatteryLevel(userId: string, level: number): void {
    this.userBatteryLevels.set(userId, level);
    this.calculateAdaptiveSyncInterval(userId);
  }

  /**
   * Calculate adaptive sync intervals to optimize battery usage:
   * - Battery < 20%: Slow down sync interval to 30 mins to conserve battery.
   * - User is executing active workout / high HR: Fast sync every 1 min.
   * - Standard sleep / idle: Slow sync every 15 mins.
   * - Active daytime: Standard sync every 5 mins.
   */
  static calculateAdaptiveSyncInterval(userId: string, isUserHighlyActive = false): number {
    const battery = this.userBatteryLevels.get(userId) ?? 100;
    let intervalMs = 5 * 60 * 1000; // Default 5 mins

    if (battery < 20) {
      intervalMs = 30 * 60 * 1000; // Throttled: 30 minutes
      console.log(`SyncService: Low battery (${battery}%). Throttling sync interval to 30 minutes for user '${userId}'.`);
    } else if (isUserHighlyActive) {
      intervalMs = 1 * 60 * 1000; // High speed: 1 minute
      console.log(`SyncService: High activity detected. Accelerating sync interval to 1 minute for user '${userId}'.`);
    } else {
      // Check current hour for sleep detection (e.g. 11 PM to 7 AM)
      const currentHour = new Date().getHours();
      const isSleepingHours = currentHour >= 23 || currentHour < 7;
      if (isSleepingHours) {
        intervalMs = 15 * 60 * 1000; // Sleep mode: 15 minutes
        console.log(`SyncService: Sleep hours detected. Slowing sync interval to 15 minutes for user '${userId}'.`);
      }
    }

    this.userSyncIntervals.set(userId, intervalMs);
    return intervalMs;
  }

  /**
   * Retrieve current computed sync interval for a user.
   */
  static getUserSyncInterval(userId: string): number {
    return this.userSyncIntervals.get(userId) || (5 * 60 * 1000);
  }

  /**
   * Starts background sync timers and subscribes to native background event notifications.
   * Automatically enforces consent gating on every background delivery event.
   */
  static async startBackgroundSyncForUser(userId: string): Promise<void> {
    if (this.activeSubs.has(userId)) {
      await this.stopBackgroundSyncForUser(userId);
    }

    console.log(`SyncService: Activating background sync manager for user '${userId}'`);
    const subs: { unsubscribe: () => Promise<void> }[] = [];
    const activeAdapters = await this.getActiveAdaptersForUser(userId);

    // Initial calculation of adaptive interval
    this.calculateAdaptiveSyncInterval(userId);

    // Setup subscriptions for native adapters that push data
    for (const { source, adapter } of activeAdapters) {
      try {
        const sub = adapter.subscribeToBackgroundUpdates(userId, async (event: NormalizedEvent) => {
          // Gate by privacy settings
          const consented = await PrivacyService.isConsentGranted(userId, event.dataType);
          if (consented) {
            console.log(`SyncService Background: Ingesting event '${event.dataType}' from '${source}'`);
            
            // Check if this event signals high activity to adjust interval adaptively
            if (event.dataType === 'steps' && Number(event.value) > 100) {
              this.calculateAdaptiveSyncInterval(userId, true);
            } else if (event.dataType === 'heart_rate' && Number(event.value) > 110) {
              this.calculateAdaptiveSyncInterval(userId, true);
            } else {
              // Return to normal daytime/sleep intervals if heart rate is settling
              this.calculateAdaptiveSyncInterval(userId, false);
            }

            await IngestionQueue.pushEvents([event]);
          } else {
            console.warn(`SyncService Background: Dropped incoming event '${event.dataType}' due to missing user consent.`);
          }
        });
        subs.push(sub);
      } catch (err) {
        console.error(`SyncService: Failed to setup background subscription for '${source}':`, err);
      }
    }

    this.activeSubs.set(userId, subs);
  }

  /**
   * Shuts down all background sync and listener subscriptions for a user immediately.
   */
  static async stopBackgroundSyncForUser(userId: string): Promise<void> {
    const subs = this.activeSubs.get(userId);
    if (subs) {
      console.log(`SyncService: Deactivating all background sync schedules for user '${userId}'`);
      for (const sub of subs) {
        await sub.unsubscribe();
      }
      this.activeSubs.delete(userId);
    }
  }

  /**
   * Expose Fitbit adapter so that rate limits can be simulated in tests.
   */
  static getFitbitAdapter(): FitbitAdapter {
    return this.fbAdapter;
  }

  /**
   * Expose Bluetooth adapter so that sudden disconnections can be simulated.
   */
  static getBluetoothAdapter(): BluetoothAdapter {
    return this.bleAdapter;
  }
}
