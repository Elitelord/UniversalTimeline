import {
  getActivityColor,
  MIN_EVENT_DURATION_MS,
  MIN_EVENT_RENDER_HEIGHT,
} from './design-tokens';

export interface TimelineEvent {
  id: string;
  activity_type: string;
  activity_name: string;
  start_time: string;
  end_time: string | null;
  metadata?: Record<string, any> | null;
}

export interface PositionedEvent extends TimelineEvent {
  top: number;
  height: number;
  colors: { bg: string; tintBg: string; tintBorder: string; text: string };
  startDate: Date;
  endDate: Date;
  column: number;
  columnsCount: number;
}

/**
 * Formats a Date or ISO date string into a 12-hour time (e.g. "9:02 AM").
 */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/**
 * Formats the duration between two timestamps into human-readable compact form (e.g. "45m", "1h 15m", "2h").
 */
export function formatDuration(startTime: Date | string, endTime: Date | string): string {
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
  const end = typeof endTime === 'string' ? new Date(endTime) : endTime;
  const diffMs = Math.max(0, end.getTime() - start.getTime());
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
}

/**
 * Formats a total minute count into "Xh Ym" or "Ym".
 */
export function formatTimeFromMinutes(mins: number): string {
  const hours = Math.floor(mins / 60);
  const remaining = Math.round(mins % 60);
  if (hours === 0) return `${remaining}m`;
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
}

/**
 * Returns a date formatted as "YYYY-MM-DD" in the user's local timezone.
 */
export function getLocalDateString(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA');
}

/**
 * Returns a date string shifted by N days from the anchorDateStr.
 */
export function getShiftedDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return getLocalDateString(d);
}

/**
 * Formats a YYYY-MM-DD date string into a header title (e.g. "Tuesday · Aug 18" or "Today · Tuesday, Aug 18").
 */
export function formatDayHeader(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const today = getLocalDateString();
  const yesterday = getShiftedDate(today, -1);
  const tomorrow = getShiftedDate(today, 1);

  const formatted = d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  if (dateStr === today) return `Today · ${formatted}`;
  if (dateStr === yesterday) return `Yesterday · ${formatted}`;
  if (dateStr === tomorrow) return `Tomorrow · ${formatted}`;
  return formatted;
}

/**
 * Discards completed events shorter than the minimum duration threshold (default: 60s).
 * Currently running events (end_time == null) are always retained.
 */
export function filterShortEvents(
  events: TimelineEvent[],
  minDurationMs: number = MIN_EVENT_DURATION_MS
): TimelineEvent[] {
  return events.filter((e) => {
    if (!e.end_time) return true;
    const diffMs = new Date(e.end_time).getTime() - new Date(e.start_time).getTime();
    return diffMs >= minDurationMs;
  });
}

/**
 * Groups events by their starting hour (0 to 23) in the user's local timezone.
 */
export function groupEventsByHour(events: TimelineEvent[]): Map<number, TimelineEvent[]> {
  const map = new Map<number, TimelineEvent[]>();
  for (let i = 0; i < 24; i++) {
    map.set(i, []);
  }

  for (const event of events) {
    const start = new Date(event.start_time);
    const hour = start.getHours();
    const list = map.get(hour);
    if (list) {
      list.push(event);
    }
  }

  return map;
}

/**
 * Groups events by their starting date (YYYY-MM-DD) in local time.
 */
export function groupEventsByDay(events: TimelineEvent[]): Map<string, TimelineEvent[]> {
  const map = new Map<string, TimelineEvent[]>();
  for (const event of events) {
    const dayKey = getLocalDateString(new Date(event.start_time));
    const list = map.get(dayKey) ?? [];
    list.push(event);
    map.set(dayKey, list);
  }
  return map;
}

/**
 * Calculates start/end dates for the entire week (Monday to Sunday) containing anchorDateStr.
 */
export function getWeekRange(anchorDateStr: string): { start: string; end: string; days: string[] } {
  const anchor = new Date(anchorDateStr + 'T00:00:00');
  const day = anchor.getDay();
  const diffToMonday = anchor.getDate() - day + (day === 0 ? -6 : 1);

  const monday = new Date(anchor.setDate(diffToMonday));
  const days: string[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(getLocalDateString(d));
  }

  return {
    start: days[0],
    end: days[6],
    days,
  };
}

/**
 * Computes positional layout and resolves multi-column overlaps for 24-hour calendar/timeline views.
 */
export function computePositionedEvents(
  events: TimelineEvent[],
  dateStr: string,
  hourHeight: number
): PositionedEvent[] {
  const dayStart = new Date(dateStr + 'T00:00:00');

  const filtered = filterShortEvents(events);

  const basicEvents: PositionedEvent[] = filtered
    .map((event) => {
      const start = new Date(event.start_time);
      const end = event.end_time ? new Date(event.end_time) : new Date();
      const startHour = (start.getTime() - dayStart.getTime()) / 3600000;
      const endHour = (end.getTime() - dayStart.getTime()) / 3600000;
      const top = Math.max(0, startHour) * hourHeight;
      const actualHeight = (endHour - Math.max(0, startHour)) * hourHeight;
      const height = Math.max(actualHeight, MIN_EVENT_RENDER_HEIGHT);
      const colors = getActivityColor(event.activity_type);

      return {
        ...event,
        top,
        height,
        colors,
        startDate: start,
        endDate: end,
        column: 0,
        columnsCount: 1,
      };
    })
    .sort((a, b) => a.top - b.top || b.height - a.height);

  // Group overlapping events into clusters
  const groups: PositionedEvent[][] = [];

  for (const event of basicEvents) {
    let placed = false;
    for (const group of groups) {
      const overlaps = group.some(
        (member) => event.top < member.top + member.height && event.top + event.height > member.top
      );
      if (overlaps) {
        group.push(event);
        placed = true;
        break;
      }
    }
    if (!placed) {
      groups.push([event]);
    }
  }

  // Assign columns greedily within each cluster
  for (const group of groups) {
    const columns: number[] = [];
    for (const event of group) {
      let colIndex = 0;
      while (colIndex < columns.length && event.top < columns[colIndex]) {
        colIndex++;
      }
      event.column = colIndex;
      if (colIndex < columns.length) {
        columns[colIndex] = event.top + event.height;
      } else {
        columns.push(event.top + event.height);
      }
    }
    const totalCols = columns.length;
    for (const event of group) {
      event.columnsCount = totalCols;
    }
  }

  return basicEvents;
}
