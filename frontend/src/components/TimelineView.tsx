'use client';

import { useMemo } from 'react';

interface TimelineEvent {
  id: string;
  activity_type: string;
  activity_name: string;
  start_time: string;
  end_time: string | null;
}

interface TimelineViewProps {
  events: TimelineEvent[];
  date: string;
}

const ACTIVITY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  coding:        { bg: 'bg-blue-500/20',   border: 'border-blue-500/50',   text: 'text-blue-300' },
  browsing:      { bg: 'bg-green-500/20',  border: 'border-green-500/50',  text: 'text-green-300' },
  communication: { bg: 'bg-purple-500/20', border: 'border-purple-500/50', text: 'text-purple-300' },
  design:        { bg: 'bg-orange-500/20', border: 'border-orange-500/50', text: 'text-orange-300' },
  productivity:  { bg: 'bg-teal-500/20',   border: 'border-teal-500/50',   text: 'text-teal-300' },
};

const DEFAULT_COLOR = { bg: 'bg-gray-500/20', border: 'border-gray-500/50', text: 'text-gray-300' };

const HOUR_HEIGHT = 80; // px per hour
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDuration(startTime: Date, endTime: Date): string {
  const diffMs = endTime.getTime() - startTime.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
}

export default function TimelineView({ events, date }: TimelineViewProps) {
  // Calculate positions for each event
  const positionedEvents = useMemo(() => {
    const dayStart = new Date(date + 'T00:00:00');

    return events
      .filter((e) => e.end_time)
      .map((event) => {
        const start = new Date(event.start_time);
        const end = new Date(event.end_time!);
        const startHour = (start.getTime() - dayStart.getTime()) / 3600000;
        const endHour = (end.getTime() - dayStart.getTime()) / 3600000;
        const top = Math.max(0, startHour) * HOUR_HEIGHT;
        const height = Math.max((endHour - Math.max(0, startHour)) * HOUR_HEIGHT, 4);
        const colors = ACTIVITY_COLORS[event.activity_type] || DEFAULT_COLOR;

        return { ...event, top, height, colors, startDate: start, endDate: end };
      });
  }, [events, date]);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-500">
        <svg className="w-16 h-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-lg font-medium">No events for this day</p>
        <p className="text-sm mt-1">Activity will appear here once tracked</p>
      </div>
    );
  }

  return (
    <div className="relative flex">
      {/* Hour labels */}
      <div className="w-20 shrink-0 pr-3">
        {HOURS.map((hour) => (
          <div
            key={hour}
            className="text-right text-xs text-gray-500 font-mono"
            style={{ height: HOUR_HEIGHT }}
          >
            {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
          </div>
        ))}
      </div>

      {/* Timeline grid + events */}
      <div className="flex-1 relative" style={{ height: 24 * HOUR_HEIGHT }}>
        {/* Hour grid lines */}
        {HOURS.map((hour) => (
          <div
            key={hour}
            className="absolute left-0 right-0 border-t border-gray-800/60"
            style={{ top: hour * HOUR_HEIGHT }}
          />
        ))}

        {/* Current time indicator */}
        <CurrentTimeIndicator date={date} />

        {/* Event blocks */}
        {positionedEvents.map((event) => (
          <div
            key={event.id}
            className={`absolute left-2 right-2 rounded-lg border ${event.colors.bg} ${event.colors.border} 
                        backdrop-blur-sm overflow-hidden cursor-default
                        hover:brightness-125 transition-all duration-200 group`}
            style={{ top: event.top, height: event.height }}
          >
            <div className="px-3 py-1.5 h-full flex flex-col justify-center">
              <div className={`text-sm font-semibold truncate ${event.colors.text}`}>
                {event.activity_name}
              </div>
              {event.height > 40 && (
                <div className="text-xs text-gray-400 mt-0.5 truncate">
                  {formatTime(event.startDate)} – {formatTime(event.endDate)} · {formatDuration(event.startDate, event.endDate)}
                </div>
              )}
            </div>

            {/* Tooltip on hover */}
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 
                            hidden group-hover:block pointer-events-none">
              <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
                <p className={`font-semibold text-sm ${event.colors.text}`}>{event.activity_name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{event.activity_type}</p>
                <p className="text-xs text-gray-300 mt-1">
                  {formatTime(event.startDate)} – {formatTime(event.endDate)}
                </p>
                <p className="text-xs text-gray-400">
                  Duration: {formatDuration(event.startDate, event.endDate)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CurrentTimeIndicator({ date }: { date: string }) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  if (date !== today) return null;

  const hourOfDay = now.getHours() + now.getMinutes() / 60;
  const top = hourOfDay * HOUR_HEIGHT;

  return (
    <div className="absolute left-0 right-0 z-30 pointer-events-none" style={{ top }}>
      <div className="flex items-center">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-lg shadow-red-500/50 -ml-1" />
        <div className="flex-1 h-px bg-red-500/60" />
      </div>
    </div>
  );
}
