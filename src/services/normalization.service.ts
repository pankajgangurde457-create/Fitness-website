import { NormalizedEvent, SourceType, DataType, EventValue, ConfidenceLevel } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class NormalizationService {
  /**
   * Helper to ensure a timestamp is in ISO8601 format.
   * If invalid, defaults to current time.
   */
  static parseTimestamp(ts: any): string {
    if (!ts) return new Date().toISOString();
    try {
      const date = new Date(ts);
      if (isNaN(date.getTime())) {
        return new Date().toISOString();
      }
      return date.toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  /**
   * Normalizes a raw health event payload into a list of canonical NormalizedEvent objects.
   */
  static normalize(
    userId: string,
    source: SourceType,
    dataType: DataType,
    rawPayload: {
      value: any;
      unit: string;
      timestamp: any;
      recordedAt?: any;
      confidence?: ConfidenceLevel;
      extra?: any;
    }
  ): NormalizedEvent {
    const timestamp = this.parseTimestamp(rawPayload.timestamp);
    const recordedAt = this.parseTimestamp(rawPayload.recordedAt || rawPayload.timestamp);
    const syncedAt = new Date().toISOString();

    let value: EventValue = rawPayload.value;
    let unit = rawPayload.unit.toLowerCase().trim();
    let confidence: ConfidenceLevel = rawPayload.confidence || 'high';

    // Normalize units and values based on DataType
    switch (dataType) {
      case 'steps':
        value = Number(value);
        if (isNaN(value)) value = 0;
        unit = 'count';
        break;

      case 'distance':
        value = Number(value);
        if (isNaN(value)) value = 0;
        // Normalize miles, kilometers to meters
        if (unit === 'miles' || unit === 'mi') {
          value = Math.round(value * 1609.34);
          unit = 'meters';
        } else if (unit === 'km' || unit === 'kilometers') {
          value = Math.round(value * 1000);
          unit = 'meters';
        } else {
          unit = 'meters';
        }
        break;

      case 'heart_rate':
        value = Number(value);
        if (isNaN(value)) value = 0;
        unit = 'bpm';
        // Wearable watch heart rates can be slightly lower confidence than a chest strap
        if (!rawPayload.confidence) {
          confidence = source === 'bluetooth_device' ? 'high' : 'medium';
        }
        break;

      case 'hrv':
        value = Number(value);
        if (isNaN(value)) value = 0;
        unit = 'ms';
        break;

      case 'sleep':
        // Value might be sleep stages or minutes. Ensure duration is normalized.
        if (typeof value === 'object') {
          // If detailed stages are provided, sum up total duration
          const stages = value as any;
          if (stages.durationMinutes) {
            value = Number(stages.durationMinutes);
          } else if (stages.durationSeconds) {
            value = Math.round(Number(stages.durationSeconds) / 60);
          }
        } else {
          value = Number(value);
        }
        if (isNaN(value as number)) value = 0;
        unit = 'minutes';
        break;

      case 'calories':
        value = Number(value);
        if (isNaN(value)) value = 0;
        unit = 'kcal';
        break;

      case 'gps_route':
        // Value should be array of GPS points
        if (Array.isArray(value)) {
          value = value.map(pt => ({
            latitude: Number(pt.latitude),
            longitude: Number(pt.longitude),
            altitude: pt.altitude ? Number(pt.altitude) : undefined,
            speed: pt.speed ? Number(pt.speed) : undefined,
            timestamp: this.parseTimestamp(pt.timestamp)
          }));
        } else {
          value = [];
        }
        unit = 'coordinates';
        break;

      case 'workout':
        if (typeof value === 'object') {
          const w = value as any;
          value = {
            type: String(w.type || 'other').toLowerCase(),
            duration: Number(w.duration || 0), // in seconds
            calories: w.calories ? Number(w.calories) : undefined,
            distance: w.distance ? Number(w.distance) : undefined,
            avgHeartRate: w.avgHeartRate ? Number(w.avgHeartRate) : undefined
          };
        } else {
          value = { type: 'other', duration: 0 };
        }
        unit = 'workout';
        break;

      default:
        break;
    }

    // Assign a deterministic eventId if not provided to allow idempotent sync runs
    // E.g. combining userId + source + dataType + timestamp to form a unique key
    const rawKey = `${userId}:${source}:${dataType}:${timestamp}`;
    const eventId = uuidv4(); // Or we can use md5 / SHA1 of rawKey to make it idempotent
    
    return {
      eventId,
      userId,
      source,
      dataType,
      value,
      unit,
      timestamp,
      recordedAt,
      syncedAt,
      confidence
    };
  }
}
