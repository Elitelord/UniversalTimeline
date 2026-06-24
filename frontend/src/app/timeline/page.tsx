'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { fetchTimeline } from '@/lib/api';
import TimelineView from '@/components/TimelineView';

export default function TimelinePage() {
  const { user, session, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [events, setEvents] = useState<any[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Fetch events when date changes
  const loadEvents = useCallback(async () => {
    if (!session) return;

    setLoadingEvents(true);
    setError(null);

    try {
      const data = await fetchTimeline(session, date, date);
      setEvents(data);
    } catch (err: any) {
      setError(err.message);
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }, [session, date]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const goToPreviousDay = () => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    setDate(d.toISOString().split('T')[0]);
  };

  const goToNextDay = () => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    setDate(d.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    setDate(new Date().toISOString().split('T')[0]);
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

  const isToday = date === new Date().toISOString().split('T')[0];

  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-100">Timeline</h1>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{user.email}</span>
          <button
            onClick={signOut}
            className="text-sm text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Date Navigation */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <button
            onClick={goToPreviousDay}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer
                       [color-scheme:dark]"
          />

          <button
            onClick={goToNextDay}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {!isToday && (
            <button
              onClick={goToToday}
              className="px-3 py-2 text-xs font-medium bg-blue-600/20 text-blue-400 border border-blue-500/30 
                         rounded-lg hover:bg-blue-600/30 transition-colors cursor-pointer"
            >
              Today
            </button>
          )}
        </div>

        <div className="text-sm text-gray-400">
          {formatDisplayDate(date)} · {events.length} event{events.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Activity type legend */}
      <div className="flex items-center gap-4 px-6 pb-3 flex-wrap">
        {[
          { type: 'coding', color: 'bg-blue-500' },
          { type: 'browsing', color: 'bg-green-500' },
          { type: 'communication', color: 'bg-purple-500' },
          { type: 'design', color: 'bg-orange-500' },
          { type: 'productivity', color: 'bg-teal-500' },
        ].map(({ type, color }) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-sm ${color}`} />
            <span className="text-xs text-gray-400 capitalize">{type}</span>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-6 pb-8">
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
            Failed to load events: {error}
          </div>
        )}

        {loadingEvents ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <TimelineView events={events} date={date} />
        )}
      </div>
    </div>
  );
}
