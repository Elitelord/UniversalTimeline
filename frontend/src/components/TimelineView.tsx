'use client';

import { useMemo, useRef, useEffect, useState, useCallback, UIEvent } from 'react';
import { ZoomIn, ZoomOut, Clock, Monitor } from 'lucide-react';
import EventPopup from '@/components/EventPopup';
import {
  TimelineEvent,
  computePositionedEvents,
  formatTime,
  getLocalDateString,
  getShiftedDate,
  formatDayHeader,
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

interface TimelineViewProps {
  events: TimelineEvent[];
  date: string;
  onDateChange?: (date: string) => void;
  isFullscreen?: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function TimelineView({ events, date, onDateChange, isFullscreen = false }: TimelineViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const isAutoScrollingRef = useRef(false);

  const [zoomLevel, setZoomLevel] = useState(1);
  const [expandedEvent, setExpandedEvent] = useState<TimelineEvent | null>(null);
  const [showJumpToNow, setShowJumpToNow] = useState(false);

  const hourHeight = HOUR_HEIGHT_BASE * zoomLevel;
  const blockHeight = 24 * hourHeight;

  // 3-day sequence: Yesterday, Selected Date, Tomorrow
  const daysSequence = useMemo(() => {
    return [
      getShiftedDate(date, -1),
      date,
      getShiftedDate(date, 1),
    ];
  }, [date]);

  // Group events by day key (YYYY-MM-DD)
  const eventsByDay = useMemo(() => {
    return groupEventsByDay(events);
  }, [events]);

  // Pre-calculate positioned events for each day
  const positionedByDay = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computePositionedEvents>>();
    for (const d of daysSequence) {
      const dayEvents = eventsByDay.get(d) ?? [];
      map.set(d, computePositionedEvents(dayEvents, d, hourHeight));
    }
    return map;
  }, [daysSequence, eventsByDay, hourHeight]);

  // Wheel zoom handler with focal preservation
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

  // Scroll to selected date on initial mount or date prop change
  const scrollToDateHour = useCallback(
    (targetDate: string, targetHour: number, smooth = false) => {
      const container = containerRef.current;
      const dayEl = dayRefs.current.get(targetDate);
      if (!container || !dayEl) return;

      isAutoScrollingRef.current = true;
      const dayTop = dayEl.offsetTop;
      const targetScrollTop = Math.max(0, dayTop + targetHour * hourHeight - container.clientHeight / 3);

      container.scrollTo({
        top: targetScrollTop,
        behavior: smooth ? 'smooth' : 'auto',
      });

      setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, smooth ? 600 : 100);
    },
    [hourHeight]
  );

  // On date change, center on selected date (hour 9 or current hour if today)
  useEffect(() => {
    const now = new Date();
    const today = getLocalDateString(now);
    const targetHour = date === today ? now.getHours() : 9;

    const timer = setTimeout(() => {
      scrollToDateHour(date, targetHour, false);
    }, 50);

    return () => clearTimeout(timer);
  }, [date, scrollToDateHour]);

  // Handle scroll to detect active visible day & evaluate "Jump to Now" button visibility
  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const now = new Date();
    const today = getLocalDateString(now);

    // Evaluate "Jump to Now" button visibility
    const todayEl = dayRefs.current.get(today);
    if (!todayEl) {
      setShowJumpToNow(true);
    } else {
      const nowHour = now.getHours() + now.getMinutes() / 60;
      const nowY = todayEl.offsetTop + nowHour * hourHeight;
      const viewTop = container.scrollTop;
      const viewBottom = container.scrollTop + container.clientHeight;
      const isNowVisible = nowY >= viewTop && nowY <= viewBottom;
      setShowJumpToNow(!isNowVisible);
    }
  };

  // Jump to Now FAB action
  const handleJumpToNow = () => {
    const now = new Date();
    const today = getLocalDateString(now);

    if (date !== today && onDateChange) {
      onDateChange(today);
    } else {
      scrollToDateHour(today, now.getHours(), true);
    }
  };

  const hasAnyEvents = events.length > 0;

  return (
    <>
      <div
        className={`relative w-full ${RADIUS.surface} border border-zinc-800/40 bg-zinc-950/30 overflow-hidden`}
        style={{ height: isFullscreen ? '100vh' : 'calc(100vh - 220px)' }}
      >
        {/* Scrollable multi-day canvas */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="w-full h-full overflow-y-auto custom-scrollbar relative flex flex-col"
        >
          {daysSequence.map((dayKey) => {
            const isSelectedDay = dayKey === date;
            const isToday = dayKey === getLocalDateString();
            const dayPositionedEvents = positionedByDay.get(dayKey) ?? [];

            return (
              <div
                key={dayKey}
                ref={(el) => {
                  if (el) dayRefs.current.set(dayKey, el);
                  else dayRefs.current.delete(dayKey);
                }}
                className="relative flex flex-col w-full"
              >
                {/* Sticky Day Separator Header */}
                <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-2 bg-zinc-950/90 backdrop-blur-md border-y border-zinc-800/80">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-zinc-400 tracking-[0.15em] uppercase font-mono">
                      {formatDayHeader(dayKey)}
                    </span>
                    {isToday && (
                      <span className="px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-mono">
                        Current Day
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] font-mono text-zinc-500">
                    {dayPositionedEvents.length} {dayPositionedEvents.length === 1 ? 'event' : 'events'}
                  </div>
                </div>

                {/* 24-Hour Day Canvas */}
                <div className="relative flex w-full" style={{ height: blockHeight }}>
                  {/* Hour Labels Left Gutter */}
                  <div className="w-20 shrink-0 pr-3 relative select-none">
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className={`text-right text-xs font-mono ${
                          hour === 0 ? 'text-zinc-300 font-semibold' : 'text-zinc-500'
                        }`}
                        style={{ height: hourHeight }}
                      >
                        {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                      </div>
                    ))}
                  </div>

                  {/* Timeline Grid Lines & Events */}
                  <div className="flex-1 relative h-full border-l border-zinc-800/40">
                    {/* Grid Lines */}
                    {HOURS.map((hour) => (
                      <div key={hour}>
                        <div
                          className={`absolute left-0 right-0 border-t ${
                            hour === 0
                              ? 'border-solid border-zinc-700/80 border-t-2 z-10'
                              : 'border-dashed border-zinc-800/60'
                          }`}
                          style={{ top: hour * hourHeight }}
                        />
                        {zoomLevel >= 1.5 &&
                          [15, 30, 45].map((min) => (
                            <div
                              key={`${hour}-${min}`}
                              className={`absolute left-0 right-0 border-t border-solid ${
                                min === 30 ? 'border-zinc-800/40' : 'border-zinc-800/20'
                              }`}
                              style={{ top: (hour + min / 60) * hourHeight }}
                            />
                          ))}
                        {zoomLevel >= 2.5 &&
                          [5, 10, 20, 25, 35, 40, 50, 55].map((min) => (
                            <div
                              key={`${hour}-${min}`}
                              className="absolute left-0 right-0 border-t border-solid border-zinc-800/10"
                              style={{ top: (hour + min / 60) * hourHeight }}
                            />
                          ))}
                      </div>
                    ))}

                    {/* Current Time Indicator (Only on Today's Canvas) */}
                    {isToday && <CurrentTimeIndicator hourHeight={hourHeight} />}

                    {/* Events */}
                    {dayPositionedEvents.map((event) => {
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
                            left: `calc(${leftPercent}% + 4px)`,
                            width: `calc(${widthPercent}% - 8px)`,
                          }}
                        >
                          <div className="px-3 py-1 h-full flex flex-col justify-center overflow-hidden">
                            {event.height > 10 && (
                              <div className={`text-xs font-medium truncate ${event.colors.text}`}>
                                {event.activity_name}
                              </div>
                            )}
                            {event.height > 35 && (
                              <div className="font-mono text-[9px] text-zinc-500 truncate">
                                {formatTime(event.startDate)} – {formatTime(event.endDate)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {dayPositionedEvents.length === 0 && isSelectedDay && !hasAnyEvents && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 pointer-events-none">
                        <Monitor className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-xs font-medium text-zinc-400">No activity recorded for this day</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Floating Action Controls: Always anchored to bottom-right corner */}
        <div className="absolute bottom-6 right-6 flex flex-col items-end gap-2 z-40 pointer-events-none">
          {/* Jump to Now FAB */}
          {showJumpToNow && (
            <button
              onClick={handleJumpToNow}
              className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-700/60 rounded-full shadow-md text-xs font-medium text-zinc-200 hover:text-white hover:bg-zinc-800 transition-colors duration-150 cursor-pointer"
              title="Jump to Current Time"
              type="button"
            >
              <Clock className="w-3.5 h-3.5 text-red-400" />
              <span>Now</span>
            </button>
          )}

          {/* Zoom Controls */}
          <div className="pointer-events-auto flex flex-col gap-1 bg-zinc-900 border border-zinc-700/50 p-1 rounded-lg shadow-md">
            <button
              onClick={zoomIn}
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors duration-150 cursor-pointer"
              title="Zoom In (Ctrl+Scroll Up)"
              type="button"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="h-px bg-zinc-800 mx-1" />
            <button
              onClick={zoomOut}
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors duration-150 cursor-pointer"
              title="Zoom Out (Ctrl+Scroll Down)"
              type="button"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Floating Expanded Event Modal */}
      {expandedEvent && (
        <EventPopup
          event={expandedEvent}
          onClose={() => setExpandedEvent(null)}
        />
      )}
    </>
  );
}

function CurrentTimeIndicator({ hourHeight }: { hourHeight: number }) {
  const now = new Date();
  const hourOfDay = now.getHours() + now.getMinutes() / 60;
  const top = hourOfDay * hourHeight;

  return (
    <div className="absolute left-0 right-0 z-30 pointer-events-none" style={{ top }}>
      <div className="flex items-center">
        <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
        <div className="flex-1 h-px bg-red-500/60" />
      </div>
    </div>
  );
}
