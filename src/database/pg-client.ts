import { Pool } from 'pg';
import { ConsentSettings, DataType } from '../types';
import * as fs from 'fs';
import * as path from 'path';

// Local JSON fallback path for running without Docker
const FALLBACK_DIR = path.join(__dirname, '../../data');
const FALLBACK_FILE = path.join(FALLBACK_DIR, 'pg_mock_db.json');

interface MockDBSchema {
  users: { id: string; email: string; name: string }[];
  consents: Record<string, { grantedScopes: Record<string, boolean>; updatedAt: string }>;
  connections: Record<string, Record<string, { accessToken: string; refreshToken: string; expiresAt: string; scopes: string[] }>>;
}

let useMock = false;
let pool: Pool | null = null;
let mockDb: MockDBSchema = { users: [], consents: {}, connections: {} };

function loadMockDb() {
  if (!fs.existsSync(FALLBACK_DIR)) {
    fs.mkdirSync(FALLBACK_DIR, { recursive: true });
  }
  if (fs.existsSync(FALLBACK_FILE)) {
    try {
      mockDb = JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf-8'));
    } catch (e) {
      console.warn('Could not parse mock DB file, initializing new mock DB');
    }
  }
}

function saveMockDb() {
  if (!fs.existsSync(FALLBACK_DIR)) {
    fs.mkdirSync(FALLBACK_DIR, { recursive: true });
  }
  fs.writeFileSync(FALLBACK_FILE, JSON.stringify(mockDb, null, 2), 'utf-8');
}

// Initialise DB Client
export async function initDb() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/fitsync';
  
  if (process.env.NODE_ENV === 'test') {
    useMock = true;
    loadMockDb();
    console.log('PG Client: Running in test mode, using in-memory mock database.');
    return;
  }

  try {
    pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 2000
    });
    // Test connection
    const client = await pool.connect();
    client.release();
    
    // Create Tables if they do not exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS user_privacy_consents (
        user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        granted_scopes JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS oauth_connections (
        user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
        provider VARCHAR(50) NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at TIMESTAMP WITH TIME ZONE,
        scopes JSONB,
        PRIMARY KEY (user_id, provider)
      );
    `);
    console.log('PG Client: Successfully connected to PostgreSQL database and initialized tables.');
  } catch (error) {
    console.warn('PG Client: Failed to connect to PostgreSQL database. Falling back to Local Mock DB.', error);
    useMock = true;
    loadMockDb();
  }
}

export async function createUser(id: string, email: string, name: string): Promise<void> {
  if (useMock) {
    if (!mockDb.users.some(u => u.id === id)) {
      mockDb.users.push({ id, email, name });
      saveMockDb();
    }
    return;
  }
  
  await pool!.query(
    'INSERT INTO users (id, email, name) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name',
    [id, email, name]
  );
}

export async function getConsent(userId: string): Promise<ConsentSettings | null> {
  if (useMock) {
    const consent = mockDb.consents[userId];
    if (!consent) return null;
    return {
      userId,
      grantedScopes: consent.grantedScopes as Record<DataType, boolean>,
      updatedAt: consent.updatedAt
    };
  }

  const res = await pool!.query('SELECT * FROM user_privacy_consents WHERE user_id = $1', [userId]);
  if (res.rows.length === 0) return null;
  return {
    userId: res.rows[0].user_id,
    grantedScopes: res.rows[0].granted_scopes,
    updatedAt: res.rows[0].updated_at
  };
}

export async function updateConsent(userId: string, grantedScopes: Record<DataType, boolean>): Promise<ConsentSettings> {
  const updatedAt = new Date().toISOString();
  if (useMock) {
    mockDb.consents[userId] = {
      grantedScopes,
      updatedAt
    };
    saveMockDb();
    return { userId, grantedScopes, updatedAt };
  }

  await pool!.query(
    `INSERT INTO user_privacy_consents (user_id, granted_scopes, updated_at) 
     VALUES ($1, $2, $3) 
     ON CONFLICT (user_id) 
     DO UPDATE SET granted_scopes = EXCLUDED.granted_scopes, updated_at = EXCLUDED.updated_at`,
    [userId, JSON.stringify(grantedScopes), updatedAt]
  );

  return { userId, grantedScopes, updatedAt };
}

export async function saveOAuthConnection(
  userId: string,
  provider: string,
  accessToken: string,
  refreshToken: string | null,
  expiresAt: string | null,
  scopes: string[]
): Promise<void> {
  if (useMock) {
    if (!mockDb.connections[userId]) {
      mockDb.connections[userId] = {};
    }
    mockDb.connections[userId][provider] = {
      accessToken,
      refreshToken: refreshToken || '',
      expiresAt: expiresAt || '',
      scopes
    };
    saveMockDb();
    return;
  }

  await pool!.query(
    `INSERT INTO oauth_connections (user_id, provider, access_token, refresh_token, expires_at, scopes)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, provider)
     DO UPDATE SET access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token, 
                   expires_at = EXCLUDED.expires_at, scopes = EXCLUDED.scopes`,
    [userId, provider, accessToken, refreshToken, expiresAt, JSON.stringify(scopes)]
  );
}

export async function getOAuthConnection(userId: string, provider: string) {
  if (useMock) {
    const conn = mockDb.connections[userId]?.[provider];
    if (!conn) return null;
    return {
      userId,
      provider,
      accessToken: conn.accessToken,
      refreshToken: conn.refreshToken || null,
      expiresAt: conn.expiresAt || null,
      scopes: conn.scopes
    };
  }

  const res = await pool!.query('SELECT * FROM oauth_connections WHERE user_id = $1 AND provider = $2', [userId, provider]);
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    userId: row.user_id,
    provider: row.provider,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    scopes: row.scopes
  };
}

export async function deleteOAuthConnection(userId: string, provider: string): Promise<void> {
  if (useMock) {
    if (mockDb.connections[userId]?.[provider]) {
      delete mockDb.connections[userId][provider];
      saveMockDb();
    }
    return;
  }
  await pool!.query('DELETE FROM oauth_connections WHERE user_id = $1 AND provider = $2', [userId, provider]);
}

export async function closeDb() {
  if (pool) {
    await pool.end();
  }
}
