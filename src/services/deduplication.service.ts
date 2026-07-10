import { NormalizedEvent, DataType } from '../types';

export class DeduplicationService {
  private static SOURCE_PREFERENCE: Record<string, number> = {
    bluetooth_device: 5, // Chest HR strap, direct scale connection
    healthkit: 4,        // Apple Watch, premium ecosystem
    garmin: 4,           // Garmin watch
    fitbit: 3,           // Fitbit bands
    health_connect: 2,   // Android phone sensors
    manual: 1            // User inputted
  };

  private static CONFIDENCE_PREFERENCE: Record<string, number> = {
    high: 3,
    medium: 2,
    low: 1
  };

  /**
   * Compare two events and return the one with higher precedence/confidence.
   */
  private static getPreferredEvent(a: NormalizedEvent, b: NormalizedEvent): NormalizedEvent {
    const confA = this.CONFIDENCE_PREFERENCE[a.confidence] || 0;
    const confB = this.CONFIDENCE_PREFERENCE[b.confidence] || 0;

    if (confA !== confB) {
      return confA > confB ? a : b;
    }

    const prefA = this.SOURCE_PREFERENCE[a.source] || 0;
    const prefB = this.SOURCE_PREFERENCE[b.source] || 0;

    if (prefA !== prefB) {
      return prefA > prefB ? a : b;
    }

    // Default to the newer sync time if all else is equal
    return new Date(a.syncedAt).getTime() > new Date(b.syncedAt).getTime() ? a : b;
  }

  /**
   * Deduplicates a list of health events.
   * - Cumulative types (steps, calories, distance) are grouped into 15-minute time bins.
   *   For each bin, if there are multiple sources, we take the one with the highest precedence.
   * - Continuous types (heart_rate, hrv) are deduplicated if they fall within a 5-second window.
   * - Workouts and Sleep sessions are deduplicated if they overlap in time.
   */
  static deduplicate(events: NormalizedEvent[]): NormalizedEvent[] {
    if (events.length <= 1) return events;

    const cumulativeTypes: DataType[] = ['steps', 'calories', 'distance'];
    const instantTypes: DataType[] = ['heart_rate', 'hrv'];
    
    const results: NormalizedEvent[] = [];

    // Group events by dataType
    const groupedByType: Record<string, NormalizedEvent[]> = {};
    for (const event of events) {
      if (!groupedByType[event.dataType]) {
        groupedByType[event.dataType] = [];
      }
      groupedByType[event.dataType].push(event);
    }

    for (const type of Object.keys(groupedByType)) {
      const typeEvents = groupedByType[type];

      if (cumulativeTypes.includes(type as DataType)) {
        // Bin into 15-minute intervals (900000 ms)
        const BIN_SIZE_MS = 15 * 60 * 1000;
        const bins: Record<string, NormalizedEvent> = {};

        for (const event of typeEvents) {
          const t = new Date(event.timestamp).getTime();
          const binKey = Math.floor(t / BIN_SIZE_MS).toString();

          if (!bins[binKey]) {
            bins[binKey] = event;
          } else {
            bins[binKey] = this.getPreferredEvent(bins[binKey], event);
          }
        }

        results.push(...Object.values(bins));
      } else if (instantTypes.includes(type as DataType)) {
        // Sort chronologically
        typeEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        const deduplicatedInstants: NormalizedEvent[] = [];
        const WINDOW_MS = 5 * 1000; // 5 second window

        for (const event of typeEvents) {
          if (deduplicatedInstants.length === 0) {
            deduplicatedInstants.push(event);
            continue;
          }

          const lastEvent = deduplicatedInstants[deduplicatedInstants.length - 1];
          const lastTime = new Date(lastEvent.timestamp).getTime();
          const currTime = new Date(event.timestamp).getTime();

          if (currTime - lastTime < WINDOW_MS) {
            // Replace the last event with the preferred one
            deduplicatedInstants[deduplicatedInstants.length - 1] = this.getPreferredEvent(lastEvent, event);
          } else {
            deduplicatedInstants.push(event);
          }
        }

        results.push(...deduplicatedInstants);
      } else if (type === 'workout' || type === 'sleep') {
        // Deduplicate overlapping workouts or sleep windows
        // A workout or sleep session has duration or start/end times.
        // We will sort by start time (timestamp) and check overlap.
        typeEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        const deduplicatedSessions: NormalizedEvent[] = [];

        for (const event of typeEvents) {
          if (deduplicatedSessions.length === 0) {
            deduplicatedSessions.push(event);
            continue;
          }

          const lastEvent = deduplicatedSessions[deduplicatedSessions.length - 1];
          const lastStart = new Date(lastEvent.timestamp).getTime();
          
          let lastDurationMs = 0;
          if (type === 'workout' && (lastEvent.value as any).duration) {
            lastDurationMs = (lastEvent.value as any).duration * 1000;
          } else if (type === 'sleep') {
            lastDurationMs = Number(lastEvent.value) * 60 * 1000;
          }

          const lastEnd = lastStart + lastDurationMs;
          const currStart = new Date(event.timestamp).getTime();

          // If current session starts before the previous one ends, they overlap
          if (currStart < lastEnd) {
            deduplicatedSessions[deduplicatedSessions.length - 1] = this.getPreferredEvent(lastEvent, event);
          } else {
            deduplicatedSessions.push(event);
          }
        }

        results.push(...deduplicatedSessions);
      } else {
        // For other types (e.g. gps_route), keep all
        results.push(...typeEvents);
      }
    }

    return results;
  }
}
