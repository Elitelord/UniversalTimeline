'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { fetchTimeline } from '@/lib/api';
import TimelineView from '@/components/TimelineView';
import SummaryView from '@/components/SummaryView';
import { Activity, LayoutDashboard, LogOut, Search, X } from 'lucide-react';

const ACTIVITY_TYPES = [
  { value: 'coding', label: 'Coding', color: 'bg-blue-500' },
  { value: 'browsing', label: 'Browsing', color: 'bg-emerald-500' },
  { value: 'communication', label: 'Communication', color: 'bg-purple-500' },
  { value: 'design', label: 'Design', color: 'bg-amber-500' },
  { value: 'productivity', label: 'Productivity', color: 'bg-teal-500' },
];

export default function TimelinePage() {
  const { user, session, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [date, setDate] = useState(() => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
  });
  const [activeTab, setActiveTab] = useState<'timeline' | 'summary'>('timeline');
  const [events, setEvents] = useState<any[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  // Filter state
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

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

  // Fetch events when date, filters, or debounced search changes
  const loadEvents = useCallback(async () => {
    if (!session) return;

    setLoadingEvents(true);
    setError(null);

    try {
      const filters: { activityTypes?: string[]; search?: string } = {};
      if (activeTypes.length > 0) filters.activityTypes = activeTypes;
      if (debouncedSearch) filters.search = debouncedSearch;

      const data = await fetchTimeline(session, date, date, filters);
      setDemoMode(!!(data as any).__demo);
      setEvents(data);
    } catch (err: any) {
      setError(err.message);
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }, [session, date, activeTypes, debouncedSearch]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const goToPreviousDay = () => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    setDate(d.toLocaleDateString('en-CA'));
  };

  const goToNextDay = () => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    setDate(d.toLocaleDateString('en-CA'));
  };

  const goToToday = () => {
    setDate(new Date().toLocaleDateString('en-CA'));
  };

  const formatDisplayDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const isToday = date === new Date().toLocaleDateString('en-CA');
  const hasActiveFilters = activeTypes.length > 0 || searchInput;

  const toggleType = (type: string) => {
    setActiveTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const clearFilters = () => {
    setActiveTypes([]);
    setSearchInput('');
    setDebouncedSearch('');
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
    <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full h-full bg-zinc-950">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-zinc-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">Timeline</h1>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-400 font-medium hidden sm:inline-block">{user.email}</span>
          <button
            onClick={signOut}
            className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Date Navigation & Tabs */}
      <div className="px-6 py-4 border-b border-zinc-800/80 bg-zinc-950/50 sticky top-0 z-40 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          
          <div className="flex items-center gap-2">
            <button
              onClick={goToPreviousDay}
              className="p-2 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-colors cursor-pointer shadow-sm"
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
              className="p-2 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-colors cursor-pointer shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {!isToday && (
              <button
                onClick={goToToday}
                className="px-3 py-2 ml-1 text-xs font-semibold bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors cursor-pointer shadow-sm"
              >
                Today
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => setActiveTab('timeline')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                activeTab === 'timeline'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <Activity className="w-4 h-4" />
              Timeline
            </button>
            <button
              onClick={() => setActiveTab('summary')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                activeTab === 'summary'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Summary
            </button>
          </div>
        </div>
      </div>

      {/* Filter Bar (Timeline tab only) */}
      {activeTab === 'timeline' && (
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
                           focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:border-zinc-500 transition-all"
              />
              {searchInput && (
                <button
                  onClick={() => { setSearchInput(''); setDebouncedSearch(''); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Activity Type Toggle Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {ACTIVITY_TYPES.map((t) => {
                const isActive = activeTypes.includes(t.value);
                return (
                  <button
                    key={t.value}
                    onClick={() => toggleType(t.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                      isActive
                        ? 'bg-zinc-800 text-zinc-100 border-zinc-700'
                        : 'bg-zinc-900/50 text-zinc-500 border-zinc-800/80 hover:text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${t.color} ${isActive ? 'opacity-100' : 'opacity-40'}`} />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-100 border border-zinc-800 rounded-lg hover:bg-zinc-800/50 transition-colors cursor-pointer"
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
          <div className="px-6 py-6 h-full flex flex-col">
            {demoMode && (
              <div className="mb-4 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3">
                <div className="p-1.5 bg-amber-500/10 rounded-lg text-amber-400 shrink-0">
                  <Activity className="w-4 h-4" />
                </div>
                <p className="text-xs text-amber-400/90">
                  <span className="font-medium">Viewing demo data</span> — live sync is currently unavailable.
                </p>
              </div>
            )}

            {error && !demoMode && (
              <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                <div className="p-2 bg-red-500/10 rounded-lg text-red-400 shrink-0">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-red-400">Connection Error</h3>
                  <p className="text-xs text-red-400/80 mt-1">{error}</p>
                </div>
              </div>
            )}

            {loadingEvents ? (
              <div className="flex items-center justify-center py-24">
                <div className="w-6 h-6 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <TimelineView events={events} date={date} />
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

