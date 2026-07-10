import { NormalizationService } from '../src/services/normalization.service';
import { DeduplicationService } from '../src/services/deduplication.service';
import { SyncService } from '../src/services/sync.service';
import { createUser, updateConsent, getOAuthConnection, initDb, closeDb } from '../src/database/pg-client';
import { initTimeSeriesDb, getEvents, closeTimeSeriesDb } from '../src/database/timeseries-client';
import { initRedis, closeRedis } from '../src/database/redis-client';
import { IngestionQueue } from '../src/services/ingestion.queue';
import { DataType, NormalizedEvent } from '../src/types';
import { mockAppleHealthKitRaw, mockGoogleHealthConnectRaw, mockFitbitRaw, mockGarminWebhookPayload } from './mock-payloads';

describe('FitSync Sync & Data Normalization Tests', () => {
  const testUserId = 'test_user_999';

  beforeAll(async () => {
    // Force environment as test to trigger mock database backends
    process.env.NODE_ENV = 'test';
    await initDb();
    await initTimeSeriesDb();
    await initRedis();
    
    // Seed user and consents
    await createUser(testUserId, 'test999@fitsync.com', 'Test Runner');
    
    // Consent all scopes for testing
    const fullScopes: Record<DataType, boolean> = {
      steps: true,
      distance: true,
      heart_rate: true,
      hrv: true,
      sleep: true,
      calories: true,
      workout: true,
      gps_route: true
    };
    await updateConsent(testUserId, fullScopes);
  });

  afterAll(async () => {
    await closeDb();
    await closeTimeSeriesDb();
    await closeRedis();
  });

  describe('1. Data Normalization Service', () => {
    it('should correctly convert steps count to number', () => {
      const result = NormalizationService.normalize(testUserId, 'healthkit', 'steps', {
        value: '120', // string
        unit: 'count',
        timestamp: '2026-07-10T12:00:00Z'
      });
      expect(result.value).toBe(120);
      expect(result.unit).toBe('count');
    });

    it('should normalize distance in miles to meters', () => {
      const result = NormalizationService.normalize(testUserId, 'healthkit', 'distance', {
        value: 1.5,
        unit: 'miles',
        timestamp: '2026-07-10T12:00:00Z'
      });
      // 1.5 * 1609.34 = 2414.01 -> Math.round -> 2414
      expect(result.value).toBe(2414);
      expect(result.unit).toBe('meters');
    });

    it('should normalize distance in kilometers to meters', () => {
      const result = NormalizationService.normalize(testUserId, 'healthkit', 'distance', {
        value: 2.5,
        unit: 'km',
        timestamp: '2026-07-10T12:00:00Z'
      });
      expect(result.value).toBe(2500);
      expect(result.unit).toBe('meters');
    });

    it('should normalize workout metadata format', () => {
      const result = NormalizationService.normalize(testUserId, 'healthkit', 'workout', {
        value: {
          type: 'Running',
          duration: 1800,
          calories: 300,
          distance: 3.1
        },
        unit: 'workout',
        timestamp: '2026-07-10T10:00:00Z'
      });
      expect(result.value).toEqual({
        type: 'running',
        duration: 1800,
        calories: 300,
        distance: 3.1
      });
    });
  });

  describe('2. Deduplication Service', () => {
    it('should resolve steps overlaps by taking the high-confidence source in 15min window', () => {
      const ev1 = NormalizationService.normalize(testUserId, 'health_connect', 'steps', {
        value: 150,
        unit: 'count',
        timestamp: '2026-07-10T12:00:00.000Z',
        confidence: 'medium'
      });
      
      const ev2 = NormalizationService.normalize(testUserId, 'healthkit', 'steps', {
        value: 200,
        unit: 'count',
        timestamp: '2026-07-10T12:01:00.000Z', // inside same 15min window
        confidence: 'high'
      });

      const deduplicated = DeduplicationService.deduplicate([ev1, ev2]);
      expect(deduplicated.length).toBe(1);
      // Favors Apple HealthKit due to higher confidence level
      expect(deduplicated[0].source).toBe('healthkit');
      expect(deduplicated[0].value).toBe(200);
    });

    it('should deduplicate close heart rate readings within a 5-second window', () => {
      const ev1 = NormalizationService.normalize(testUserId, 'health_connect', 'heart_rate', {
        value: 70,
        unit: 'bpm',
        timestamp: '2026-07-10T12:00:00Z',
        confidence: 'medium'
      });

      const ev2 = NormalizationService.normalize(testUserId, 'bluetooth_device', 'heart_rate', {
        value: 72,
        unit: 'bpm',
        timestamp: '2026-07-10T12:00:03Z', // 3 seconds later (within 5s window)
        confidence: 'high'
      });

      const deduplicated = DeduplicationService.deduplicate([ev1, ev2]);
      expect(deduplicated.length).toBe(1);
      expect(deduplicated[0].source).toBe('bluetooth_device');
      expect(deduplicated[0].value).toBe(72);
    });
  });

  describe('3. Sync Service & Ingestion Queue', () => {
    it('should compute slower sync intervals when battery is low', () => {
      SyncService.setBatteryLevel(testUserId, 100);
      let interval = SyncService.getUserSyncInterval(testUserId);
      expect(interval).toBe(5 * 60 * 1000); // 5 mins standard

      SyncService.setBatteryLevel(testUserId, 15); // < 20%
      interval = SyncService.getUserSyncInterval(testUserId);
      expect(interval).toBe(30 * 60 * 1000); // 30 mins slow sync
    });

    it('should handle Fitbit API rate-limiting errors gracefully', async () => {
      const adapter = SyncService.getFitbitAdapter();
      
      // Connect Fitbit
      await adapter.connect(testUserId);

      // Simulate Rate Limit Hit
      adapter.setSimulateRateLimit(true);
      await expect(adapter.fetchLatest(testUserId, ['steps'])).rejects.toThrow('HTTP 429');

      // Reset Rate Limit
      adapter.setSimulateRateLimit(false);
      const events = await adapter.fetchLatest(testUserId, ['steps']);
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].dataType).toBe('steps');
    });

    it('should trigger push alert notification when Bluetooth disconnects unexpectedly', async () => {
      const bleAdapter = SyncService.getBluetoothAdapter();
      await bleAdapter.connect(testUserId);

      let disconnectTriggered = false;
      bleAdapter.setOnDisconnect((uid, err) => {
        disconnectTriggered = true;
        expect(uid).toBe(testUserId);
        expect(err).toContain('lost');
      });

      bleAdapter.simulateSuddenDisconnect(testUserId);
      expect(disconnectTriggered).toBe(true);
    });
  });
});
