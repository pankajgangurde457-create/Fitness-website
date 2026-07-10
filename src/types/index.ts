export type SourceType =
  | 'healthkit'
  | 'health_connect'
  | 'fitbit'
  | 'garmin'
  | 'bluetooth_device'
  | 'manual';

export type DataType =
  | 'steps'
  | 'distance'
  | 'gps_route'
  | 'heart_rate'
  | 'hrv'
  | 'sleep'
  | 'calories'
  | 'workout';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface GPSPoint {
  latitude: number;
  longitude: number;
  altitude?: number;
  speed?: number;
  timestamp: string;
}

export interface WorkoutValue {
  type: string; // e.g., running, cycling
  duration: number; // in seconds
  calories?: number;
  distance?: number;
  avgHeartRate?: number;
}

export type EventValue = number | GPSPoint[] | WorkoutValue | object;

export interface NormalizedEvent {
  eventId: string;
  userId: string;
  source: SourceType;
  dataType: DataType;
  value: EventValue;
  unit: string;
  timestamp: string; // ISO8601
  recordedAt: string; // ISO8601
  syncedAt: string; // ISO8601
  confidence: ConfidenceLevel;
}

export interface ConsentSettings {
  userId: string;
  grantedScopes: {
    [key in DataType]?: boolean;
  };
  updatedAt: string;
}

export interface ConnectionResult {
  success: boolean;
  error?: string;
  scopesGranted?: DataType[];
}

export interface Subscription {
  unsubscribe(): Promise<void>;
}

export interface WearableAdapter {
  connect(userId: string): Promise<ConnectionResult>;
  disconnect(userId: string): Promise<void>;
  fetchLatest(userId: string, dataTypes: DataType[]): Promise<NormalizedEvent[]>;
  subscribeToBackgroundUpdates(userId: string, callback: (event: NormalizedEvent) => void): Subscription;
  getSupportedDataTypes(): DataType[];
}
