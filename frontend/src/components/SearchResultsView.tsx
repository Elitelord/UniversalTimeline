'use client';

import { useMemo, useState } from 'react';
import { SearchX, Loader2, Search } from 'lucide-react';
import EventPopup from '@/components/EventPopup';
import EventRow from '@/components/EventRow';
import { TimelineEvent, formatDayHeader } from '@/lib/timeline-utils';
import { RADIUS } from '@/lib/design-tokens';

interface SearchResultsViewProps {
  events: TimelineEvent[];
  query: string;
  loading?: boolean;
  hasMore?: boolean;
  error?: string | null;
  isFullscreen?: boolean;
}

export default function SearchResultsView({
  events,
  query,
  loading = false,
  hasMore = false,
  error = null,
  isFullscreen = false,
}: SearchResultsViewProps) {
  const [expandedEvent, setExpandedEvent] = useState<TimelineEvent | null>(null);

  // Results arrive ranked by relevance. Group by day for readability, but keep the
  // days in the order relevance put them in rather than re-sorting chronologically —
  // the best match should stay at the top.
  const dayGroups = useMemo(() => {
    // Deliberately NOT filtered by filterShortEvents. The timeline hides sub-60s
    // events to stay readable, but if you searched for something you want it found
    // regardless of how briefly it was open — a 20-second glance at a page is still
    // the answer to "when did I look at that".
    const visible = events;
    const groups: { day: string; events: TimelineEvent[] }[] = [];
    const index = new Map<string, TimelineEvent[]>();

    for (const event of visible) {
      const start = new Date(event.start_time);
      const day = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
      let list = index.get(day);
      if (!list) {
        list = [];
        index.set(day, list);
        groups.push({ day, events: list });
      }
      list.push(event);
    }

    return groups;
  }, [events]);

  const totalShown = dayGroups.reduce((n, g) => n + g.events.length, 0);

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
              Search results
            </span>
            <span className="text-zinc-600">·</span>
            <span className="text-xs font-mono text-zinc-400 truncate max-w-[16rem]">
              &ldquo;{query}&rdquo;
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-400">
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />
                <span>searching</span>
              </>
            ) : (
              <span>
                {totalShown}
                {hasMore ? '+' : ''} {totalShown === 1 ? 'match' : 'matches'}
              </span>
            )}
          </div>
        </div>

        {/* Scrollable Results */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {error ? (
            <div className="flex flex-col items-center justify-center h-full py-24 text-zinc-500">
              <SearchX className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm font-medium text-zinc-400">Search failed</p>
              <p className="text-xs mt-1 text-zinc-600">{error}</p>
            </div>
          ) : totalShown === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-full py-24 text-zinc-500">
              <Search className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm font-medium text-zinc-400">
                No activity matching &ldquo;{query}&rdquo;
              </p>
              <p className="text-xs mt-1 text-zinc-600">
                Try fewer words, or widen the date range
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/30">
              {dayGroups.map((group) => (
                <div key={group.day} className="relative">
                  {/* Sticky Day Header */}
                  <div className="sticky top-0 z-10 px-6 py-1.5 bg-zinc-950/95 backdrop-blur-md border-y border-zinc-800/40 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-[0.15em] font-mono">
                      {formatDayHeader(group.day)}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-600">
                      {group.events.length} {group.events.length === 1 ? 'match' : 'matches'}
                    </span>
                  </div>

                  <div className="divide-y divide-zinc-800/20">
                    {group.events.map((event) => (
                      <EventRow
                        key={event.id}
                        event={event}
                        onSelect={setExpandedEvent}
                        highlight={query}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {hasMore && (
                <div className="px-6 py-4 text-center text-xs font-mono text-zinc-600">
                  More matches exist — narrow the query or the date range to see them
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {expandedEvent && (
        <EventPopup event={expandedEvent} onClose={() => setExpandedEvent(null)} />
      )}
    </>
  );
}
