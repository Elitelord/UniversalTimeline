'use client';

import { ChevronRight } from 'lucide-react';
import {
  TimelineEvent,
  ActivitySession,
  formatTime,
  formatDuration,
  formatTimeFromMinutes,
  splitOnMatch,
} from '@/lib/timeline-utils';
import { getActivityColor } from '@/lib/design-tokens';

/** What to call the items inside a session, by activity type. */
export function sessionItemNoun(activityType: string, count: number): string {
  const map: Record<string, [string, string]> = {
    browsing: ['page', 'pages'],
    coding: ['file', 'files'],
    communication: ['channel', 'channels'],
  };
  const [one, many] = map[activityType] ?? ['item', 'items'];
  return `${count} ${count === 1 ? one : many}`;
}

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

interface SessionRowProps {
  session: ActivitySession;
  onSelect: (session: ActivitySession) => void;
}

/**
 * A collapsed multi-event session (e.g. "Google Chrome · 6 pages"). Visually parallel
 * to EventRow, but the name column shows the app + item count and a chevron, and it
 * opens the session detail popup rather than a single event.
 */
export function SessionRow({ session, onSelect }: SessionRowProps) {
  const colors = getActivityColor(session.activityType);
  const isRunning = !session.end_time;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(session)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(session);
        }
      }}
      className="flex items-center gap-4 px-6 py-2.5 hover:bg-zinc-800/30 transition-colors duration-150 cursor-pointer group focus:outline-none focus:bg-zinc-800/40"
    >
      <div className="w-20 shrink-0 font-mono text-xs text-zinc-400 text-right">
        {formatTime(session.start_time)}
      </div>

      <div className={`w-2 h-2 rounded-full shrink-0 ${colors.bg}`} title={session.activityType} />

      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-sm font-medium text-zinc-200 truncate group-hover:text-white transition-colors">
          {session.appName}
        </span>
        <span className="shrink-0 text-[11px] font-mono text-zinc-500 bg-zinc-900/80 px-1.5 py-0.5 rounded border border-zinc-800/60">
          {sessionItemNoun(session.activityType, session.events.length)}
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 shrink-0" />
        {isRunning && (
          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            active
          </span>
        )}
      </div>

      <div className="hidden sm:block shrink-0">
        <span className={`text-[11px] font-medium capitalize ${colors.text}`}>
          {session.activityType}
        </span>
      </div>

      <div className="shrink-0 font-mono text-xs text-zinc-400 bg-zinc-900/80 px-2 py-0.5 rounded-md border border-zinc-800/60 min-w-[3.75rem] text-right">
        {isRunning ? 'Running' : formatTimeFromMinutes(session.activeMs / 60000)}
      </div>
    </div>
  );
}
