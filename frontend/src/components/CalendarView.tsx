'use client';

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Monitor } from 'lucide-react';
import EventPopup from '@/components/EventPopup';
import {
  TimelineEvent,
  computePositionedEvents,
  formatTime,
  getLocalDateString,
  getWeekRange,
  getShiftedDate,
  groupEventsByDay,
} from '@/lib/timeline-utils';
import {
  HOUR_HEIGHT_BASE,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP_BUTTON,
  ZOOM_STEP_WHEEL,
  RADIUS,
} from '@/lib/design-tokens';

interface CalendarViewProps {
  events: TimelineEvent[];
  date: string;
  onDateChange?: (date: string) => void;
  isFullscreen?: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarView({ events, date, onDateChange, isFullscreen = false }: CalendarViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState(0.85); // slightly more zoomed out by default for weekly overview
  const [expandedEvent, setExpandedEvent] = useState<TimelineEvent | null>(null);

  const hourHeight = HOUR_HEIGHT_BASE * zoomLevel;
  const blockHeight = 24 * hourHeight;

  // Compute the 7-day week containing the selected date
  const weekInfo = useMemo(() => {
    return getWeekRange(date);
  }, [date]);

  // Group events by day key
  const eventsByDay = useMemo(() => {
    return groupEventsByDay(events);
  }, [events]);

  // Compute positioned events for each of the 7 days
  const positionedDays = useMemo(() => {
    return weekInfo.days.map((dayStr) => {
      const dayEvents = eventsByDay.get(dayStr) || [];
      return {
        dateStr: dayStr,
        events: computePositionedEvents(dayEvents, dayStr, hourHeight),
      };
    });
  }, [weekInfo.days, eventsByDay, hourHeight]);

  // Wheel zoom handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -ZOOM_STEP_WHEEL : ZOOM_STEP_WHEEL;
        handleZoom(delta);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const handleZoom = (delta: number) => {
    const container = containerRef.current;
    if (!container) return;

    setZoomLevel((prev) => {
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev + delta));
      if (newZoom !== prev) {
        const oldHourHeight = HOUR_HEIGHT_BASE * prev;
        const newHourHeight = HOUR_HEIGHT_BASE * newZoom;
        const centerHour = (container.scrollTop + container.clientHeight / 2) / oldHourHeight;
        const newScrollTop = centerHour * newHourHeight - container.clientHeight / 2;

        requestAnimationFrame(() => {
          if (containerRef.current) containerRef.current.scrollTop = newScrollTop;
        });
      }
      return newZoom;
    });
  };

  const zoomIn = () => handleZoom(ZOOM_STEP_BUTTON);
  const zoomOut = () => handleZoom(-ZOOM_STEP_BUTTON);

  // Center vertical scroll around 8:00 AM on initial load
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const targetHour = 8;
    const targetScrollTop = targetHour * hourHeight;
    container.scrollTop = targetScrollTop;
  }, [hourHeight]);

  // Week navigation handlers
  const goToPrevWeek = () => {
    if (onDateChange) {
      onDateChange(getShiftedDate(date, -7));
    }
  };

  const goToNextWeek = () => {
    if (onDateChange) {
      onDateChange(getShiftedDate(date, 7));
    }
  };

  const goToThisWeek = () => {
    if (onDateChange) {
      onDateChange(getLocalDateString());
    }
  };

  const todayStr = getLocalDateString();
  const isCurrentWeek = weekInfo.days.includes(todayStr);

  const formatWeekRangeDisplay = () => {
    const startD = new Date(weekInfo.start + 'T12:00:00');
    const endD = new Date(weekInfo.end + 'T12:00:00');
    const startStr = startD.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = endD.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${startStr} – ${endStr}`;
  };

  return (
    <>
      <div
        className={`relative w-full ${RADIUS.surface} border border-zinc-800/40 bg-zinc-950/30 overflow-hidden flex flex-col`}
        style={{ height: isFullscreen ? '100vh' : 'calc(100vh - 220px)' }}
      >
        {/* Week Sub-Header with Navigation */}
        <div className="flex items-center justify-between px-6 py-2.5 border-b border-zinc-800/60 bg-zinc-900/30 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrevWeek}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer"
              title="Previous Week"
              type="button"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="font-mono text-xs font-medium text-zinc-200">
              {formatWeekRangeDisplay()}
            </span>

            <button
              onClick={goToNextWeek}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer"
              title="Next Week"
              type="button"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {!isCurrentWeek && (
              <button
                onClick={goToThisWeek}
                className="ml-2 px-2 py-0.5 text-[11px] font-mono font-medium rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors duration-150 cursor-pointer"
                type="button"
              >
                This Week
              </button>
            )}
          </div>

          <div className="text-[11px] font-mono text-zinc-500">
            {events.length} {events.length === 1 ? 'total event' : 'total events'}
          </div>
        </div>

        {/* 7-Day Column Header Bar */}
        <div className="flex border-b border-zinc-800/80 bg-zinc-950/90 shrink-0 z-10">
          {/* Left Hour Label Placeholder Gutter */}
          <div className="w-14 sm:w-16 shrink-0 border-r border-zinc-800/40" />

          {/* Day Headers Grid */}
          <div className="flex-1 grid grid-cols-7 divide-x divide-zinc-800/40">
            {weekInfo.days.map((dayStr, idx) => {
              const d = new Date(dayStr + 'T12:00:00');
              const isToday = dayStr === todayStr;
              const isSelected = dayStr === date;
              const dayNum = d.getDate();

              return (
                <button
                  key={dayStr}
                  onClick={() => onDateChange?.(dayStr)}
                  className={`py-2 px-1 flex flex-col items-center justify-center transition-colors duration-150 cursor-pointer ${
                    isSelected ? 'bg-zinc-900/60' : 'hover:bg-zinc-900/30'
                  }`}
                  type="button"
                >
                  <span className="text-[10px] sm:text-xs font-mono uppercase text-zinc-500">
                    {DAY_LABELS[idx]}
                  </span>
                  <div
                    className={`mt-0.5 w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center font-mono text-xs font-medium transition-colors ${
                      isToday
                        ? 'bg-zinc-100 text-zinc-950 font-semibold'
                        : isSelected
                        ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                        : 'text-zinc-300'
                    }`}
                  >
                    {dayNum}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Calendar Canvas Grid */}
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto custom-scrollbar relative flex flex-col"
        >
          <div className="relative flex w-full" style={{ height: blockHeight }}>
            {/* Hour Labels Left Gutter */}
            <div className="w-14 sm:w-16 shrink-0 relative select-none border-r border-zinc-800/40 bg-zinc-950/20">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="pr-2 text-right text-[10px] sm:text-xs font-mono text-zinc-500"
                  style={{ height: hourHeight }}
                >
                  {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                </div>
              ))}
            </div>

            {/* 7 Days Columns Container */}
            <div className="flex-1 grid grid-cols-7 divide-x divide-zinc-800/40 relative h-full">
              {/* Horizontal Hour Grid Lines across all columns */}
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 border-t border-dashed border-zinc-800/40 pointer-events-none"
                  style={{ top: hour * hourHeight }}
                />
              ))}

              {/* Day Columns */}
              {positionedDays.map(({ dateStr, events: dayEvents }) => {
                const isToday = dateStr === todayStr;

                return (
                  <div key={dateStr} className="relative h-full">
                    {/* Live time indicator if today */}
                    {isToday && <CalendarTimeIndicator hourHeight={hourHeight} />}

                    {/* Events within this day column */}
                    {dayEvents.map((event) => {
                      const widthPercent = 100 / event.columnsCount;
                      const leftPercent = event.column * widthPercent;

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
                          className={`absolute ${RADIUS.control} border ${event.colors.tintBg} ${event.colors.tintBorder} 
                                      overflow-hidden cursor-pointer
                                      hover:bg-white/5 transition-colors duration-150 group focus:outline-none focus:ring-1 focus:ring-zinc-400`}
                          style={{
                            top: event.top,
                            height: event.height,
                            left: `calc(${leftPercent}% + 2px)`,
                            width: `calc(${widthPercent}% - 4px)`,
                          }}
                          title={`${event.activity_name} (${formatTime(event.startDate)} – ${formatTime(event.endDate)})`}
                        >
                          <div className="px-1.5 py-0.5 h-full flex flex-col justify-center overflow-hidden">
                            {event.height > 12 && (
                              <div className={`text-[11px] font-medium truncate leading-tight ${event.colors.text}`}>
                                {event.activity_name}
                              </div>
                            )}
                            {event.height > 30 && (
                              <div className="font-mono text-[8px] text-zinc-500 truncate leading-none mt-0.5">
                                {formatTime(event.startDate)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Floating Zoom Controls */}
        <div className="absolute bottom-6 right-6 flex flex-col gap-1 bg-zinc-900 border border-zinc-700/50 p-1 rounded-lg shadow-md z-40">
          <button
            onClick={zoomIn}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors duration-150 cursor-pointer"
            title="Zoom In"
            type="button"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="h-px bg-zinc-800 mx-1" />
          <button
            onClick={zoomOut}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors duration-150 cursor-pointer"
            title="Zoom Out"
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

function CalendarTimeIndicator({ hourHeight }: { hourHeight: number }) {
  const now = new Date();
  const hourOfDay = now.getHours() + now.getMinutes() / 60;
  const top = hourOfDay * hourHeight;

  return (
    <div className="absolute left-0 right-0 z-30 pointer-events-none" style={{ top }}>
      <div className="flex items-center">
        <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
        <div className="flex-1 h-px bg-red-500/80" />
      </div>
    </div>
  );
}
