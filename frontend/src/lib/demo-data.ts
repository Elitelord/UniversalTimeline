// Demo data that is shown when the backend is unreachable.
// Generates events relative to the requested date so the timeline always looks populated.

export interface DemoEvent {
  id: string;
  user_id: string;
  device_id: string;
  activity_type: string;
  activity_name: string;
  start_time: string;
  end_time: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface DemoSummary {
  current_period: {
    total_active_time_minutes: number;
    activity_breakdown: Array<{
      activity_type: string;
      total_minutes: number;
      event_count: number;
    }>;
    top_applications: Array<{
      activity_name: string;
      activity_type: string;
      total_minutes: number;
    }>;
    time_series: Array<{
      date: string;
      activity_type: string;
      total_minutes: number;
    }>;
  };
  comparison_period: null;
}

const DEMO_SCHEDULE = [
  { start: 9,  duration: 105, type: 'coding',        name: 'VS Code' },
  { start: 10, duration: 15,  type: 'communication', name: 'Slack' },
  { start: 10, duration: 45,  type: 'browsing',      name: 'Chrome' },
  { start: 11, duration: 90,  type: 'coding',        name: 'VS Code' },
  { start: 12, duration: 20,  type: 'communication', name: 'Microsoft Teams' },
  { start: 13, duration: 60,  type: 'coding',        name: 'Android Studio' },
  { start: 14, duration: 30,  type: 'design',        name: 'Figma' },
  { start: 14, duration: 25,  type: 'browsing',      name: 'Chrome' },
  { start: 15, duration: 45,  type: 'coding',        name: 'VS Code' },
  { start: 16, duration: 20,  type: 'productivity',  name: 'Notion' },
  { start: 16, duration: 15,  type: 'communication', name: 'Discord' },
  { start: 17, duration: 35,  type: 'browsing',      name: 'Firefox' },
  { start: 17, duration: 50,  type: 'coding',        name: 'VS Code' },
  { start: 18, duration: 20,  type: 'productivity',  name: 'Obsidian' },
];

export function generateDemoTimeline(dateStr: string): DemoEvent[] {
  return DEMO_SCHEDULE.map((item, i) => {
    const startHour = item.start;
    const startMin = Math.floor(Math.random() * 20);
    const start = new Date(`${dateStr}T${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}:00.000Z`);
    const end = new Date(start.getTime() + item.duration * 60 * 1000);

    return {
      id: `demo-${i}`,
      user_id: 'demo-user',
      device_id: 'demo-device',
      activity_type: item.type,
      activity_name: item.name,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      metadata: null,
      created_at: start.toISOString(),
    };
  });
}

export function generateDemoSummary(dateStr: string): DemoSummary {
  const events = generateDemoTimeline(dateStr);

  // Build activity breakdown
  const breakdownMap = new Map<string, { total_minutes: number; event_count: number }>();
  for (const ev of events) {
    const dur = (new Date(ev.end_time).getTime() - new Date(ev.start_time).getTime()) / 60000;
    const existing = breakdownMap.get(ev.activity_type) || { total_minutes: 0, event_count: 0 };
    existing.total_minutes += dur;
    existing.event_count += 1;
    breakdownMap.set(ev.activity_type, existing);
  }

  const activity_breakdown = Array.from(breakdownMap.entries()).map(([type, data]) => ({
    activity_type: type,
    total_minutes: Math.round(data.total_minutes),
    event_count: data.event_count,
  }));

  // Build top applications
  const appMap = new Map<string, { type: string; total_minutes: number }>();
  for (const ev of events) {
    const dur = (new Date(ev.end_time).getTime() - new Date(ev.start_time).getTime()) / 60000;
    const existing = appMap.get(ev.activity_name) || { type: ev.activity_type, total_minutes: 0 };
    existing.total_minutes += dur;
    appMap.set(ev.activity_name, existing);
  }

  const top_applications = Array.from(appMap.entries())
    .map(([name, data]) => ({
      activity_name: name,
      activity_type: data.type,
      total_minutes: Math.round(data.total_minutes),
    }))
    .sort((a, b) => b.total_minutes - a.total_minutes)
    .slice(0, 5);

  const total_active_time_minutes = activity_breakdown.reduce((sum, b) => sum + b.total_minutes, 0);

  return {
    current_period: {
      total_active_time_minutes,
      activity_breakdown,
      top_applications,
      time_series: activity_breakdown.map(b => ({
        date: dateStr,
        activity_type: b.activity_type,
        total_minutes: b.total_minutes,
      })),
    },
    comparison_period: null,
  };
}
