import { getOAuthConnection } from '../database/pg-client';

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string; // ISO8601
  endTime: string; // ISO8601
  isBusy: boolean;
  source: 'google_calendar' | 'ios_calendar';
}

export class CalendarAdapter {
  /**
   * Fetches calendar events between startTime and endTime.
   * If a Google Calendar token is linked, it acts as Google Calendar, otherwise defaults to local iOS Calendar.
   */
  async fetchEvents(userId: string, startTime: string, endTime: string): Promise<CalendarEvent[]> {
    // Check if Google Calendar OAuth is connected
    const conn = await getOAuthConnection(userId, 'google_calendar');
    const source = conn ? 'google_calendar' : 'ios_calendar';

    console.log(`CalendarAdapter: Fetching ${source} events for user ${userId} between ${startTime} and ${endTime}`);

    // Generate mock calendar events based on date ranges
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const events: CalendarEvent[] = [];

    // Create a few mock events: daily morning meetings, work hours, or personal appointments
    const dayMs = 24 * 3600 * 1000;
    for (let t = start; t < end; t += dayMs) {
      const dayStart = new Date(t);
      dayStart.setHours(9, 0, 0, 0); // 9:00 AM meeting

      const dayEnd = new Date(t);
      dayEnd.setHours(10, 0, 0, 0); // 10:00 AM end

      events.push({
        id: `cal-meeting-${t}`,
        title: 'Daily Standup Meeting',
        startTime: dayStart.toISOString(),
        endTime: dayEnd.toISOString(),
        isBusy: true,
        source
      });

      // Add a workout slot conflict on some days
      if (new Date(t).getDay() % 2 === 0) {
        const docStart = new Date(t);
        docStart.setHours(14, 0, 0, 0); // 2:00 PM

        const docEnd = new Date(t);
        docEnd.setHours(15, 0, 0, 0); // 3:00 PM

        events.push({
          id: `cal-personal-${t}`,
          title: 'Doctor Appointment',
          startTime: docStart.toISOString(),
          endTime: docEnd.toISOString(),
          isBusy: true,
          source
        });
      }
    }

    return events;
  }
}
