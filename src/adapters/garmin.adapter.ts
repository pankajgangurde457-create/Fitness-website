import { WearableAdapter, ConnectionResult, DataType, NormalizedEvent, Subscription } from '../types';
import { NormalizationService } from '../services/normalization.service';
import { saveOAuthConnection, getOAuthConnection, deleteOAuthConnection, getConsent } from '../database/pg-client';

export class GarminAdapter implements WearableAdapter {
  private activeSubscriptions: Map<string, NodeJS.Timeout> = new Map();

  getSupportedDataTypes(): DataType[] {
    return ['steps', 'distance', 'heart_rate', 'sleep', 'workout'];
  }

  async connect(userId: string): Promise<ConnectionResult> {
    // Garmin API uses OAuth1.0a or OAuth2. We simulate credentials storage.
    const mockToken = 'garmin_token_' + Math.random().toString(36).substring(2);
    const mockSecret = 'garmin_secret_' + Math.random().toString(36).substring(2);
    
    // Save credentials to database (store secret in refreshToken field)
    await saveOAuthConnection(userId, 'garmin', mockToken, mockSecret, null, this.getSupportedDataTypes());

    console.log(`GarminAdapter: Connected Garmin for user ${userId} via OAuth.`);
    return {
      success: true,
      scopesGranted: this.getSupportedDataTypes()
    };
  }

  async disconnect(userId: string): Promise<void> {
    await deleteOAuthConnection(userId, 'garmin');
    console.log(`GarminAdapter: Disconnected Garmin for user ${userId}`);
    const timer = this.activeSubscriptions.get(userId);
    if (timer) {
      clearInterval(timer);
      this.activeSubscriptions.delete(userId);
    }
  }

  async fetchLatest(userId: string, dataTypes: DataType[]): Promise<NormalizedEvent[]> {
    const conn = await getOAuthConnection(userId, 'garmin');
    if (!conn) {
      throw new Error(`GarminAdapter: User ${userId} is not connected to Garmin.`);
    }

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
          rawValue = Math.floor(Math.random() * 220) + 40;
          unit = 'count';
          break;
        case 'distance':
          rawValue = (Math.random() * 0.3) + 0.05; // Garmin stores in miles/km
          unit = 'km';
          break;
        case 'heart_rate':
          rawValue = Math.floor(Math.random() * 25) + 65;
          unit = 'bpm';
          break;
        case 'sleep':
          rawValue = Math.floor(Math.random() * 50) + 420;
          unit = 'minutes';
          break;
        case 'workout':
          rawValue = {
            type: 'swimming',
            duration: 2400, // 40 mins
            calories: 450,
            distance: 1500 // meters
          };
          unit = 'workout';
          break;
      }

      const normalized = NormalizationService.normalize(userId, 'garmin', type, {
        value: rawValue,
        unit,
        timestamp: now.toISOString(),
        confidence: 'high' // Garmin device readings have high reliability
      });
      events.push(normalized);
    }

    return events;
  }

  /**
   * Garmin webhook pushes event data to our server. This method parses the raw webhook body.
   * Format matches Garmin Connect API Push Webhook Payload standard.
   */
  parseGarminWebhookPayload(userId: string, payload: any): NormalizedEvent[] {
    const events: NormalizedEvent[] = [];

    // Parse activities (workouts) from Garmin payload
    if (payload.activities && Array.isArray(payload.activities)) {
      for (const act of payload.activities) {
        const timestamp = act.startTimeInSeconds 
          ? new Date(act.startTimeInSeconds * 1000).toISOString()
          : new Date().toISOString();

        const workoutEvent = NormalizationService.normalize(userId, 'garmin', 'workout', {
          value: {
            type: act.activityType ? String(act.activityType).toLowerCase() : 'other',
            duration: act.durationInSeconds || 0,
            calories: act.activeKilocalories || 0,
            distance: act.distanceInMeters || 0,
            avgHeartRate: act.averageHeartRateInBeatsPerMinute
          },
          unit: 'workout',
          timestamp,
          recordedAt: timestamp
        });
        events.push(workoutEvent);

        // If Garmin payload has steps/distance, push them too
        if (act.steps) {
          events.push(NormalizationService.normalize(userId, 'garmin', 'steps', {
            value: act.steps,
            unit: 'count',
            timestamp,
            recordedAt: timestamp
          }));
        }
      }
    }

    // Parse daily summaries
    if (payload.dailies && Array.isArray(payload.dailies)) {
      for (const day of payload.dailies) {
        const timestamp = day.startTimeInSeconds
          ? new Date(day.startTimeInSeconds * 1000).toISOString()
          : new Date().toISOString();

        if (day.steps) {
          events.push(NormalizationService.normalize(userId, 'garmin', 'steps', {
            value: day.steps,
            unit: 'count',
            timestamp,
            recordedAt: timestamp
          }));
        }

        if (day.distanceInMeters) {
          events.push(NormalizationService.normalize(userId, 'garmin', 'distance', {
            value: day.distanceInMeters,
            unit: 'meters',
            timestamp,
            recordedAt: timestamp
          }));
        }
      }
    }

    return events;
  }

  subscribeToBackgroundUpdates(userId: string, callback: (event: NormalizedEvent) => void): Subscription {
    console.log(`GarminAdapter: Subscribed to background updates for user ${userId}`);
    
    // Simulate webhook pushes occurring every 5 seconds
    const intervalId = setInterval(async () => {
      // Create a mock Garmin webhook push payload
      const mockGarminPayload = {
        activities: [
          {
            activityType: 'swimming',
            durationInSeconds: 1500,
            activeKilocalories: 350,
            distanceInMeters: 1000,
            averageHeartRateInBeatsPerMinute: 135,
            startTimeInSeconds: Math.floor(Date.now() / 1000)
          }
        ]
      };

      try {
        const events = this.parseGarminWebhookPayload(userId, mockGarminPayload);
        for (const event of events) {
          callback(event);
        }
      } catch (err) {
        console.error('GarminAdapter background sync: Error parsing payload:', err);
      }
    }, 5000);

    this.activeSubscriptions.set(userId, intervalId);

    return {
      unsubscribe: async () => {
        clearInterval(intervalId);
        this.activeSubscriptions.delete(userId);
        console.log(`GarminAdapter: Unsubscribed background updates for user ${userId}`);
      }
    };
  }
}
