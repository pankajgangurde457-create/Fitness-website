import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import { initDb, createUser, getConsent, updateConsent, saveOAuthConnection, deleteOAuthConnection } from './database/pg-client';
import { initTimeSeriesDb, getEvents } from './database/timeseries-client';
import { initRedis, cacheSet, cacheGet } from './database/redis-client';
import { IngestionQueue } from './services/ingestion.queue';
import { SyncService } from './services/sync.service';
import { PrivacyService } from './services/privacy.service';
import { IntegrationMonitor } from './monitoring/health';
import { CalendarAdapter } from './adapters/calendar.adapter';
import { PushNotificationAdapter, NotificationType } from './adapters/push.adapter';
import { DataType } from './types';
import * as path from 'path';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve Static Dashboard UI files
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Services
async function bootstrap() {
  await initDb();
  await initTimeSeriesDb();
  await initRedis();
  
  // Start the background queue ingestion worker
  IngestionQueue.startWorker(500); // Polls every 500ms
  
  IntegrationMonitor.initialize();
  console.log('FitSync Integration Service: Bootstrapped all services successfully.');
}

// ----------------------------------------------------
// Endpoints
// ----------------------------------------------------

/**
 * Create a new user for the sandbox simulation.
 */
app.post('/api/users', async (req, res) => {
  const { id, email, name } = req.body;
  if (!id || !email || !name) {
    return res.status(400).json({ error: 'Missing id, email, or name' });
  }
  try {
    await createUser(id, email, name);
    res.status(201).json({ message: 'User created successfully', user: { id, email, name } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Fetch a user's privacy consents.
 */
app.get('/api/privacy/consent/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const consent = await PrivacyService.getUserConsent(userId);
    res.status(200).json(consent);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Update a user's privacy consents.
 * Toggling off scopes immediately filters future synced events.
 */
app.post('/api/privacy/consent/:userId', async (req, res) => {
  const { userId } = req.params;
  const { scopes } = req.body; // e.g. { steps: true, heart_rate: false }
  
  if (!scopes) {
    return res.status(400).json({ error: 'Missing scopes object' });
  }

  try {
    const updated = await PrivacyService.updateUserConsent(userId, scopes);
    res.status(200).json({ message: 'Consents updated successfully', consent: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Connect a wearable source.
 * In a real app, this initiates the native permissions or OAuth web redirect flow.
 */
app.post('/api/sync/connect', async (req, res) => {
  const { userId, provider } = req.body; // provider: healthkit, health_connect, fitbit, garmin, bluetooth_device
  if (!userId || !provider) {
    return res.status(400).json({ error: 'Missing userId or provider' });
  }

  const startTime = Date.now();
  try {
    let result;
    if (provider === 'healthkit') {
      // Create a dummy token connection in db
      await saveOAuthConnection(userId, 'healthkit', 'hk_native_token', null, null, ['steps', 'distance', 'heart_rate', 'hrv', 'sleep', 'workout']);
      result = { success: true, scopesGranted: ['steps', 'distance', 'heart_rate', 'hrv', 'sleep', 'workout'] };
    } else if (provider === 'health_connect') {
      await saveOAuthConnection(userId, 'health_connect', 'hc_native_token', null, null, ['steps', 'distance', 'heart_rate', 'sleep', 'calories', 'workout']);
      result = { success: true, scopesGranted: ['steps', 'distance', 'heart_rate', 'sleep', 'calories', 'workout'] };
    } else if (provider === 'fitbit') {
      const adapter = SyncService.getFitbitAdapter();
      result = await adapter.connect(userId);
    } else if (provider === 'garmin') {
      // Connect to Garmin adapter (OAuth flow mock)
      await saveOAuthConnection(userId, 'garmin', 'garmin_token', 'garmin_secret', null, ['steps', 'distance', 'heart_rate', 'sleep', 'workout']);
      result = { success: true, scopesGranted: ['steps', 'distance', 'heart_rate', 'sleep', 'workout'] };
    } else if (provider === 'bluetooth_device') {
      const adapter = SyncService.getBluetoothAdapter();
      result = await adapter.connect(userId);
      // Register direct connection
      await saveOAuthConnection(userId, 'bluetooth_device', 'ble_paired_id', null, null, ['heart_rate']);
    } else {
      return res.status(400).json({ error: 'Unknown provider' });
    }

    if (result.success) {
      IntegrationMonitor.logSuccess(provider, Date.now() - startTime);
      // Start background sync listeners immediately on connect
      await SyncService.startBackgroundSyncForUser(userId);
      res.status(200).json({ message: `Successfully connected ${provider}`, result });
    } else {
      IntegrationMonitor.logError(provider, result.error || 'Connection failed', 'general');
      res.status(400).json({ error: result.error || 'Connection failed' });
    }
  } catch (err: any) {
    IntegrationMonitor.logError(provider, err.message, 'general');
    res.status(500).json({ error: err.message });
  }
});

/**
 * Disconnect a wearable source.
 * Revokes future pulls and cleans tokens.
 */
app.post('/api/sync/disconnect', async (req, res) => {
  const { userId, provider } = req.body;
  if (!userId || !provider) {
    return res.status(400).json({ error: 'Missing userId or provider' });
  }

  try {
    await deleteOAuthConnection(userId, provider);
    
    // Stop background listeners
    if (provider === 'bluetooth_device') {
      const adapter = SyncService.getBluetoothAdapter();
      await adapter.disconnect(userId);
    }
    
    // Refresh background subscriptions
    await SyncService.startBackgroundSyncForUser(userId);

    res.status(200).json({ message: `Successfully disconnected ${provider}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Manually trigger data synchronization.
 * Gated by active scopes and returns events. Must complete in under 5 seconds (NFR-Performance).
 */
app.post('/api/sync/manual/:userId', async (req, res) => {
  const { userId } = req.params;
  const start = Date.now();
  try {
    const events = await SyncService.runManualSync(userId);
    
    // Log success metrics for active adapters
    const activeAdapters = await getEvents(userId, { limit: 10 });
    const sources = Array.from(new Set(activeAdapters.map(a => a.source)));
    for (const src of sources) {
      IntegrationMonitor.logSuccess(src, Date.now() - start);
    }

    res.status(200).json({
      message: 'Sync completed',
      count: events.length,
      events
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Retrieve normalized health/fitness events for a user.
 */
app.get('/api/sync/events/:userId', async (req, res) => {
  const { userId } = req.params;
  const { dataType, startTime, endTime, limit } = req.query;
  
  try {
    const events = await getEvents(userId, {
      dataType: dataType as DataType,
      startTime: startTime as string,
      endTime: endTime as string,
      limit: limit ? parseInt(limit as string) : undefined
    });
    res.status(200).json(events);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Set device battery level to verify adaptive sync intervals.
 */
app.post('/api/sync/battery/:userId', (req, res) => {
  const { userId } = req.params;
  const { batteryLevel } = req.body;
  
  if (batteryLevel === undefined) {
    return res.status(400).json({ error: 'Missing batteryLevel' });
  }

  try {
    SyncService.setBatteryLevel(userId, Number(batteryLevel));
    const interval = SyncService.getUserSyncInterval(userId);
    res.status(200).json({
      message: 'Battery level updated',
      batteryLevel,
      currentSyncIntervalMinutes: interval / 60000
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Fetch calendar events with conflict checks.
 */
app.get('/api/calendar/:userId', async (req, res) => {
  const { userId } = req.params;
  const { startTime, endTime } = req.query;

  if (!startTime || !endTime) {
    return res.status(400).json({ error: 'Missing startTime or endTime' });
  }

  try {
    const calendar = new CalendarAdapter();
    const events = await calendar.fetchEvents(userId, startTime as string, endTime as string);
    res.status(200).json(events);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Send smart push notifications.
 */
app.post('/api/notifications/send', async (req, res) => {
  const { userId, type, payload } = req.body;
  if (!userId || !type || !payload) {
    return res.status(400).json({ error: 'Missing userId, type, or payload' });
  }

  try {
    // Register a mock push token first if the user has none to ensure delivery simulation
    await PushNotificationAdapter.registerPushToken(userId, 'mock_token_' + userId);
    
    const success = await PushNotificationAdapter.sendNotification(userId, type as NotificationType, payload);
    if (success) {
      res.status(200).json({ message: 'Notification dispatched successfully' });
    } else {
      res.status(500).json({ error: 'Failed to dispatch notification' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Fetch sent notifications log.
 */
app.get('/api/notifications/sent', (req, res) => {
  const { userId } = req.query;
  const logs = PushNotificationAdapter.getSentNotifications(userId as string);
  res.status(200).json(logs);
});

/**
 * Fetch adapter health checks.
 */
app.get('/api/monitoring/health', (req, res) => {
  res.status(200).json(IntegrationMonitor.getHealthReport());
});

/**
 * Simulate Fitbit API rate-limiting.
 */
app.post('/api/fitbit/simulate-ratelimit', (req, res) => {
  const { active } = req.body;
  const adapter = SyncService.getFitbitAdapter();
  adapter.setSimulateRateLimit(!!active);

  if (active) {
    IntegrationMonitor.logError('fitbit', 'Fitbit API Rate Limit Exceeded (HTTP 429)', 'rate_limit');
  } else {
    IntegrationMonitor.resetHealth('fitbit');
  }

  res.status(200).json({ message: `Fitbit rate-limiting simulation set to ${active}` });
});

/**
 * Simulate Bluetooth Device Disconnect mid-workout.
 */
app.post('/api/bluetooth/simulate-disconnect', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  const adapter = SyncService.getBluetoothAdapter();
  
  // Set up disconnect listener to trigger a push alert for fallback
  adapter.setOnDisconnect(async (uid, err) => {
    console.warn(`System Event: Triggering push alert for fallback to phone sensors for user ${uid}.`);
    
    // Trigger push notification to alert the user to fall back
    await PushNotificationAdapter.sendNotification(uid, 'inactivity_alert', {
      title: 'Workout Watch Paired BLE Disconnected',
      body: 'Your heart-rate strap disconnected mid-workout. FitSync has automatically fallen back to phone-based sensors.',
      data: { fallback_status: 'active' }
    });

    IntegrationMonitor.logError('bluetooth_device', err, 'general');
  });

  adapter.simulateSuddenDisconnect(userId);
  res.status(200).json({ message: 'Bluetooth device sudden disconnect simulated.' });
});

// Start Server
if (process.env.NODE_ENV !== 'test') {
  bootstrap().then(() => {
    app.listen(port, () => {
      console.log(`FitSync Integration Service running at http://localhost:${port}`);
    });
  });
}

export { app, bootstrap };
