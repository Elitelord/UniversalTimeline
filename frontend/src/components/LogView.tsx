'use client';

import { useMemo, useState } from 'react';
import { ListFilter, Monitor, Clock } from 'lucide-react';
import EventPopup from '@/components/EventPopup';
import {
  TimelineEvent,
  formatTime,
  formatDuration,
  filterShortEvents,
  formatDayHeader,
} from '@/lib/timeline-utils';
import { getActivityColor, RADIUS } from '@/lib/design-tokens';

interface LogViewProps {
  events: TimelineEvent[];
  date: string;
  isFullscreen?: boolean;
}

interface HourGroup {
  hour: number;
  label: string;
  events: TimelineEvent[];
}

export default function LogView({ events, date, isFullscreen = false }: LogViewProps) {
  const [expandedEvent, setExpandedEvent] = useState<TimelineEvent | null>(null);

  // Filter and sort events chronologically (newest first or chronological)
  const sortedEvents = useMemo(() => {
    return filterShortEvents(events).sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
  }, [events]);

  // Group events by hour of the day
  const hourGroups = useMemo(() => {
    const groups: HourGroup[] = [];
    const map = new Map<number, TimelineEvent[]>();

    for (let h = 0; h < 24; h++) {
      map.set(h, []);
    }

    for (const event of sortedEvents) {
      const start = new Date(event.start_time);
      const hour = start.getHours();
      const list = map.get(hour);
      if (list) {
        list.push(event);
      }
    }

    for (let h = 0; h < 24; h++) {
      const items = map.get(h) || [];
      if (items.length > 0) {
        const period = h >= 12 ? 'PM' : 'AM';
        const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
        groups.push({
          hour: h,
          label: `${displayHour}:00 ${period}`,
          events: items,
        });
      }
    }

    return groups;
  }, [sortedEvents]);

  // Compute total duration of all visible events
  const totalDurationMinutes = useMemo(() => {
    return sortedEvents.reduce((total, e) => {
      const start = new Date(e.start_time).getTime();
      const end = e.end_time ? new Date(e.end_time).getTime() : Date.now();
      return total + Math.max(0, (end - start) / 60000);
    }, 0);
  }, [sortedEvents]);

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
              {sortedEvents.length} {sortedEvents.length === 1 ? 'event' : 'events'}
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

        {/* Scrollable Event Log List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {sortedEvents.length === 0 ? (
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
                      {group.events.length} {group.events.length === 1 ? 'event' : 'events'}
                    </span>
                  </div>

                  {/* Hour Event Rows (Hairline Separators) */}
                  <div className="divide-y divide-zinc-800/20">
                    {group.events.map((event) => {
                      const colors = getActivityColor(event.activity_type);
                      const isRunning = !event.end_time;

                      return (
                        <div
                          key={event.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setExpandedEvent(event)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setExpandedEvent(event);
                            }
                          }}
                          className="flex items-center gap-4 px-6 py-2.5 hover:bg-zinc-800/30 transition-colors duration-150 cursor-pointer group focus:outline-none focus:bg-zinc-800/40"
                        >
                          {/* Time Column */}
                          <div className="w-20 shrink-0 font-mono text-xs text-zinc-400 text-right">
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
                              {event.activity_name}
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
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
