'use client';

import { List, Calendar, CalendarDays, Rows3 } from 'lucide-react';
import { TimelineViewMode, RADIUS } from '@/lib/design-tokens';

interface ViewSwitcherProps {
  activeView: TimelineViewMode;
  onChange: (view: TimelineViewMode) => void;
  /** Search results replace the active view, so switching views has no effect. */
  disabled?: boolean;
}

interface ViewOption {
  value: TimelineViewMode;
  label: string;
  icon: typeof List;
}

const VIEW_OPTIONS: readonly ViewOption[] = [
  { value: 'log', label: 'Log', icon: List },
  { value: 'vertical', label: 'Vertical', icon: Calendar },
  { value: 'calendar', label: 'Week', icon: CalendarDays },
  { value: 'swimlane', label: 'Swimlane', icon: Rows3 },
] as const;

export default function ViewSwitcher({ activeView, onChange, disabled = false }: ViewSwitcherProps) {
  return (
    <div
      className={`flex items-center transition-opacity duration-150 ${
        disabled ? 'opacity-40 pointer-events-none' : ''
      }`}
      aria-hidden={disabled}
    >
      {/* Desktop & Tablet Segmented Control */}
      <div className={`hidden sm:flex items-center gap-0.5 bg-zinc-900/60 p-0.5 ${RADIUS.control} border border-zinc-800`}>
        {VIEW_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isActive = activeView === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              disabled={disabled}
              className={`flex items-center gap-1.5 px-3 py-1.5 ${RADIUS.control} text-xs font-medium transition-colors duration-150 cursor-pointer ${
                isActive
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
              title={`${opt.label} view`}
              type="button"
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Mobile Dropdown */}
      <div className="sm:hidden relative">
        <select
          value={activeView}
          onChange={(e) => onChange(e.target.value as TimelineViewMode)}
          disabled={disabled}
          aria-label="Select timeline view"
          className={`px-3 py-1.5 bg-zinc-900 border border-zinc-800 ${RADIUS.control} text-zinc-200 text-xs font-medium
                     focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:border-zinc-500 cursor-pointer [color-scheme:dark]`}
        >
          {VIEW_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label} View
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
