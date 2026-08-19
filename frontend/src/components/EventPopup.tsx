'use client';

import { useEffect } from 'react';
import { X, Clock } from 'lucide-react';
import { TimelineEvent, formatTime, formatDuration } from '@/lib/timeline-utils';
import { getActivityColor, RADIUS } from '@/lib/design-tokens';

interface EventPopupProps {
  event: TimelineEvent;
  onClose: () => void;
}

export default function EventPopup({ event, onClose }: EventPopupProps) {
  const colors = getActivityColor(event.activity_type);

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
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-popup-title"
        className={`relative w-full max-w-md bg-zinc-900 border ${colors.tintBorder} ${RADIUS.surface} shadow-lg overflow-hidden`}
      >
        {/* Header Color Accent Bar */}
        <div className={`h-1.5 w-full ${colors.bg}`} />

        <div className="p-5">
          <div className="flex justify-between items-start gap-4 mb-4">
            <div>
              <h2 id="event-popup-title" className={`text-base font-semibold ${colors.text} leading-tight`}>
                {event.activity_name}
              </h2>
              <span className="inline-block mt-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 capitalize border border-zinc-700/50">
                {event.activity_type}
              </span>
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

          <div className="space-y-3">
            <div className="flex items-center gap-2.5 text-sm text-zinc-400 bg-zinc-950/50 p-2.5 rounded-lg border border-zinc-800/50">
              <Clock className="w-4 h-4 shrink-0 text-zinc-500" />
              <div>
                <p className="font-mono text-xs text-zinc-200">
                  {formatTime(event.start_time)} – {event.end_time ? formatTime(event.end_time) : 'Now'}
                </p>
                <p className="font-mono text-xs text-zinc-500 mt-0.5">
                  Duration: {event.end_time ? formatDuration(event.start_time, event.end_time) : 'Running'}
                </p>
              </div>
            </div>

            {event.metadata && Object.keys(event.metadata).length > 0 && (
              <div className="mt-4 pt-4 border-t border-zinc-800/60">
                <h3 className="text-[11px] font-medium text-zinc-500 uppercase tracking-[0.15em] mb-2">
                  Metadata
                </h3>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {Object.entries(event.metadata).map(([key, value]) => (
                    <div key={key} className="flex flex-col text-sm">
                      <span className="text-xs text-zinc-500 capitalize">{key.replace(/_/g, ' ')}</span>
                      <span className="text-zinc-300 font-mono text-xs mt-0.5 break-all bg-zinc-950/50 p-1.5 rounded-md border border-zinc-800/30">
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
