'use client';

import { useMemo, useRef, useEffect, useState, UIEvent } from 'react';
import { ZoomIn, ZoomOut, X, Clock, Monitor } from 'lucide-react';

interface TimelineEvent {
  id: string;
  activity_type: string;
  activity_name: string;
  start_time: string;
  end_time: string | null;
  metadata?: Record<string, any>;
}

interface TimelineViewProps {
  events: TimelineEvent[];
  date: string;
}

const ACTIVITY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  coding:        { bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   text: 'text-blue-400' },
  browsing:      { bg: 'bg-emerald-500/10',  border: 'border-emerald-500/20',  text: 'text-emerald-400' },
  communication: { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400' },
  design:        { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400' },
  productivity:  { bg: 'bg-teal-500/10',   border: 'border-teal-500/20',   text: 'text-teal-400' },
};

const DEFAULT_COLOR = { bg: 'bg-zinc-500/10', border: 'border-zinc-500/20', text: 'text-zinc-400' };

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [expandedEvent, setExpandedEvent] = useState<TimelineEvent | null>(null);
  
  const hourHeight = 80 * zoomLevel;
  const blockHeight = 24 * hourHeight;

  // Wheel zoom handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        handleZoom(delta);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const handleZoom = (delta: number) => {
    const container = containerRef.current;
    if (!container) return;
    
    setZoomLevel(prev => {
      const newZoom = Math.max(0.5, Math.min(3, prev + delta));
      if (newZoom !== prev) {
        const oldHourHeight = 80 * prev;
        const newHourHeight = 80 * newZoom;
        const centerHour = (container.scrollTop + container.clientHeight / 2) / oldHourHeight;
        const newScrollTop = (centerHour * newHourHeight) - (container.clientHeight / 2);
        
        requestAnimationFrame(() => {
          if (containerRef.current) containerRef.current.scrollTop = newScrollTop;
        });
      }
      return newZoom;
    });
  };

  const zoomIn = () => handleZoom(0.25);
  const zoomOut = () => handleZoom(-0.25);

  // Initial scroll to center on current block (Block 1)
  useEffect(() => {
    if (containerRef.current && events.length > 0) {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      
      let targetHour = 9;
      if (date === today) {
        targetHour = now.getHours();
      }
      
      // Center on the MIDDLE block (index 1)
      const targetY = blockHeight + (targetHour * hourHeight);
      const containerHeight = containerRef.current.clientHeight;
      const scrollTop = Math.max(0, targetY - containerHeight / 2 + hourHeight / 2);
      
      setTimeout(() => {
        if (containerRef.current) {
          containerRef.current.scrollTo({ top: scrollTop, behavior: 'auto' });
        }
      }, 50);
    }
  }, [date, events.length]); // Intentionally omitting blockHeight/hourHeight to prevent jumping on zoom

  // Infinite scroll loop handler
  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    
    // If scrolled too high (into top block)
    if (container.scrollTop < blockHeight * 0.5) {
      container.scrollTop += blockHeight;
    }
    // If scrolled too low (into bottom block)
    else if (container.scrollTop > blockHeight * 1.5) {
      container.scrollTop -= blockHeight;
    }
  };

  // Calculate positions and resolve visual overlaps
  const positionedEvents = useMemo(() => {
    const dayStart = new Date(date + 'T00:00:00.000Z');

    const basicEvents = events
      .filter((e) => {
        if (!e.end_time) return false;
        const diffMs = new Date(e.end_time).getTime() - new Date(e.start_time).getTime();
        return diffMs >= 60000; // Filter out events less than 1 minute
      })
      .map((event) => {
        const start = new Date(event.start_time);
        const end = new Date(event.end_time!);
        const startHour = (start.getTime() - dayStart.getTime()) / 3600000;
        const endHour = (end.getTime() - dayStart.getTime()) / 3600000;
        const top = Math.max(0, startHour) * hourHeight;
        
        const actualHeight = (endHour - Math.max(0, startHour)) * hourHeight;
        // Strict scaling with zoom. Min 6px so it renders as a clickable capsule.
        const height = Math.max(actualHeight, 6);
        
        const colors = ACTIVITY_COLORS[event.activity_type] || DEFAULT_COLOR;

        return { ...event, top, height, colors, startDate: start, endDate: end, column: 0, columnsCount: 1 };
      })
      .sort((a, b) => a.top - b.top || b.height - a.height);

    const groups: typeof basicEvents[] = [];
    
    for (const event of basicEvents) {
      let placed = false;
      for (const group of groups) {
        const overlaps = group.some(
          (member) => event.top < member.top + member.height && event.top + event.height > member.top
        );
        if (overlaps) {
          group.push(event);
          placed = true;
          break;
        }
      }
      if (!placed) {
        groups.push([event]);
      }
    }

    for (const group of groups) {
      const columns: number[] = [];
      for (const event of group) {
        let colIndex = 0;
        while (colIndex < columns.length && event.top < columns[colIndex]) {
          colIndex++;
        }
        event.column = colIndex;
        if (colIndex < columns.length) {
          columns[colIndex] = event.top + event.height;
        } else {
          columns.push(event.top + event.height);
        }
      }
      const totalCols = columns.length;
      for (const event of group) {
        event.columnsCount = totalCols;
      }
    }

    return basicEvents;
  }, [events, date, hourHeight]);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-zinc-500">
        <Monitor className="w-12 h-12 mb-4 opacity-20" />
        <p className="text-sm font-medium text-zinc-400">No events for this day</p>
        <p className="text-xs mt-1 text-zinc-600">Activity will appear here once tracked</p>
      </div>
    );
  }

  // Helper to render one 24-hour block
  const renderDayBlock = (blockIndex: number) => {
    return (
      <div 
        key={`block-${blockIndex}`} 
        className="relative flex w-full"
        style={{ height: blockHeight }}
      >
        {/* Hour labels */}
        <div className="w-20 shrink-0 pr-3 relative">
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="text-right text-xs text-zinc-500 font-mono"
              style={{ height: hourHeight }}
            >
              {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
            </div>
          ))}
        </div>

        {/* Timeline grid + events */}
        <div className="flex-1 relative h-full border-l border-zinc-800/40">
          {/* Hour grid lines & Minute ticks */}
          {HOURS.map((hour) => (
            <div key={hour}>
              <div
                className="absolute left-0 right-0 border-t border-dashed border-zinc-800/60"
                style={{ top: hour * hourHeight }}
              />
              {zoomLevel >= 1.5 && [15, 30, 45].map(min => (
                <div 
                  key={`${hour}-${min}`}
                  className={`absolute left-0 right-0 border-t border-solid ${min === 30 ? 'border-zinc-800/40' : 'border-zinc-800/20'}`} 
                  style={{ top: (hour + min / 60) * hourHeight }} 
                />
              ))}
              {zoomLevel >= 2.5 && [5, 10, 20, 25, 35, 40, 50, 55].map(min => (
                <div 
                  key={`${hour}-${min}`}
                  className="absolute left-0 right-0 border-t border-solid border-zinc-800/10" 
                  style={{ top: (hour + min / 60) * hourHeight }} 
                />
              ))}
            </div>
          ))}

          {/* Current time indicator */}
          <CurrentTimeIndicator date={date} hourHeight={hourHeight} />

          {/* Event blocks */}
          {positionedEvents.map((event) => {
            const widthPercent = 100 / event.columnsCount;
            const leftPercent = event.column * widthPercent;
            
            return (
              <div
                key={event.id}
                onClick={() => setExpandedEvent(event)}
                className={`absolute rounded-lg border ${event.colors.bg} ${event.colors.border} 
                            backdrop-blur-sm overflow-hidden cursor-pointer
                            hover:brightness-125 transition-all duration-200 group`}
                style={{ 
                  top: event.top, 
                  height: event.height,
                  left: `calc(${leftPercent}% + 4px)`,
                  width: `calc(${widthPercent}% - 8px)`
                }}
              >
                <div className="px-3 py-1 h-full flex flex-col justify-center overflow-hidden">
                  {event.height > 10 && (
                    <div className={`text-xs font-medium truncate ${event.colors.text}`}>
                      {event.activity_name}
                    </div>
                  )}
                  {event.height > 35 && (
                    <div className="text-[9px] text-zinc-500 truncate">
                      {formatTime(event.startDate as Date)} – {formatTime(event.endDate as Date)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="relative flex flex-col overflow-y-auto w-full rounded-xl border border-zinc-800/40 bg-zinc-950/30 custom-scrollbar" 
        style={{ height: 'calc(100vh - 220px)' }}
      >
        {/* Render 3 identical blocks for infinite scroll illusion */}
        {[-1, 0, 1].map(renderDayBlock)}

        {/* Floating Zoom Controls */}
        <div className="sticky bottom-6 left-full -translate-x-12 w-max flex flex-col gap-1 bg-zinc-900 border border-zinc-700/50 p-1 rounded-lg shadow-xl z-40">
          <button 
            onClick={zoomIn} 
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors cursor-pointer"
            title="Zoom In (Ctrl+Scroll Up)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="h-px bg-zinc-800 mx-1" />
          <button 
            onClick={zoomOut} 
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors cursor-pointer"
            title="Zoom Out (Ctrl+Scroll Down)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Floating Expanded Event Modal */}
      {expandedEvent && (
        <EventPopup 
          event={expandedEvent} 
          onClose={() => setExpandedEvent(null)} 
          colors={ACTIVITY_COLORS[expandedEvent.activity_type] || DEFAULT_COLOR} 
        />
      )}
    </>
  );
}

function EventPopup({ event, onClose, colors }: { event: any, onClose: () => void, colors: any }) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className={`relative w-full max-w-md bg-zinc-900 border ${colors.border} rounded-2xl shadow-2xl overflow-hidden`}>
        {/* Header Ribbon */}
        <div className={`h-1.5 w-full ${colors.bg}`} />
        
        <div className="p-5">
          <div className="flex justify-between items-start gap-4 mb-4">
            <div>
              <h2 className={`text-lg font-semibold ${colors.text} leading-tight`}>
                {event.activity_name}
              </h2>
              <span className="inline-block mt-1.5 px-2 py-0.5 rounded text-xs font-medium bg-zinc-800 text-zinc-300 capitalize border border-zinc-700/50">
                {event.activity_type}
              </span>
            </div>
            <button 
              onClick={onClose}
              className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-zinc-400 bg-zinc-950/50 p-2.5 rounded-lg border border-zinc-800/50">
              <Clock className="w-4 h-4 shrink-0 text-zinc-500" />
              <div>
                <p className="font-medium text-zinc-200">
                  {formatTime(new Date(event.start_time))} – {formatTime(new Date(event.end_time))}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Duration: {formatDuration(new Date(event.start_time), new Date(event.end_time))}
                </p>
              </div>
            </div>

            {event.metadata && Object.keys(event.metadata).length > 0 && (
              <div className="mt-4 pt-4 border-t border-zinc-800/60">
                <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Metadata</h3>
                <div className="space-y-1.5">
                  {Object.entries(event.metadata).map(([key, value]) => (
                    <div key={key} className="flex flex-col text-sm">
                      <span className="text-zinc-500 capitalize">{key.replace(/_/g, ' ')}</span>
                      <span className="text-zinc-300 font-mono text-xs mt-0.5 break-all bg-zinc-950/50 p-1.5 rounded border border-zinc-800/30">
                        {String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CurrentTimeIndicator({ date, hourHeight }: { date: string, hourHeight: number }) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  if (date !== today) return null;

  const hourOfDay = now.getHours() + now.getMinutes() / 60;
  const top = hourOfDay * hourHeight;

  return (
    <div className="absolute left-0 right-0 z-30 pointer-events-none" style={{ top }}>
      <div className="flex items-center">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-lg shadow-red-500/50 -ml-1" />
        <div className="flex-1 h-px bg-red-500/60" />
      </div>
    </div>
  );
}
