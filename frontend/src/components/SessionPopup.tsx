'use client';

import { useEffect } from 'react';
import { X, Clock, ChevronRight } from 'lucide-react';
import {
  ActivitySession,
  TimelineEvent,
  formatTime,
  formatDuration,
  formatTimeFromMinutes,
} from '@/lib/timeline-utils';
import { getActivityColor, RADIUS } from '@/lib/design-tokens';
import { sessionItemNoun } from './EventRow';

interface SessionPopupProps {
  session: ActivitySession;
  /** Drill into a single child event (opens the full EventPopup over this one). */
  onSelectEvent: (event: TimelineEvent) => void;
  onClose: () => void;
}

/**
 * Detail view for a collapsed session: the app header plus the individual items
 * (browser tabs, edited files, …) captured within it. Each item drills into its own
 * EventPopup. Sits one z-layer below EventPopup so that drill-down stacks on top.
 */
export default function SessionPopup({ session, onSelectEvent, onClose }: SessionPopupProps) {
  const colors = getActivityColor(session.activityType);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const lastEnd = session.events[session.events.length - 1].end_time;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-popup-title"
        className={`relative w-full max-w-md bg-zinc-900 border ${colors.tintBorder} ${RADIUS.surface} shadow-lg overflow-hidden`}
      >
        <div className={`h-1.5 w-full ${colors.bg}`} />

        <div className="p-5">
          <div className="flex justify-between items-start gap-4 mb-4">
            <div>
              <h2 id="session-popup-title" className={`text-base font-semibold ${colors.text} leading-tight`}>
                {session.appName}
              </h2>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="inline-block px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 capitalize border border-zinc-700/50">
                  {session.activityType}
                </span>
                <span className="text-xs font-mono text-zinc-500">
                  {sessionItemNoun(session.activityType, session.events.length)}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors duration-150 cursor-pointer"
              title="Close (Esc)"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2.5 text-sm text-zinc-400 bg-zinc-950/50 p-2.5 rounded-lg border border-zinc-800/50 mb-4">
            <Clock className="w-4 h-4 shrink-0 text-zinc-500" />
            <div>
              <p className="font-mono text-xs text-zinc-200">
                {formatTime(session.start_time)} – {lastEnd ? formatTime(lastEnd) : 'Now'}
              </p>
              <p className="font-mono text-xs text-zinc-500 mt-0.5">
                Active: {formatTimeFromMinutes(session.activeMs / 60000)}
              </p>
            </div>
          </div>

          {/* The individual items captured in this session */}
          <h3 className="text-[11px] font-medium text-zinc-500 uppercase tracking-[0.15em] mb-2">
            Details
          </h3>
          <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar -mx-1 px-1">
            {session.events.map((ev) => (
              <button
                key={ev.id}
                onClick={() => onSelectEvent(ev)}
                className="w-full flex items-center gap-3 p-2 rounded-lg text-left hover:bg-zinc-800/50 transition-colors duration-100 cursor-pointer group"
                type="button"
              >
                <span className="font-mono text-[11px] text-zinc-500 shrink-0 w-14 text-right">
                  {formatTime(ev.start_time)}
                </span>
                <span className="flex-1 min-w-0 text-sm text-zinc-300 truncate group-hover:text-zinc-100">
                  {ev.activity_name}
                </span>
                <span className="font-mono text-[11px] text-zinc-500 shrink-0">
                  {ev.end_time ? formatDuration(ev.start_time, ev.end_time) : 'Running'}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
