'use client';

import { useMemo, useState } from 'react';
import { Monitor, Clock } from 'lucide-react';
import EventPopup from '@/components/EventPopup';
import SessionPopup from '@/components/SessionPopup';
import EventRow, { SessionRow } from '@/components/EventRow';
import {
  TimelineEvent,
  ActivitySession,
  groupIntoSessions,
  formatDayHeader,
} from '@/lib/timeline-utils';
import { RADIUS, MIN_EVENT_DURATION_MS } from '@/lib/design-tokens';

interface LogViewProps {
  events: TimelineEvent[];
  date: string;
  isFullscreen?: boolean;
}

interface HourGroup {
  hour: number;
  label: string;
  sessions: ActivitySession[];
}

export default function LogView({ events, date, isFullscreen = false }: LogViewProps) {
  const [expandedEvent, setExpandedEvent] = useState<TimelineEvent | null>(null);
  const [expandedSession, setExpandedSession] = useState<ActivitySession | null>(null);

  // Group raw events into per-app sessions, then hide sessions too brief to matter.
  // Filtering by the SESSION total (not per-event) is what stops brief browsing from
  // vanishing now that each tab is its own event: four 20s tabs = an 80s session that
  // shows, with the tabs available on expand.
  const sessions = useMemo(() => {
    return groupIntoSessions(events).filter(
      (s) => s.end_time === null || s.activeMs >= MIN_EVENT_DURATION_MS
    );
  }, [events]);

  // Group sessions by the hour they start in
  const hourGroups = useMemo(() => {
    const groups: HourGroup[] = [];
    const map = new Map<number, ActivitySession[]>();

    for (let h = 0; h < 24; h++) map.set(h, []);

    for (const session of sessions) {
      const hour = new Date(session.start_time).getHours();
      map.get(hour)?.push(session);
    }

    for (let h = 0; h < 24; h++) {
      const items = map.get(h) || [];
      if (items.length > 0) {
        const period = h >= 12 ? 'PM' : 'AM';
        const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
        groups.push({ hour: h, label: `${displayHour}:00 ${period}`, sessions: items });
      }
    }

    return groups;
  }, [sessions]);

  // Total active time across visible sessions. Uses each session's completed-child
  // duration; an in-progress session's live elapsed time is counted once it closes
  // (avoids reading the clock during render).
  const totalDurationMinutes = useMemo(() => {
    return sessions.reduce((total, s) => total + s.activeMs / 60000, 0);
  }, [sessions]);

  return (
    <>
      <div
        className={`relative w-full ${RADIUS.surface} border border-zinc-800/40 bg-zinc-950/30 overflow-hidden flex flex-col`}
        style={{ height: isFullscreen ? '100vh' : 'calc(100vh - 220px)' }}
      >
        {/* Header Summary Bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800/60 bg-zinc-900/30">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-[0.15em] font-mono">
              {formatDayHeader(date)}
            </span>
            <span className="text-zinc-600">·</span>
            <span className="text-xs font-mono text-zinc-400">
              {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
            </span>
          </div>

          {totalDurationMinutes > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-400">
              <Clock className="w-3.5 h-3.5 text-zinc-500" />
              <span>
                {Math.floor(totalDurationMinutes / 60)}h {Math.round(totalDurationMinutes % 60)}m active
              </span>
            </div>
          )}
        </div>

        {/* Scrollable Session Log List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-24 text-zinc-500">
              <Monitor className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm font-medium text-zinc-400">No activity recorded for this day</p>
              <p className="text-xs mt-1 text-zinc-600">Events will appear here as they are synced</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/30">
              {hourGroups.map((group) => (
                <div key={group.hour} className="relative">
                  {/* Sticky Hour Header */}
                  <div className="sticky top-0 z-10 px-6 py-1.5 bg-zinc-950/95 backdrop-blur-md border-y border-zinc-800/40 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-[0.15em] font-mono">
                      {group.label}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-600">
                      {group.sessions.length} {group.sessions.length === 1 ? 'session' : 'sessions'}
                    </span>
                  </div>

                  {/* A single-event session renders as an ordinary row; a multi-event
                      one (e.g. a run of browser tabs) renders as a collapsed session. */}
                  <div className="divide-y divide-zinc-800/20">
                    {group.sessions.map((session) =>
                      session.events.length === 1 ? (
                        <EventRow
                          key={session.id}
                          event={session.events[0]}
                          onSelect={setExpandedEvent}
                        />
                      ) : (
                        <SessionRow
                          key={session.id}
                          session={session}
                          onSelect={setExpandedSession}
                        />
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Session detail (sits below the event popup so drill-down stacks on top) */}
      {expandedSession && (
        <SessionPopup
          session={expandedSession}
          onSelectEvent={setExpandedEvent}
          onClose={() => setExpandedSession(null)}
        />
      )}

      {/* Expanded Event Modal */}
      {expandedEvent && (
        <EventPopup
          event={expandedEvent}
          onClose={() => setExpandedEvent(null)}
        />
      )}
    </>
  );
}
