import { WearableAdapter, ConnectionResult, DataType, NormalizedEvent, Subscription } from '../types';
import { NormalizationService } from '../services/normalization.service';
import { saveOAuthConnection, getOAuthConnection, deleteOAuthConnection, getConsent } from '../database/pg-client';

export class FitbitAdapter implements WearableAdapter {
  private activeSubscriptions: Map<string, NodeJS.Timeout> = new Map();
  private mockRateLimitHit = false;

  getSupportedDataTypes(): DataType[] {
    return ['steps', 'heart_rate', 'sleep', 'calories'];
  }

  async connect(userId: string): Promise<ConnectionResult> {
    // Simulate OAuth2 token generation
    const mockAccessToken = 'fitbit_access_token_' + Math.random().toString(36).substring(2);
    const mockRefreshToken = 'fitbit_refresh_token_' + Math.random().toString(36).substring(2);
    
    // Expires in 1 hour
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    const scopes = this.getSupportedDataTypes();

    await saveOAuthConnection(userId, 'fitbit', mockAccessToken, mockRefreshToken, expiresAt, scopes);

    console.log(`FitbitAdapter: User ${userId} successfully connected Fitbit via OAuth2.`);
    return {
      success: true,
      scopesGranted: scopes
    };
  }

  async disconnect(userId: string): Promise<void> {
    await deleteOAuthConnection(userId, 'fitbit');
    console.log(`FitbitAdapter: Disconnected Fitbit for user ${userId}`);
    const timer = this.activeSubscriptions.get(userId);
    if (timer) {
      clearInterval(timer);
      this.activeSubscriptions.delete(userId);
    }
  }

  /**
   * Helper to refresh tokens if expired.
   */
  private async getOrRefreshToken(userId: string): Promise<string> {
    const conn = await getOAuthConnection(userId, 'fitbit');
    if (!conn) {
      throw new Error(`FitbitAdapter: User ${userId} is not connected to Fitbit.`);
    }

    const expiresAt = conn.expiresAt ? new Date(conn.expiresAt).getTime() : 0;
    const now = Date.now();

    if (expiresAt < now) {
      console.log(`FitbitAdapter: Access token expired for user ${userId}. Refreshing token...`);
      // Simulate refreshing token
      const newAccessToken = 'fitbit_access_token_refreshed_' + Math.random().toString(36).substring(2);
      const newRefreshToken = 'fitbit_refresh_token_refreshed_' + Math.random().toString(36).substring(2);
      const newExpiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

      await saveOAuthConnection(userId, 'fitbit', newAccessToken, newRefreshToken, newExpiresAt, conn.scopes);
      return newAccessToken;
    }

    return conn.accessToken;
  }

  // Allow triggering rate limit simulations for test suite validation
  setSimulateRateLimit(active: boolean) {
    this.mockRateLimitHit = active;
  }

  async fetchLatest(userId: string, dataTypes: DataType[]): Promise<NormalizedEvent[]> {
    // 1. Ensure user is connected and refresh token if needed
    await this.getOrRefreshToken(userId);

    // 2. Handle Fitbit API Rate Limits (Fitbit limits are 150 requests/hour per user)
    if (this.mockRateLimitHit) {
      console.warn(`FitbitAdapter: Rate limit hit (HTTP 429) for user ${userId}. Request rejected.`);
      throw new Error('Fitbit API Rate Limit Exceeded (HTTP 429)');
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
          rawValue = Math.floor(Math.random() * 200) + 30;
          unit = 'count';
          break;
        case 'heart_rate':
          rawValue = Math.floor(Math.random() * 30) + 70; // 70 to 100 bpm
          unit = 'bpm';
          break;
        case 'sleep':
          rawValue = Math.floor(Math.random() * 40) + 410;
          unit = 'minutes';
          break;
        case 'calories':
          rawValue = Math.floor(Math.random() * 10) + 4;
          unit = 'kcal';
          break;
      }

      const normalized = NormalizationService.normalize(userId, 'fitbit', type, {
        value: rawValue,
        unit,
        timestamp: now.toISOString(),
        confidence: 'medium'
      });
      events.push(normalized);
    }

    return events;
  }

  subscribeToBackgroundUpdates(userId: string, callback: (event: NormalizedEvent) => void): Subscription {
    console.log(`FitbitAdapter: Subscribed to background updates for user ${userId}`);
    
    // Fitbit uses webhooks for background delivery. We simulate receiving webhook updates every 5s.
    const intervalId = setInterval(async () => {
      const activeTypes = this.getSupportedDataTypes();
      const randomType = activeTypes[Math.floor(Math.random() * activeTypes.length)];
      try {
        const events = await this.fetchLatest(userId, [randomType]);
        if (events.length > 0) {
          callback(events[0]);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('429')) {
          console.warn('FitbitAdapter background sync: Rate limit hit, skipping this interval.');
        } else {
          console.error('FitbitAdapter: Error in background delivery:', err);
        }
      }
    }, 5000);

    this.activeSubscriptions.set(userId, intervalId);

    return {
      unsubscribe: async () => {
        clearInterval(intervalId);
        this.activeSubscriptions.delete(userId);
        console.log(`FitbitAdapter: Unsubscribed background updates for user ${userId}`);
      }
    };
  }
}
