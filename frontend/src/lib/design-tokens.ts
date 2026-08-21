// --- Activity Type Colors ---
// Each activity type has Tailwind utility classes for badges, tinted backgrounds/borders,
// and text colors, along with a raw hex value for Recharts/SVG canvas rendering.

export interface ActivityTypeToken {
  value: string;
  label: string;
  hex: string;
  color: string; // Solid badge dot color
  /**
   * 'activity' — time actually spent doing something. Counts toward duration totals
   *   and gets a line on the trend chart.
   * 'signal' — a point-in-time fact (a notification arriving, the screen turning on).
   *   These have near-zero duration by nature, so including them in "hours spent"
   *   would be misleading. Filterable, but excluded from duration views.
   */
  kind: 'activity' | 'signal';
  tw: {
    bg: string;
    tintBg: string;
    tintBorder: string;
    text: string;
  };
}

// Every activity_type the clients can emit must appear here. This one array drives
// the trend-chart series, the filter chips, and every color lookup — so a type that
// is missing is not merely uncolored, it is invisible: it gets no line on the trend
// chart and no chip to filter by. Before these six were added, 87% of all tracked
// time (66 of 76 hours) was silently absent from the trend chart.
//
// Producers, for reference:
//   coding/browsing/communication/design/productivity/other  -> Windows (ActivityTracker.ClassifyActivity)
//   browsing/communication/productivity/media/application    -> Android (UsageTracker.classifyActivity)
//   notification                                             -> Android (NotificationTracker)
//   screen/idle                                              -> Android (ScreenReceiver)
export const ACTIVITY_TYPES: readonly ActivityTypeToken[] = [
  {
    value: 'coding',
    label: 'Coding',
    hex: '#3b82f6',
    color: 'bg-blue-500',
    kind: 'activity',
    tw: {
      bg: 'bg-blue-500',
      tintBg: 'bg-blue-500/10',
      tintBorder: 'border-blue-500/20',
      text: 'text-blue-400',
    },
  },
  {
    value: 'browsing',
    label: 'Browsing',
    hex: '#10b981',
    color: 'bg-emerald-500',
    kind: 'activity',
    tw: {
      bg: 'bg-emerald-500',
      tintBg: 'bg-emerald-500/10',
      tintBorder: 'border-emerald-500/20',
      text: 'text-emerald-400',
    },
  },
  {
    value: 'communication',
    label: 'Communication',
    hex: '#a855f7',
    color: 'bg-purple-500',
    kind: 'activity',
    tw: {
      bg: 'bg-purple-500',
      tintBg: 'bg-purple-500/10',
      tintBorder: 'border-purple-500/20',
      text: 'text-purple-400',
    },
  },
  {
    value: 'design',
    label: 'Design',
    hex: '#f59e0b',
    color: 'bg-amber-500',
    kind: 'activity',
    tw: {
      bg: 'bg-amber-500',
      tintBg: 'bg-amber-500/10',
      tintBorder: 'border-amber-500/20',
      text: 'text-amber-400',
    },
  },
  {
    value: 'productivity',
    label: 'Productivity',
    hex: '#14b8a6',
    color: 'bg-teal-500',
    kind: 'activity',
    tw: {
      bg: 'bg-teal-500',
      tintBg: 'bg-teal-500/10',
      tintBorder: 'border-teal-500/20',
      text: 'text-teal-400',
    },
  },
  {
    value: 'media',
    label: 'Media',
    hex: '#ec4899',
    color: 'bg-pink-500',
    kind: 'activity',
    tw: {
      bg: 'bg-pink-500',
      tintBg: 'bg-pink-500/10',
      tintBorder: 'border-pink-500/20',
      text: 'text-pink-400',
    },
  },
  {
    // Android's fallback for any foreground app its classifier doesn't recognise.
    // The single largest bucket in the data (1,930 events).
    value: 'application',
    label: 'Apps',
    hex: '#6366f1',
    color: 'bg-indigo-500',
    kind: 'activity',
    tw: {
      bg: 'bg-indigo-500',
      tintBg: 'bg-indigo-500/10',
      tintBorder: 'border-indigo-500/20',
      text: 'text-indigo-400',
    },
  },
  {
    // Windows' fallback, from ActivityEvent.cs's default and ClassifyActivity's
    // final case. The server-side classifier should shrink this over time.
    value: 'other',
    label: 'Other',
    hex: '#94a3b8',
    color: 'bg-slate-400',
    kind: 'activity',
    tw: {
      bg: 'bg-slate-400',
      tintBg: 'bg-slate-400/10',
      tintBorder: 'border-slate-400/20',
      text: 'text-slate-300',
    },
  },
  {
    // Produced by the server-side classifier for shells and system UI
    // (explorer, SearchHost, lock screen) — real foreground time, but not
    // something you chose to do.
    value: 'system',
    label: 'System',
    hex: '#a1a1aa',
    color: 'bg-zinc-400',
    kind: 'activity',
    tw: {
      bg: 'bg-zinc-400',
      tintBg: 'bg-zinc-400/10',
      tintBorder: 'border-zinc-400/20',
      text: 'text-zinc-300',
    },
  },
  {
    value: 'notification',
    label: 'Notifications',
    hex: '#f97316',
    color: 'bg-orange-500',
    kind: 'signal',
    tw: {
      bg: 'bg-orange-500',
      tintBg: 'bg-orange-500/10',
      tintBorder: 'border-orange-500/20',
      text: 'text-orange-400',
    },
  },
  {
    value: 'screen',
    label: 'Screen on/off',
    hex: '#22d3ee',
    color: 'bg-cyan-400',
    kind: 'signal',
    tw: {
      bg: 'bg-cyan-400',
      tintBg: 'bg-cyan-400/10',
      tintBorder: 'border-cyan-400/20',
      text: 'text-cyan-300',
    },
  },
  {
    value: 'idle',
    label: 'Idle',
    hex: '#64748b',
    color: 'bg-slate-500',
    kind: 'signal',
    tw: {
      bg: 'bg-slate-500',
      tintBg: 'bg-slate-500/10',
      tintBorder: 'border-slate-500/20',
      text: 'text-slate-400',
    },
  },
] as const;

/** Types representing real elapsed time — the only ones that belong in duration totals. */
export const DURATION_ACTIVITY_TYPES: readonly ActivityTypeToken[] = ACTIVITY_TYPES.filter(
  (t) => t.kind === 'activity'
);

/** Point-in-time types, rendered separately in the filter bar. */
export const SIGNAL_ACTIVITY_TYPES: readonly ActivityTypeToken[] = ACTIVITY_TYPES.filter(
  (t) => t.kind === 'signal'
);

/** True for types that measure elapsed time rather than mark an instant. */
export function isDurationType(type?: string | null): boolean {
  return getActivityToken(type).kind !== 'signal';
}

// Fallback for a type no client is known to emit. Treated as an activity so that
// unexpected future types still count toward totals rather than vanishing.
export const DEFAULT_ACTIVITY_COLOR = {
  hex: '#71717a',
  color: 'bg-zinc-500',
  kind: 'activity' as const,
  tw: {
    bg: 'bg-zinc-500',
    tintBg: 'bg-zinc-500/10',
    tintBorder: 'border-zinc-500/20',
    text: 'text-zinc-400',
  },
};

const ACTIVITY_TOKEN_MAP = new Map<string, ActivityTypeToken>(
  ACTIVITY_TYPES.map((t) => [t.value.toLowerCase(), t])
);

export function getActivityToken(type?: string | null): ActivityTypeToken | typeof DEFAULT_ACTIVITY_COLOR {
  if (!type) return DEFAULT_ACTIVITY_COLOR;
  return ACTIVITY_TOKEN_MAP.get(type.toLowerCase()) ?? DEFAULT_ACTIVITY_COLOR;
}

export function getActivityColor(type?: string | null) {
  return getActivityToken(type).tw;
}

export function getActivityHex(type?: string | null): string {
  return getActivityToken(type).hex;
}

// --- Layout & Zoom Constants ---
export const HOUR_HEIGHT_BASE = 80;          // px per hour at zoom 1.0
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3.0;
export const ZOOM_STEP_BUTTON = 0.25;
export const ZOOM_STEP_WHEEL = 0.1;
export const MIN_EVENT_DURATION_MS = 60_000; // 1 minute filter threshold
export const MIN_EVENT_RENDER_HEIGHT = 6;    // px, smallest clickable capsule

// --- Radius Discipline (ai-design-tells.md §19) ---
// Two named roles only. No rounded-2xl or rounded-3xl.
export const RADIUS = {
  control: 'rounded-lg', // buttons, inputs, chips, small tiles (8px)
  surface: 'rounded-xl', // cards, panels, modals (12px)
} as const;

// --- View Modes ---
export type TimelineViewMode = 'log' | 'vertical' | 'calendar' | 'swimlane';
export const DEFAULT_VIEW_MODE: TimelineViewMode = 'log';
export const VIEW_MODE_STORAGE_KEY = 'timeline-view-preference';
