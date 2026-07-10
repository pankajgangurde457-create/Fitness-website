import { getConsent, updateConsent } from '../database/pg-client';
import { DataType, ConsentSettings, NormalizedEvent } from '../types';

export class PrivacyService {
  /**
   * Retrieves the current privacy consents for a user.
   * If no settings exist yet, it returns a default where all scopes are disabled.
   */
  static async getUserConsent(userId: string): Promise<ConsentSettings> {
    const consent = await getConsent(userId);
    if (consent) {
      return consent;
    }
    
    // Default: no permissions granted (privacy first)
    const defaultScopes: Record<DataType, boolean> = {
      steps: false,
      distance: false,
      gps_route: false,
      heart_rate: false,
      hrv: false,
      sleep: false,
      calories: false,
      workout: false
    };

    return {
      userId,
      grantedScopes: defaultScopes,
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Updates user consent scopes.
   */
  static async updateUserConsent(userId: string, scopes: Partial<Record<DataType, boolean>>): Promise<ConsentSettings> {
    // Ensure all keys are present
    const existing = await this.getUserConsent(userId);
    const updatedScopes = { ...existing.grantedScopes, ...scopes } as Record<DataType, boolean>;
    return await updateConsent(userId, updatedScopes);
  }

  /**
   * Checks if a user has consented to a specific data type.
   */
  static async isConsentGranted(userId: string, dataType: DataType): Promise<boolean> {
    const consent = await this.getUserConsent(userId);
    return !!consent.grantedScopes[dataType];
  }

  /**
   * Filters events, retaining only those for which the user has granted consent.
   * Logs a warning or strips non-compliant metrics.
   */
  static async filterEventsByConsent(userId: string, events: NormalizedEvent[]): Promise<NormalizedEvent[]> {
    const consent = await this.getUserConsent(userId);
    return events.filter(event => {
      const granted = !!consent.grantedScopes[event.dataType];
      if (!granted) {
        console.warn(`PrivacyService: Filtered out unconsented event of type '${event.dataType}' for user '${userId}'`);
      }
      return granted;
    });
  }
}
