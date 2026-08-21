'use client';

import {
  TimelineEvent,
  formatTime,
  formatDuration,
  splitOnMatch,
} from '@/lib/timeline-utils';
import { getActivityColor } from '@/lib/design-tokens';

interface EventRowProps {
  event: TimelineEvent;
  onSelect: (event: TimelineEvent) => void;
  /** When set, occurrences of this text in the activity name are marked. */
  highlight?: string;
  /** Shows the date alongside the time; used by cross-day result lists. */
  showDate?: boolean;
}

function Highlighted({ text, query }: { text: string; query?: string }) {
  if (!query) return <>{text}</>;
  return (
    <>
      {splitOnMatch(text, query).map((segment, i) =>
        segment.match ? (
          <mark key={i} className="bg-amber-400/20 text-amber-200 rounded-sm px-0.5">
            {segment.text}
          </mark>
        ) : (
          <span key={i}>{segment.text}</span>
        )
      )}
    </>
  );
}

/**
 * A single activity row. Shared by LogView and SearchResultsView so the two lists
 * stay visually identical as either evolves.
 */
export default function EventRow({ event, onSelect, highlight, showDate }: EventRowProps) {
  const colors = getActivityColor(event.activity_type);
  const isRunning = !event.end_time;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(event)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(event);
        }
      }}
      className="flex items-center gap-4 px-6 py-2.5 hover:bg-zinc-800/30 transition-colors duration-150 cursor-pointer group focus:outline-none focus:bg-zinc-800/40"
    >
      {/* Time Column */}
      <div
        className={`${showDate ? 'w-32' : 'w-20'} shrink-0 font-mono text-xs text-zinc-400 text-right`}
      >
        {showDate && (
          <span className="text-zinc-600 mr-1.5">
            {new Date(event.start_time).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        )}
        {formatTime(event.start_time)}
      </div>

      {/* Category Dot */}
      <div
        className={`w-2 h-2 rounded-full shrink-0 ${colors.bg}`}
        title={event.activity_type}
      />

      {/* App & Activity Name */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-sm font-medium text-zinc-200 truncate group-hover:text-white transition-colors">
          <Highlighted text={event.activity_name} query={highlight} />
        </span>
        {isRunning && (
          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            active
          </span>
        )}
      </div>

      {/* Category Tag */}
      <div className="hidden sm:block shrink-0">
        <span className={`text-[11px] font-medium capitalize ${colors.text}`}>
          {event.activity_type}
        </span>
      </div>

      {/* Duration Badge */}
      <div className="shrink-0 font-mono text-xs text-zinc-400 bg-zinc-900/80 px-2 py-0.5 rounded-md border border-zinc-800/60 min-w-[3.75rem] text-right">
        {event.end_time ? formatDuration(event.start_time, event.end_time) : 'Running'}
      </div>
    </div>
  );
}
