import { NormalizedEvent, DataType } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

const FALLBACK_DIR = path.join(__dirname, '../../data');
const FALLBACK_FILE = path.join(FALLBACK_DIR, 'timeseries_mock_db.json');

let useMock = false;
let tsPool: Pool | null = null;
let mockEvents: NormalizedEvent[] = [];

function loadMockDb() {
  if (!fs.existsSync(FALLBACK_DIR)) {
    fs.mkdirSync(FALLBACK_DIR, { recursive: true });
  }
  if (fs.existsSync(FALLBACK_FILE)) {
    try {
      mockEvents = JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf-8'));
    } catch (e) {
      console.warn('Could not parse mock time-series DB file, initializing new list');
    }
  }
}

function saveMockDb() {
  if (!fs.existsSync(FALLBACK_DIR)) {
    fs.mkdirSync(FALLBACK_DIR, { recursive: true });
  }
  fs.writeFileSync(FALLBACK_FILE, JSON.stringify(mockEvents, null, 2), 'utf-8');
}

export async function initTimeSeriesDb() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/fitsync';

  if (process.env.NODE_ENV === 'test') {
    useMock = true;
    loadMockDb();
    console.log('Timescale Client: Running in test mode, using in-memory mock storage.');
    return;
  }

  try {
    tsPool = new Pool({
      connectionString,
      connectionTimeoutMillis: 2000
    });
    // Test connection
    const client = await tsPool.connect();
    client.release();

    // Create the hypertable if using TimescaleDB, otherwise a standard table
    await tsPool.query(`
      CREATE TABLE IF NOT EXISTS health_events (
        event_id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        source VARCHAR(50) NOT NULL,
        data_type VARCHAR(50) NOT NULL,
        value JSONB NOT NULL,
        unit VARCHAR(50) NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
        recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
        synced_at TIMESTAMP WITH TIME ZONE NOT NULL,
        confidence VARCHAR(20) NOT NULL
      );
      
      -- Create hypertable only if timescale extension exists and it isn't already a hypertable
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
          -- Check if it's already a hypertable
          IF NOT EXISTS (SELECT 1 FROM _timescaledb_catalog.hypertable WHERE table_name = 'health_events') THEN
            PERFORM create_hypertable('health_events', 'timestamp');
          END IF;
        END IF;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE NOTICE 'TimescaleDB extension not fully initialized or configured, using standard PostgreSQL index.';
      END $$;

      CREATE INDEX IF NOT EXISTS idx_health_events_user_type_time ON health_events (user_id, data_type, timestamp DESC);
    `);
    console.log('Timescale Client: Connected and initialized health_events table.');
  } catch (error) {
    console.warn('Timescale Client: Failed to connect to TimescaleDB. Falling back to local file time-series store.', error);
    useMock = true;
    loadMockDb();
  }
}

export async function saveEvents(events: NormalizedEvent[]): Promise<void> {
  if (events.length === 0) return;

  if (useMock) {
    // Check if event already exists to prevent duplication on reload
    for (const e of events) {
      const idx = mockEvents.findIndex(m => m.eventId === e.eventId);
      if (idx > -1) {
        mockEvents[idx] = e;
      } else {
        mockEvents.push(e);
      }
    }
    saveMockDb();
    return;
  }

  // Batch insert
  const client = await tsPool!.connect();
  try {
    await client.query('BEGIN');
    for (const event of events) {
      await client.query(
        `INSERT INTO health_events (event_id, user_id, source, data_type, value, unit, timestamp, recorded_at, synced_at, confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (event_id) DO UPDATE 
         SET value = EXCLUDED.value, confidence = EXCLUDED.confidence, synced_at = EXCLUDED.synced_at`,
        [
          event.eventId,
          event.userId,
          event.source,
          event.dataType,
          JSON.stringify(event.value),
          event.unit,
          event.timestamp,
          event.recordedAt,
          event.syncedAt,
          event.confidence
        ]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error saving events batch:', err);
    throw err;
  } finally {
    client.release();
  }
}

export async function getEvents(
  userId: string,
  options: { dataType?: DataType; startTime?: string; endTime?: string; limit?: number } = {}
): Promise<NormalizedEvent[]> {
  if (useMock) {
    let filtered = mockEvents.filter(e => e.userId === userId);
    if (options.dataType) {
      filtered = filtered.filter(e => e.dataType === options.dataType);
    }
    if (options.startTime) {
      const start = new Date(options.startTime).getTime();
      filtered = filtered.filter(e => new Date(e.timestamp).getTime() >= start);
    }
    if (options.endTime) {
      const end = new Date(options.endTime).getTime();
      filtered = filtered.filter(e => new Date(e.timestamp).getTime() <= end);
    }
    // Sort descending by timestamp
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    if (options.limit) {
      filtered = filtered.slice(0, options.limit);
    }
    return filtered;
  }

  let query = 'SELECT * FROM health_events WHERE user_id = $1';
  const params: any[] = [userId];
  let paramIndex = 2;

  if (options.dataType) {
    query += ` AND data_type = $${paramIndex++}`;
    params.push(options.dataType);
  }
  if (options.startTime) {
    query += ` AND timestamp >= $${paramIndex++}`;
    params.push(options.startTime);
  }
  if (options.endTime) {
    query += ` AND timestamp <= $${paramIndex++}`;
    params.push(options.endTime);
  }

  query += ' ORDER BY timestamp DESC';

  if (options.limit) {
    query += ` LIMIT $${paramIndex++}`;
    params.push(options.limit);
  }

  const res = await tsPool!.query(query, params);
  return res.rows.map(row => ({
    eventId: row.event_id,
    userId: row.user_id,
    source: row.source,
    dataType: row.data_type as DataType,
    value: row.value,
    unit: row.unit,
    timestamp: new Date(row.timestamp).toISOString(),
    recordedAt: new Date(row.recorded_at).toISOString(),
    syncedAt: new Date(row.synced_at).toISOString(),
    confidence: row.confidence
  }));
}

export async function closeTimeSeriesDb() {
  if (tsPool) {
    await tsPool.end();
  }
}
