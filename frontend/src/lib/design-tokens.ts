// --- Activity Type Colors ---
// Each activity type has Tailwind utility classes for badges, tinted backgrounds/borders,
// and text colors, along with a raw hex value for Recharts/SVG canvas rendering.

export interface ActivityTypeToken {
  value: string;
  label: string;
  hex: string;
  color: string; // Solid badge dot color
  tw: {
    bg: string;
    tintBg: string;
    tintBorder: string;
    text: string;
  };
}

export const ACTIVITY_TYPES: readonly ActivityTypeToken[] = [
  {
    value: 'coding',
    label: 'Coding',
    hex: '#3b82f6',
    color: 'bg-blue-500',
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
    tw: {
      bg: 'bg-teal-500',
      tintBg: 'bg-teal-500/10',
      tintBorder: 'border-teal-500/20',
      text: 'text-teal-400',
    },
  },
] as const;

export const DEFAULT_ACTIVITY_COLOR = {
  hex: '#71717a',
  color: 'bg-zinc-500',
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
