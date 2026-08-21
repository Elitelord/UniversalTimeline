'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { fetchTimeline, searchTimeline } from '@/lib/api';
import SearchResultsView from '@/components/SearchResultsView';
import ActivityTypeFilter from '@/components/ActivityTypeFilter';
import TimelineView from '@/components/TimelineView';
import SummaryView from '@/components/SummaryView';
import LogView from '@/components/LogView';
import CalendarView from '@/components/CalendarView';
import SwimlaneView from '@/components/SwimlaneView';
import ViewSwitcher from '@/components/ViewSwitcher';
import { Activity, LayoutDashboard, LogOut, Search, X, Maximize2, Minimize2 } from 'lucide-react';
import {
  DEFAULT_VIEW_MODE,
  VIEW_MODE_STORAGE_KEY,
  TimelineViewMode,
  RADIUS,
} from '@/lib/design-tokens';
import {
  TimelineEvent,
  getLocalDateString,
  getShiftedDate,
  getWeekRange,
} from '@/lib/timeline-utils';

export default function TimelinePage() {
  const { user, session, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [date, setDate] = useState<string>(() => getLocalDateString());
  const [activeTab, setActiveTab] = useState<'timeline' | 'summary'>('timeline');
  const [activeView, setActiveView] = useState<TimelineViewMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY) as TimelineViewMode | null;
      if (saved && ['log', 'vertical', 'calendar', 'swimlane'].includes(saved)) {
        return saved;
      }
    }
    return DEFAULT_VIEW_MODE;
  });

  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fullscreenContainerRef = useRef<HTMLDivElement>(null);

  // Filter state
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search scope. "all" queries the cross-date /search endpoint and ranks by
  // relevance; "day" keeps the original behaviour of filtering the visible window.
  const [searchScope, setSearchScope] = useState<'day' | 'all'>('all');
  const [searchHasMore, setSearchHasMore] = useState(false);

  // Request sequencing, so a slow response can't overwrite a newer one
  const inFlightRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);

  const isSearchMode = searchScope === 'all' && debouncedSearch.trim().length > 0;

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Save view preference to localStorage
  const handleViewChange = (view: TimelineViewMode) => {
    setActiveView(view);
    if (typeof window !== 'undefined') {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, view);
    }
  };

  // Fullscreen toggle using browser Fullscreen API
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await fullscreenContainerRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen API not supported or blocked — silently ignore
    }
  }, []);

  // Sync isFullscreen state with actual fullscreen changes (including Escape key exit)
  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  // Debounce search input
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 400);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchInput]);

  // Fetch events when date, view mode, filters, or debounced search changes.
  //
  // Requests are sequenced and abortable: a cross-date search takes noticeably longer
  // than a single-day fetch, so without a guard a slow earlier response can land after
  // a fast later one and overwrite it.
  const loadEvents = useCallback(async () => {
    if (!session) return;

    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;
    const requestId = ++requestSeqRef.current;

    const isStale = () => requestId !== requestSeqRef.current;

    setLoadingEvents(true);
    setError(null);

    try {
      if (isSearchMode) {
        const { results, has_more } = await searchTimeline(session, debouncedSearch, {
          activityTypes: activeTypes.length > 0 ? activeTypes : undefined,
          limit: 100,
          signal: controller.signal,
        });
        if (isStale()) return;
        setDemoMode(false);
        setSearchHasMore(has_more);
        setEvents(results);
        return;
      }

      const filters: { activityTypes?: string[]; search?: string } = {};
      if (activeTypes.length > 0) filters.activityTypes = activeTypes;
      if (debouncedSearch) filters.search = debouncedSearch;

      let startDate = date;
      let endDate = date;

      if (activeView === 'vertical' || activeView === 'swimlane') {
        startDate = getShiftedDate(date, -1);
        endDate = getShiftedDate(date, 1);
      } else if (activeView === 'calendar') {
        const week = getWeekRange(date);
        startDate = week.start;
        endDate = week.end;
      }

      const data = await fetchTimeline(
        session,
        startDate,
        endDate,
        filters,
        controller.signal
      );
      if (isStale()) return;
      setDemoMode(!!(data as any).__demo);
      setEvents(data);
    } catch (err: any) {
      // An abort means a newer request superseded this one — not an error to show.
      if (err?.name === 'AbortError' || isStale()) return;
      setError(err.message);
      setEvents([]);
    } finally {
      if (!isStale()) setLoadingEvents(false);
    }
  }, [session, date, activeView, activeTypes, debouncedSearch, isSearchMode]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Abort any in-flight request when the page unmounts
  useEffect(() => () => inFlightRef.current?.abort(), []);

  const goToPreviousDay = () => {
    setDate((prev) => getShiftedDate(prev, -1));
  };

  const goToNextDay = () => {
    setDate((prev) => getShiftedDate(prev, 1));
  };

  const goToToday = () => {
    setDate(getLocalDateString());
  };

  const isToday = date === getLocalDateString();
  const hasActiveFilters = activeTypes.length > 0 || searchInput;

  const toggleType = (type: string) => {
    setActiveTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const clearFilters = () => {
    setActiveTypes([]);
    setSearchInput('');
    setDebouncedSearch('');
    setSearchHasMore(false);
  };

  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div
      ref={fullscreenContainerRef}
      className={`flex-1 flex flex-col max-w-5xl mx-auto w-full h-full ${
        isFullscreen ? 'max-w-none bg-zinc-950' : 'bg-zinc-950'
      }`}
    >
      {/* Header — hidden in fullscreen */}
      {!isFullscreen && (
        <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-zinc-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-base font-semibold text-zinc-100 tracking-tight">Timeline</h1>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-400 font-medium hidden sm:inline-block">{user.email}</span>
            <button
              onClick={signOut}
              className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors duration-150 cursor-pointer"
              title="Sign Out"
              type="button"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>
      )}

      {/* Date Navigation & Tabs */}
      <div className={`px-6 py-4 border-b border-zinc-800/80 bg-zinc-950/50 sticky top-0 z-40 backdrop-blur-md ${
        isFullscreen ? 'py-2.5' : ''
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={goToPreviousDay}
              className="p-2 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-colors duration-150 cursor-pointer shadow-sm"
              title="Previous Day"
              type="button"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 text-sm font-medium
                         focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:border-zinc-500 cursor-pointer shadow-sm
                         [color-scheme:dark]"
            />

            <button
              onClick={goToNextDay}
              className="p-2 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-colors duration-150 cursor-pointer shadow-sm"
              title="Next Day"
              type="button"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {!isToday && (
              <button
                onClick={goToToday}
                className="px-3 py-2 ml-1 text-xs font-semibold bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors duration-150 cursor-pointer shadow-sm"
                type="button"
              >
                Today
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* View Switcher (Timeline Tab Only) */}
            {activeTab === 'timeline' && (
              <ViewSwitcher
                activeView={activeView}
                onChange={handleViewChange}
                disabled={isSearchMode}
              />
            )}

            {/* Fullscreen Toggle */}
            {activeTab === 'timeline' && (
              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors duration-150 cursor-pointer shadow-sm"
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                type="button"
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
            )}

            {/* Timeline vs Summary Tab Switcher — hidden in fullscreen */}
            {!isFullscreen && (
              <div className="flex items-center gap-0.5 bg-zinc-900/60 p-0.5 rounded-lg border border-zinc-800">
                <button
                  onClick={() => setActiveTab('timeline')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 cursor-pointer ${
                    activeTab === 'timeline'
                      ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                  }`}
                  type="button"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Timeline</span>
                </button>
                <button
                  onClick={() => setActiveTab('summary')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 cursor-pointer ${
                    activeTab === 'summary'
                      ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                  }`}
                  type="button"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  <span>Summary</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter Bar (Timeline tab only) — hidden in fullscreen */}
      {activeTab === 'timeline' && !isFullscreen && (
        <div className="px-6 py-3 border-b border-zinc-800/80 bg-zinc-950/30">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search activities..."
                className="w-full pl-9 pr-8 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder-zinc-500
                           focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:border-zinc-500 transition-colors duration-150"
              />
              {searchInput && (
                <button
                  onClick={() => {
                    setSearchInput('');
                    setDebouncedSearch('');
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  type="button"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Search Scope — only meaningful once something has been typed */}
            {searchInput && (
              <div className="flex items-center gap-1 p-0.5 bg-zinc-900/60 border border-zinc-800/80 rounded-lg shrink-0">
                {(['all', 'day'] as const).map((scope) => (
                  <button
                    key={scope}
                    onClick={() => setSearchScope(scope)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors duration-150 cursor-pointer ${
                      searchScope === scope
                        ? 'bg-zinc-800 text-zinc-100'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                    type="button"
                  >
                    {scope === 'all' ? 'All time' : 'This view'}
                  </button>
                ))}
              </div>
            )}

            {/* Activity Type Filter — a multiselect dropdown rather than a chip row,
                which grew unwieldy once the taxonomy expanded to 12 types. */}
            <ActivityTypeFilter
              activeTypes={activeTypes}
              onToggle={toggleType}
              onClear={() => setActiveTypes([])}
            />

            {/* Clear all filters (types + search) */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-100 border border-zinc-800 rounded-lg hover:bg-zinc-800/50 transition-colors duration-150 cursor-pointer shrink-0"
                type="button"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'timeline' ? (
          <div className={`h-full flex flex-col ${isFullscreen ? 'px-0 py-0' : 'px-6 py-6'}`}>
            {demoMode && !isFullscreen && (
              <div className={`mb-4 px-4 py-3 bg-amber-500/10 border border-amber-500/20 ${RADIUS.surface} flex items-center gap-3`}>
                <div className="p-1.5 bg-amber-500/10 rounded-lg text-amber-400 shrink-0">
                  <Activity className="w-4 h-4" />
                </div>
                <p className="text-xs text-amber-400/90">
                  <span className="font-medium">Viewing demo data</span> — live sync is currently unavailable.
                </p>
              </div>
            )}

            {/* In search mode the results panel renders its own error state */}
            {error && !demoMode && !isFullscreen && !isSearchMode && (
              <div className={`mb-4 p-4 bg-red-500/10 border border-red-500/20 ${RADIUS.surface} flex items-start gap-3`}>
                <div className="p-2 bg-red-500/10 rounded-lg text-red-400 shrink-0">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-red-400">Connection Error</h3>
                  <p className="text-xs text-red-400/80 mt-1">{error}</p>
                </div>
              </div>
            )}

            {/* Search results replace whichever view is active, rather than being a
                view mode of their own — the view-mode list is duplicated in three
                places and adding a member means touching all of them. */}
            {isSearchMode ? (
              <SearchResultsView
                events={events}
                query={debouncedSearch}
                loading={loadingEvents}
                hasMore={searchHasMore}
                error={error}
                isFullscreen={isFullscreen}
              />
            ) : loadingEvents ? (
              <div className="flex items-center justify-center py-24">
                <div className="w-6 h-6 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {activeView === 'log' && <LogView events={events} date={date} isFullscreen={isFullscreen} />}
                {activeView === 'vertical' && (
                  <TimelineView events={events} date={date} onDateChange={setDate} isFullscreen={isFullscreen} />
                )}
                {activeView === 'calendar' && (
                  <CalendarView events={events} date={date} onDateChange={setDate} isFullscreen={isFullscreen} />
                )}
                {activeView === 'swimlane' && (
                  <SwimlaneView events={events} date={date} onDateChange={setDate} isFullscreen={isFullscreen} />
                )}
              </>
            )}
          </div>
        ) : (
          <div className="px-6 py-6 h-full">
            <SummaryView date={date} />
          </div>
        )}
      </div>
    </div>
  );
}
