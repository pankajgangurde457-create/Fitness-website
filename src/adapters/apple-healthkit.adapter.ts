import { WearableAdapter, ConnectionResult, DataType, NormalizedEvent, Subscription } from '../types';
import { NormalizationService } from '../services/normalization.service';
import { getConsent } from '../database/pg-client';

export class AppleHealthKitAdapter implements WearableAdapter {
  private activeSubscriptions: Map<string, NodeJS.Timeout> = new Map();

  getSupportedDataTypes(): DataType[] {
    return ['steps', 'distance', 'heart_rate', 'hrv', 'sleep', 'workout'];
  }

  async connect(userId: string): Promise<ConnectionResult> {
    // In HealthKit, we check user's privacy consents from the DB to mimic system permission alerts
    const consent = await getConsent(userId);
    const scopes = consent 
      ? Object.keys(consent.grantedScopes).filter(k => consent.grantedScopes[k as DataType]) as DataType[]
      : this.getSupportedDataTypes();

    console.log(`AppleHealthKitAdapter: User ${userId} connected to HealthKit. Scopes:`, scopes);
    return {
      success: true,
      scopesGranted: scopes.filter(s => this.getSupportedDataTypes().includes(s))
    };
  }

  async disconnect(userId: string): Promise<void> {
    console.log(`AppleHealthKitAdapter: Disconnected HealthKit for user ${userId}`);
    const timer = this.activeSubscriptions.get(userId);
    if (timer) {
      clearInterval(timer);
      this.activeSubscriptions.delete(userId);
    }
  }

  async fetchLatest(userId: string, dataTypes: DataType[]): Promise<NormalizedEvent[]> {
    const consent = await getConsent(userId);
    const allowedTypes = dataTypes.filter(type => {
      // Gate by both adapter capabilities and user consents
      const supported = this.getSupportedDataTypes().includes(type);
      const consented = consent ? !!consent.grantedScopes[type] : true;
      return supported && consented;
    });

    const now = new Date();
    const events: NormalizedEvent[] = [];

    for (const type of allowedTypes) {
      // Simulate live telemetry
      let rawValue: any;
      let unit = '';

      switch (type) {
        case 'steps':
          rawValue = Math.floor(Math.random() * 300) + 50; // 50 to 350 steps
          unit = 'count';
          break;
        case 'distance':
          rawValue = (Math.random() * 0.2) + 0.05; // 0.05 to 0.25 miles
          unit = 'miles';
          break;
        case 'heart_rate':
          rawValue = Math.floor(Math.random() * 40) + 60; // 60 to 100 bpm
          unit = 'bpm';
          break;
        case 'hrv':
          rawValue = Math.floor(Math.random() * 30) + 40; // 40 to 70 ms
          unit = 'ms';
          break;
        case 'sleep':
          rawValue = Math.floor(Math.random() * 60) + 420; // 420 to 480 minutes (7-8 hours)
          unit = 'minutes';
          break;
        case 'workout':
          rawValue = {
            type: 'running',
            duration: 1800, // 30 mins
            calories: 300,
            distance: 3.1 // miles
          };
          unit = 'workout';
          break;
      }

      const normalized = NormalizationService.normalize(userId, 'healthkit', type, {
        value: rawValue,
        unit,
        timestamp: now.toISOString(),
        confidence: 'high'
      });
      events.push(normalized);
    }

    return events;
  }

  subscribeToBackgroundUpdates(userId: string, callback: (event: NormalizedEvent) => void): Subscription {
    console.log(`AppleHealthKitAdapter: Subscribed to background updates for user ${userId}`);
    
    // Simulate iOS HealthKit Background delivery triggers every 5 seconds
    const intervalId = setInterval(async () => {
      const activeTypes = this.getSupportedDataTypes();
      // Select one random datatype to trigger
      const randomType = activeTypes[Math.floor(Math.random() * activeTypes.length)];
      try {
        const events = await this.fetchLatest(userId, [randomType]);
        if (events.length > 0) {
          callback(events[0]);
        }
      } catch (err) {
        console.error('AppleHealthKitAdapter: Error in background delivery:', err);
      }
    }, 5000);

    this.activeSubscriptions.set(userId, intervalId);

    return {
      unsubscribe: async () => {
        clearInterval(intervalId);
        this.activeSubscriptions.delete(userId);
        console.log(`AppleHealthKitAdapter: Unsubscribed background updates for user ${userId}`);
      }
    };
  }
}
