'use client';

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, Monitor, Clock } from 'lucide-react';
import EventPopup from '@/components/EventPopup';
import {
  TimelineEvent,
  formatTime,
  formatDuration,
  formatTimeFromMinutes,
  getLocalDateString,
  getShiftedDate,
  formatDayHeader,
  filterShortEvents,
} from '@/lib/timeline-utils';
import {
  getActivityColor,
  RADIUS,
} from '@/lib/design-tokens';

interface SwimlaneViewProps {
  events: TimelineEvent[];
  date: string;
  onDateChange?: (date: string) => void;
  isFullscreen?: boolean;
}

interface AppSwimlaneTrack {
  appName: string;
  activityType: string;
  totalDurationMins: number;
  events: Array<TimelineEvent & { leftPx: number; widthPx: number; colors: ReturnType<typeof getActivityColor> }>;
}

const DEFAULT_PX_PER_HOUR = 100;
const MIN_PX_PER_HOUR = 50;
const MAX_PX_PER_HOUR = 250;

export default function SwimlaneView({ events, date, onDateChange, isFullscreen = false }: SwimlaneViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [pxPerHour, setPxPerHour] = useState(DEFAULT_PX_PER_HOUR);
  const [expandedEvent, setExpandedEvent] = useState<TimelineEvent | null>(null);

  // 3-day continuous timeline range: [Yesterday 00:00 to Tomorrow 23:59:59]
  const daysSequence = useMemo(() => {
    return [
      getShiftedDate(date, -1),
      date,
      getShiftedDate(date, 1),
    ];
  }, [date]);

  const rangeStartMs = useMemo(() => {
    return new Date(daysSequence[0] + 'T00:00:00').getTime();
  }, [daysSequence]);

  const totalHours = 72; // 3 days * 24 hours
  const totalWidthPx = totalHours * pxPerHour;

  // Filter and group events by application name
  const swimlanes = useMemo(() => {
    const filtered = filterShortEvents(events);
    const appMap = new Map<string, { activityType: string; totalMins: number; events: TimelineEvent[] }>();

    for (const event of filtered) {
      const name = event.activity_name;
      const startMs = new Date(event.start_time).getTime();
      const endMs = event.end_time ? new Date(event.end_time).getTime() : Date.now();
      const durationMins = Math.max(0, (endMs - startMs) / 60000);

      const existing = appMap.get(name) || {
        activityType: event.activity_type,
        totalMins: 0,
        events: [],
      };

      existing.totalMins += durationMins;
      existing.events.push(event);
      appMap.set(name, existing);
    }

    // Convert map to sorted array by total duration descending
    const tracks: AppSwimlaneTrack[] = Array.from(appMap.entries())
      .map(([appName, data]) => {
        const positioned = data.events.map((event) => {
          const startMs = new Date(event.start_time).getTime();
          const endMs = event.end_time ? new Date(event.end_time).getTime() : Date.now();
          const startOffsetHours = (startMs - rangeStartMs) / 3600000;
          const durationHours = Math.max(0, (endMs - startMs) / 3600000);

          const leftPx = startOffsetHours * pxPerHour;
          const widthPx = Math.max(durationHours * pxPerHour, 6); // minimum 6px pill

          return {
            ...event,
            leftPx,
            widthPx,
            colors: getActivityColor(event.activity_type),
          };
        });

        return {
          appName,
          activityType: data.activityType,
          totalDurationMins: data.totalMins,
          events: positioned,
        };
      })
      .sort((a, b) => b.totalDurationMins - a.totalDurationMins);

    return tracks;
  }, [events, rangeStartMs, pxPerHour]);

  // Center horizontal scroll on selected day on mount or date change
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Day 1 starts at 24 hours into the 72-hour window
    const targetHour = 24 + 8; // 8:00 AM on the selected day
    const targetScrollLeft = targetHour * pxPerHour - container.clientWidth / 3;

    container.scrollLeft = Math.max(0, targetScrollLeft);
  }, [date, pxPerHour]);

  // Horizontal zoom preserving focal center time
  const handleZoom = (delta: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    setPxPerHour((prev) => {
      const newScale = Math.max(MIN_PX_PER_HOUR, Math.min(MAX_PX_PER_HOUR, prev + delta));
      if (newScale !== prev) {
        const centerOffset = container.scrollLeft + container.clientWidth / 2;
        const centerHour = centerOffset / prev;
        const newScrollLeft = centerHour * newScale - container.clientWidth / 2;

        requestAnimationFrame(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft = newScrollLeft;
          }
        });
      }
      return newScale;
    });
  };

  const zoomIn = () => handleZoom(25);
  const zoomOut = () => handleZoom(-25);

  // Compute live current time indicator position
  const nowMs = Date.now();
  const currentIndicatorLeftPx = ((nowMs - rangeStartMs) / 3600000) * pxPerHour;
  const isNowInRange = currentIndicatorLeftPx >= 0 && currentIndicatorLeftPx <= totalWidthPx;

  return (
    <>
      <div
        className={`relative w-full ${RADIUS.surface} border border-zinc-800/40 bg-zinc-950/30 overflow-hidden flex flex-col`}
        style={{ height: isFullscreen ? '100vh' : 'calc(100vh - 220px)' }}
      >
        {/* Top Summary Bar */}
        <div className="flex items-center justify-between px-6 py-2.5 border-b border-zinc-800/60 bg-zinc-900/30 shrink-0 z-20">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-[0.15em] font-mono">
              Swimlane Timeline · {formatDayHeader(date)}
            </span>
            <span className="text-zinc-600">·</span>
            <span className="text-xs font-mono text-zinc-400">
              {swimlanes.length} {swimlanes.length === 1 ? 'application' : 'applications'}
            </span>
          </div>

          <div className="text-[11px] font-mono text-zinc-500 hidden sm:block">
            Showing 3-day continuous activity
          </div>
        </div>

        {/* 2D Scrollable Matrix with Sticky Left App Header & Sticky Top Time Ruler */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto custom-scrollbar relative"
        >
          <div className="min-w-max flex flex-col" style={{ width: totalWidthPx + 180 }}>
            {/* Header: Day Boundary Headers + Hour Marks Ruler */}
            <div className="sticky top-0 z-30 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800/80 flex shrink-0">
              {/* Top-Left Corner Anchor */}
              <div className="sticky left-0 z-40 w-44 shrink-0 bg-zinc-950 border-r border-zinc-800/60 px-4 py-2 flex items-center">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-medium">
                  Application
                </span>
              </div>

              {/* Time Ruler (3 Days) */}
              <div className="flex flex-col relative" style={{ width: totalWidthPx }}>
                {/* Day Labels Tier */}
                <div className="flex border-b border-zinc-800/40">
                  {daysSequence.map((dayKey, idx) => {
                    const isToday = dayKey === getLocalDateString();
                    const isSelected = dayKey === date;

                    return (
                      <div
                        key={dayKey}
                        className={`h-7 flex items-center px-4 border-r border-zinc-800/60 font-mono text-xs ${
                          isSelected ? 'bg-zinc-900/40 text-zinc-200' : 'text-zinc-400'
                        }`}
                        style={{ width: 24 * pxPerHour }}
                      >
                        <span className="font-medium">{formatDayHeader(dayKey)}</span>
                        {isToday && (
                          <span className="ml-2 px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px]">
                            Today
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Hour Marks Tier */}
                <div className="flex h-6">
                  {Array.from({ length: totalHours }, (_, i) => {
                    const hourInDay = i % 24;
                    const isMidnight = hourInDay === 0;

                    return (
                      <div
                        key={i}
                        className={`shrink-0 border-r ${
                          isMidnight ? 'border-zinc-700' : 'border-zinc-800/40'
                        } px-1.5 flex items-center justify-start text-[10px] font-mono text-zinc-500 select-none`}
                        style={{ width: pxPerHour }}
                      >
                        {hourInDay === 0 ? '12A' : hourInDay === 12 ? '12P' : `${hourInDay % 12}${hourInDay < 12 ? 'A' : 'P'}`}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Swimlane Rows */}
            {swimlanes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-zinc-500 w-full">
                <Monitor className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm font-medium text-zinc-400">No activity recorded across this 3-day window</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/30 relative">
                {/* Live Time Vertical Indicator Line */}
                {isNowInRange && (
                  <div
                    className="absolute top-0 bottom-0 z-20 pointer-events-none"
                    style={{ left: 176 + currentIndicatorLeftPx }}
                  >
                    <div className="w-px h-full bg-red-500/80 relative">
                      <div className="w-2 h-2 rounded-full bg-red-500 -ml-0.5 absolute -top-1" />
                    </div>
                  </div>
                )}

                {/* Day Boundary Vertical Grid Guides across all rows */}
                <div
                  className="absolute inset-0 pointer-events-none flex"
                  style={{ left: 176, width: totalWidthPx }}
                >
                  {Array.from({ length: totalHours }, (_, i) => {
                    const isMidnight = i % 24 === 0;
                    return (
                      <div
                        key={i}
                        className={`h-full border-r ${
                          isMidnight ? 'border-zinc-700/80 border-r-2' : 'border-dashed border-zinc-800/20'
                        }`}
                        style={{ width: pxPerHour }}
                      />
                    );
                  })}
                </div>

                {swimlanes.map((track) => {
                  const colors = getActivityColor(track.activityType);

                  return (
                    <div key={track.appName} className="flex h-11 relative group hover:bg-zinc-900/20 transition-colors">
                      {/* Sticky Left App Label Column */}
                      <div className="sticky left-0 z-10 w-44 shrink-0 bg-zinc-950/95 border-r border-zinc-800/60 px-4 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${colors.bg}`} />
                          <span className="text-xs font-medium text-zinc-200 truncate group-hover:text-white" title={track.appName}>
                            {track.appName}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-zinc-500 shrink-0">
                          {formatTimeFromMinutes(track.totalDurationMins)}
                        </span>
                      </div>

                      {/* Horizontal Gantt Track Canvas */}
                      <div className="relative flex-1 h-full" style={{ width: totalWidthPx }}>
                        {track.events.map((event) => (
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
                            className={`absolute top-2 h-7 ${RADIUS.control} border ${event.colors.tintBg} ${event.colors.tintBorder}
                                       flex items-center px-2 cursor-pointer hover:bg-white/5 transition-colors duration-150 group/pill focus:outline-none focus:ring-1 focus:ring-zinc-400`}
                            style={{
                              left: event.leftPx,
                              width: event.widthPx,
                            }}
                            title={`${event.activity_name}: ${formatTime(event.start_time)} – ${
                              event.end_time ? formatTime(event.end_time) : 'Now'
                            } (${event.end_time ? formatDuration(event.start_time, event.end_time) : 'Running'})`}
                          >
                            {event.widthPx > 35 && (
                              <span className={`text-[10px] font-medium truncate ${event.colors.text}`}>
                                {event.activity_name}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Floating Horizontal Zoom Controls */}
        <div className="absolute bottom-6 right-6 flex flex-col gap-1 bg-zinc-900 border border-zinc-700/50 p-1 rounded-lg shadow-md z-40">
          <button
            onClick={zoomIn}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors duration-150 cursor-pointer"
            title="Zoom In (Expand Timeline)"
            type="button"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="h-px bg-zinc-800 mx-1" />
          <button
            onClick={zoomOut}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors duration-150 cursor-pointer"
            title="Zoom Out (Compress Timeline)"
            type="button"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
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
