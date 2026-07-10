import { PrivacyService } from '../src/services/privacy.service';
import { NormalizationService } from '../src/services/normalization.service';
import { createUser, updateConsent, initDb, closeDb } from '../src/database/pg-client';
import { DataType, NormalizedEvent } from '../src/types';

describe('FitSync Consent and Privacy Service Tests', () => {
  const privacyUserId = 'privacy_test_user_77';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initDb();
    await createUser(privacyUserId, 'privacy77@fitsync.com', 'Privacy Advocate');
  });

  afterAll(async () => {
    await closeDb();
  });

  it('should default to having all consent scopes disabled (privacy-first default)', async () => {
    const consent = await PrivacyService.getUserConsent(privacyUserId);
    expect(consent.userId).toBe(privacyUserId);
    
    // All values must be false
    const values = Object.values(consent.grantedScopes);
    expect(values.length).toBe(8); // 8 datatypes
    values.forEach(v => expect(v).toBe(false));
  });

  it('should allow enabling specific scopes and correctly check them', async () => {
    await PrivacyService.updateUserConsent(privacyUserId, {
      steps: true,
      heart_rate: true
    });

    const isStepsGranted = await PrivacyService.isConsentGranted(privacyUserId, 'steps');
    const isSleepGranted = await PrivacyService.isConsentGranted(privacyUserId, 'sleep');

    expect(isStepsGranted).toBe(true);
    expect(isSleepGranted).toBe(false);
  });

  it('should filter out unconsented events before database ingestion', async () => {
    // Current consents: steps=true, heart_rate=true, others=false
    const evSteps = NormalizationService.normalize(privacyUserId, 'healthkit', 'steps', {
      value: 120,
      unit: 'count',
      timestamp: '2026-07-10T12:00:00Z'
    });

    const evSleep = NormalizationService.normalize(privacyUserId, 'healthkit', 'sleep', {
      value: 480,
      unit: 'minutes',
      timestamp: '2026-07-10T06:00:00Z'
    });

    const eventsList: NormalizedEvent[] = [evSteps, evSleep];
    const filtered = await PrivacyService.filterEventsByConsent(privacyUserId, eventsList);

    expect(filtered.length).toBe(1);
    expect(filtered[0].dataType).toBe('steps');
  });

  it('should immediately stop syncing a metric when the permission is revoked', async () => {
    // 1. Enable steps
    await PrivacyService.updateUserConsent(privacyUserId, { steps: true });
    let granted = await PrivacyService.isConsentGranted(privacyUserId, 'steps');
    expect(granted).toBe(true);

    // 2. Revoke steps permission
    await PrivacyService.updateUserConsent(privacyUserId, { steps: false });
    granted = await PrivacyService.isConsentGranted(privacyUserId, 'steps');
    expect(granted).toBe(false);
  });
});
