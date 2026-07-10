import { WearableAdapter, ConnectionResult, DataType, NormalizedEvent, Subscription } from '../types';
import { NormalizationService } from '../services/normalization.service';
import { getConsent } from '../database/pg-client';

export class GoogleHealthConnectAdapter implements WearableAdapter {
  private activeSubscriptions: Map<string, NodeJS.Timeout> = new Map();

  getSupportedDataTypes(): DataType[] {
    // Similar to HealthKit, but with Calories
    return ['steps', 'distance', 'heart_rate', 'sleep', 'calories', 'workout'];
  }

  async connect(userId: string): Promise<ConnectionResult> {
    const consent = await getConsent(userId);
    const scopes = consent 
      ? Object.keys(consent.grantedScopes).filter(k => consent.grantedScopes[k as DataType]) as DataType[]
      : this.getSupportedDataTypes();

    console.log(`GoogleHealthConnectAdapter: User ${userId} connected to Health Connect. Scopes:`, scopes);
    return {
      success: true,
      scopesGranted: scopes.filter(s => this.getSupportedDataTypes().includes(s))
    };
  }

  async disconnect(userId: string): Promise<void> {
    console.log(`GoogleHealthConnectAdapter: Disconnected Health Connect for user ${userId}`);
    const timer = this.activeSubscriptions.get(userId);
    if (timer) {
      clearInterval(timer);
      this.activeSubscriptions.delete(userId);
    }
  }

  async fetchLatest(userId: string, dataTypes: DataType[]): Promise<NormalizedEvent[]> {
    const consent = await getConsent(userId);
    const allowedTypes = dataTypes.filter(type => {
      const supported = this.getSupportedDataTypes().includes(type);
      const consented = consent ? !!consent.grantedScopes[type] : true;
      return supported && consented;
    });

    const now = new Date();
    const events: NormalizedEvent[] = [];

    for (const type of allowedTypes) {
      let rawValue: any;
      let unit = '';

      switch (type) {
        case 'steps':
          // Slightly different step counts to simulate device variation
          rawValue = Math.floor(Math.random() * 250) + 40;
          unit = 'count';
          break;
        case 'distance':
          rawValue = (Math.random() * 300) + 50; // Google Health Connect natively stores in meters
          unit = 'meters';
          break;
        case 'heart_rate':
          rawValue = Math.floor(Math.random() * 35) + 65; // 65 to 100 bpm
          unit = 'bpm';
          break;
        case 'sleep':
          rawValue = Math.floor(Math.random() * 50) + 400; // 400 to 450 minutes
          unit = 'minutes';
          break;
        case 'calories':
          rawValue = Math.floor(Math.random() * 15) + 5; // Active calories burned
          unit = 'kcal';
          break;
        case 'workout':
          rawValue = {
            type: 'cycling',
            duration: 3600, // 1 hour
            calories: 600,
            distance: 15000 // 15 km in meters
          };
          unit = 'workout';
          break;
      }

      const normalized = NormalizationService.normalize(userId, 'health_connect', type, {
        value: rawValue,
        unit,
        timestamp: now.toISOString(),
        confidence: 'medium' // Usually default Android phone sensors get medium, smartwatches get high
      });
      events.push(normalized);
    }

    return events;
  }

  subscribeToBackgroundUpdates(userId: string, callback: (event: NormalizedEvent) => void): Subscription {
    console.log(`GoogleHealthConnectAdapter: Subscribed to background updates for user ${userId}`);
    
    // Simulate Android WorkManager wakeups every 5 seconds
    const intervalId = setInterval(async () => {
      const activeTypes = this.getSupportedDataTypes();
      const randomType = activeTypes[Math.floor(Math.random() * activeTypes.length)];
      try {
        const events = await this.fetchLatest(userId, [randomType]);
        if (events.length > 0) {
          callback(events[0]);
        }
      } catch (err) {
        console.error('GoogleHealthConnectAdapter: Error in background delivery:', err);
      }
    }, 5000);

    this.activeSubscriptions.set(userId, intervalId);

    return {
      unsubscribe: async () => {
        clearInterval(intervalId);
        this.activeSubscriptions.delete(userId);
        console.log(`GoogleHealthConnectAdapter: Unsubscribed background updates for user ${userId}`);
      }
    };
  }
}
