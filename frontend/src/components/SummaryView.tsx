'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fetchSummary } from '@/lib/api';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  LineChart, Line
} from 'recharts';
import { Clock, Activity, MonitorSmartphone, TrendingUp, GitCompareArrows } from 'lucide-react';
import {
  getActivityHex,
  getActivityToken,
  isDurationType,
  DEFAULT_ACTIVITY_COLOR,
  RADIUS,
} from '@/lib/design-tokens';
import { formatTimeFromMinutes, getShiftedDate } from '@/lib/timeline-utils';

interface SummaryViewProps {
  date: string;
}

type CompareMode = 'none' | 'prev_period' | 'prev_week' | 'custom';

// Custom Tooltips
const CustomPieTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 shadow-md">
        <p className="text-sm font-medium text-zinc-100 capitalize mb-1">{data.activity_type}</p>
        <p className="text-xs text-zinc-400">Duration: <span className="font-mono text-zinc-200">{formatTimeFromMinutes(data.total_minutes)}</span></p>
        <p className="text-xs text-zinc-400 mt-0.5">Events: <span className="font-mono text-zinc-200">{data.event_count}</span></p>
      </div>
    );
  }
  return null;
};

const CustomBarTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 shadow-md">
        <p className="text-sm font-medium text-zinc-100 mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} className="text-xs text-zinc-400">
            {p.name}: <span className="font-mono text-zinc-200" style={{ color: p.color }}>{formatTimeFromMinutes(p.value)}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// Helpers for date ranges
function getPeriodRanges(period: 'day' | 'week' | 'month', anchorDateStr: string) {
  const anchor = new Date(anchorDateStr + 'T00:00:00');
  let currentStart = new Date(anchor);
  let currentEnd = new Date(anchor);

  if (period === 'day') {
    // single day — start and end are the same
  } else if (period === 'week') {
    const day = anchor.getDay();
    const diff = anchor.getDate() - day + (day === 0 ? -6 : 1);
    currentStart = new Date(anchor);
    currentStart.setDate(diff);
    currentEnd = new Date(currentStart);
    currentEnd.setDate(currentStart.getDate() + 6);
  } else if (period === 'month') {
    currentStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    currentEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  }

  return {
    start: currentStart.toLocaleDateString('en-CA'),
    end: currentEnd.toLocaleDateString('en-CA'),
  };
}

function getCompareRanges(
  period: 'day' | 'week' | 'month',
  anchorDateStr: string,
  mode: CompareMode,
  customDate?: string
): { compareStart: string; compareEnd: string } | null {
  if (mode === 'none') return null;

  const current = getPeriodRanges(period, anchorDateStr);

  if (mode === 'custom' && customDate) {
    const customRanges = getPeriodRanges(period, customDate);
    return { compareStart: customRanges.start, compareEnd: customRanges.end };
  }

  if (mode === 'prev_week') {
    // Compare to the same day/period one week ago
    const shifted = getShiftedDate(anchorDateStr, -7);
    const shiftedRanges = getPeriodRanges(period, shifted);
    return { compareStart: shiftedRanges.start, compareEnd: shiftedRanges.end };
  }

  // prev_period: previous day / previous week / previous month
  const anchor = new Date(anchorDateStr + 'T00:00:00');
  let compareStart: Date;
  let compareEnd: Date;

  if (period === 'day') {
    compareStart = new Date(anchor);
    compareStart.setDate(anchor.getDate() - 1);
    compareEnd = new Date(compareStart);
  } else if (period === 'week') {
    const cs = new Date(current.start + 'T00:00:00');
    const ce = new Date(current.end + 'T00:00:00');
    compareStart = new Date(cs);
    compareStart.setDate(cs.getDate() - 7);
    compareEnd = new Date(ce);
    compareEnd.setDate(ce.getDate() - 7);
  } else {
    compareStart = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
    compareEnd = new Date(anchor.getFullYear(), anchor.getMonth(), 0);
  }

  return {
    compareStart: compareStart.toLocaleDateString('en-CA'),
    compareEnd: compareEnd.toLocaleDateString('en-CA'),
  };
}

function getCompareLabel(period: 'day' | 'week' | 'month', mode: CompareMode, customDate?: string): string {
  if (mode === 'prev_period') {
    return `vs. previous ${period}`;
  }
  if (mode === 'prev_week') {
    return period === 'day' ? 'vs. same day last week' : `vs. same ${period} last week`;
  }
  if (mode === 'custom' && customDate) {
    const d = new Date(customDate + 'T12:00:00');
    return `vs. ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
  return '';
}

export default function SummaryView({ date }: SummaryViewProps) {
  const { session } = useAuth();
  
  // Local state for period and comparison
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [compareMode, setCompareMode] = useState<CompareMode>('none');
  const [customCompareDate, setCustomCompareDate] = useState<string>('');
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [compareLoading, setCompareLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  // Track whether we already have current period data to avoid full-page spinner on comparison toggle
  const hasCurrentData = useRef(false);

  // Compute effective comparison ranges
  const compareRanges = compareMode !== 'none'
    ? getCompareRanges(period, date, compareMode, customCompareDate || undefined)
    : null;

  const isComparing = compareRanges !== null;

  // Fetch data — use compareLoading for comparison-only changes to avoid full remount
  useEffect(() => {
    async function load() {
      if (!session) return;

      // If we already have current period data loaded and only the comparison changed,
      // use a lighter loading state that doesn't unmount the charts
      const isComparisonOnlyChange = hasCurrentData.current;

      if (isComparisonOnlyChange) {
        setCompareLoading(true);
      } else {
        setLoading(true);
      }

      setError(null);
      try {
        const ranges = getPeriodRanges(period, date);
        const result = await fetchSummary(
          session, 
          ranges.start, 
          ranges.end, 
          compareRanges?.compareStart,
          compareRanges?.compareEnd
        );
        setDemoMode(!!(result as any).__demo);
        setData(result);
        hasCurrentData.current = true;
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
        setCompareLoading(false);
      }
    }
    load();
  }, [date, period, compareRanges?.compareStart, compareRanges?.compareEnd, session]);

  // Reset hasCurrentData when date or period changes fundamentally
  useEffect(() => {
    hasCurrentData.current = false;
  }, [date, period]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !demoMode) {
    return (
      <div className={`p-4 bg-red-500/10 border border-red-500/20 ${RADIUS.surface} flex items-start gap-3`}>
        <div className="p-2 bg-red-500/10 rounded-lg text-red-400 shrink-0">
          <Activity className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-red-400">Connection Error</h3>
          <p className="text-xs text-red-400/80 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!data || data.current_period.total_active_time_minutes === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-zinc-500">
        <Activity className="w-12 h-12 mb-4 opacity-20" strokeWidth={1} />
        <p className="text-sm font-medium text-zinc-400">No activity recorded</p>
        <p className="text-xs mt-1 text-zinc-600">Track some events to see your summary for this period.</p>
        <div className="mt-4 flex gap-2 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
          {(['day', 'week', 'month'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs rounded-md capitalize transition-colors duration-150 cursor-pointer ${
                period === p ? 'bg-zinc-800 text-zinc-200 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const cp = data.current_period;
  const cmp = data.comparison_period;

  // Trend-chart series are derived from the activity types actually present in the
  // response, not from a static list. Iterating a fixed list meant any type missing
  // from it was silently absent from the chart while still being counted in the pie
  // chart below — the two disagreed by 66 of 76 hours. Deriving from the data means
  // a new type from a future client version can never go missing again.
  type TrendPoint = { date: string; activity_type: string; total_minutes: number };
  type TrendRow = { date: string } & Record<string, number | string>;

  const trendRows: TrendRow[] = Object.values(
    (cp.time_series as TrendPoint[]).reduce((acc: Record<string, TrendRow>, curr) => {
      if (!acc[curr.date]) acc[curr.date] = { date: curr.date };
      acc[curr.date][curr.activity_type] = curr.total_minutes;
      return acc;
    }, {})
  );

  const trendSeries = Array.from(
    new Set((cp.time_series as TrendPoint[]).map((t) => t.activity_type))
  )
    // Signals (notifications, screen on/off) are instantaneous — plotting them as
    // "minutes spent" would be meaningless.
    .filter((type) => isDurationType(type))
    .map((type) => {
      const token = getActivityToken(type);
      return {
        value: type,
        hex: token.hex,
        label: 'label' in token ? token.label : (type as string),
      };
    });

  // Calculate Deltas
  const totalDelta = cmp ? ((cp.total_active_time_minutes - cmp.total_active_time_minutes) / Math.max(1, cmp.total_active_time_minutes)) * 100 : 0;
  
  // Prepare Comparison Top Apps Data (Merge)
  const topAppsData = cp.top_applications.map((app: any) => {
    const compareApp = cmp?.top_applications.find((a: any) => a.activity_name === app.activity_name);
    return {
      activity_name: app.activity_name,
      activity_type: app.activity_type,
      current_minutes: app.total_minutes,
      compare_minutes: compareApp ? compareApp.total_minutes : 0,
    };
  });

  // Compare option definitions based on current period
  const compareOptions: { value: CompareMode; label: string }[] = [
    { value: 'none', label: 'No comparison' },
    { value: 'prev_period', label: `Previous ${period}` },
    ...(period === 'day'
      ? [{ value: 'prev_week' as CompareMode, label: 'Same day last week' }]
      : [{ value: 'prev_week' as CompareMode, label: `Same ${period} last week` }]),
    { value: 'custom', label: 'Custom date...' },
  ];

  return (
    <div className={`space-y-6 ${compareLoading ? 'opacity-60 pointer-events-none' : ''}`} style={{ transition: 'opacity 150ms' }}>

      {demoMode && (
        <div className={`px-4 py-3 bg-amber-500/10 border border-amber-500/20 ${RADIUS.surface} flex items-center gap-3`}>
          <div className="p-1.5 bg-amber-500/10 rounded-lg text-amber-400 shrink-0">
            <Activity className="w-4 h-4" />
          </div>
          <p className="text-xs text-amber-400/90">
            <span className="font-medium">Viewing demo data</span> — live sync is currently unavailable.
          </p>
        </div>
      )}
      
      {/* Controls Bar */}
      <div className={`flex flex-wrap gap-4 items-center justify-between bg-zinc-900/40 border border-zinc-800/80 ${RADIUS.surface} p-3`}>
        {/* Period Selector */}
        <div className="flex items-center gap-1 bg-zinc-950/50 p-1 rounded-lg border border-zinc-800/60">
          {(['day', 'week', 'month'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md capitalize transition-colors duration-150 cursor-pointer ${
                period === p 
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
              type="button"
            >
              {p}
            </button>
          ))}
        </div>

        {/* Comparison Controls */}
        <div className="flex items-center gap-2">
          <GitCompareArrows className="w-3.5 h-3.5 text-zinc-500 shrink-0" />

          {/* Compare Mode Selector */}
          <div className="flex items-center gap-1 bg-zinc-950/50 p-0.5 rounded-lg border border-zinc-800/60">
            {compareOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => {
                  setCompareMode(opt.value);
                  // Reset custom date when switching away from custom
                  if (opt.value !== 'custom') setCustomCompareDate('');
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors duration-150 cursor-pointer whitespace-nowrap ${
                  compareMode === opt.value
                    ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
                type="button"
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Custom Date Picker (inline, only when custom mode is active) */}
          {compareMode === 'custom' && (
            <div className="flex items-center gap-1.5 bg-zinc-950/50 px-2.5 py-1 rounded-lg border border-zinc-800/60">
              <svg className="w-3.5 h-3.5 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <input
                type="date"
                value={customCompareDate}
                onChange={(e) => setCustomCompareDate(e.target.value)}
                className="bg-transparent border-none text-zinc-200 text-xs font-mono font-medium
                           focus:outline-none cursor-pointer [color-scheme:dark] w-[7.5rem]"
              />
            </div>
          )}

          {/* Active comparison label */}
          {isComparing && (
            <span className="text-[11px] font-mono text-zinc-500 hidden sm:inline">
              {getCompareLabel(period, compareMode, customCompareDate || undefined)}
            </span>
          )}
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={`bg-zinc-900/40 border border-zinc-800/80 ${RADIUS.surface} p-5`}>
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <Clock className="w-4 h-4" />
            <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-[0.15em]">Total Active Time</span>
          </div>
          <div className="flex items-baseline gap-3">
            <p className="text-3xl font-semibold text-zinc-100 font-mono">
              {formatTimeFromMinutes(cp.total_active_time_minutes)}
            </p>
            {isComparing && cmp && (
              <div className="flex flex-col">
                <span className={`text-sm font-medium font-mono ${totalDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {totalDelta >= 0 ? '+' : ''}{totalDelta.toFixed(1)}%
                </span>
                <span className="text-[10px] font-mono text-zinc-500">
                  was {formatTimeFromMinutes(cmp.total_active_time_minutes)}
                </span>
              </div>
            )}
          </div>
        </div>
        
        <div className={`bg-zinc-900/40 border border-zinc-800/80 ${RADIUS.surface} p-5`}>
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <Activity className="w-4 h-4" />
            <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-[0.15em]">Total Events</span>
          </div>
          <div className="flex items-baseline gap-3">
            <p className="text-3xl font-semibold text-zinc-100 font-mono">
              {cp.activity_breakdown.reduce((acc: number, curr: any) => acc + curr.event_count, 0)}
            </p>
            {isComparing && cmp && (
              <span className="text-[10px] font-mono text-zinc-500">
                was {cmp.activity_breakdown.reduce((acc: number, curr: any) => acc + curr.event_count, 0)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Time Series Line Chart */}
      {cp.time_series && cp.time_series.length > 0 && period !== 'day' && (
        <div className={`bg-zinc-900/40 border border-zinc-800/80 ${RADIUS.surface} p-6 flex flex-col`}>
          <h3 className="text-sm font-medium text-zinc-100 mb-6 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-zinc-400" />
            Trend over {period}
          </h3>
          <div className="w-full h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendRows}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                <XAxis dataKey="date" tick={{ fill: '#a1a1aa', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis hide />
                <RechartsTooltip content={<CustomBarTooltip />} cursor={{ fill: '#27272a', opacity: 0.1 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
                
                {trendSeries.map(t => (
                  <Line
                    key={t.value}
                    type="monotone"
                    dataKey={t.value}
                    name={t.label}
                    stroke={t.hex}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Pie Chart: Activity Breakdown */}
        <div className={`bg-zinc-900/40 border border-zinc-800/80 ${RADIUS.surface} p-6 flex flex-col`}>
          <h3 className="text-sm font-medium text-zinc-100 mb-6 flex items-center gap-2">
            <Activity className="w-4 h-4 text-zinc-400" />
            Time by Category
          </h3>
          <div className="flex-1 min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={cp.activity_breakdown}
                  dataKey="total_minutes"
                  nameKey="activity_type"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {cp.activity_breakdown.map((entry: any, index: number) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={getActivityHex(entry.activity_type)} 
                      stroke="transparent"
                    />
                  ))}
                </Pie>
                <RechartsTooltip content={<CustomPieTooltip />} cursor={{ fill: 'transparent' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 justify-center">
            {cp.activity_breakdown.map((item: any) => (
              <div key={item.activity_type} className="flex items-center gap-1.5">
                <div 
                  className="w-2 h-2 rounded-full" 
                  style={{ backgroundColor: getActivityHex(item.activity_type) }} 
                />
                <span className="text-xs text-zinc-400 capitalize">{item.activity_type}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bar Chart: Top Apps */}
        <div className={`bg-zinc-900/40 border border-zinc-800/80 ${RADIUS.surface} p-6 flex flex-col`}>
          <h3 className="text-sm font-medium text-zinc-100 mb-6 flex items-center gap-2">
            <MonitorSmartphone className="w-4 h-4 text-zinc-400" />
            Top Applications
          </h3>
          <div className="flex-1 min-h-[250px] -ml-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topAppsData}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#27272a" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="activity_name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={(props: any) => {
                    const { x, y, payload } = props;
                    const value = payload.value || '';
                    const displayValue = value.length > 22 ? `${value.slice(0, 19)}...` : value;
                    return (
                      <g transform={`translate(${x},${y})`}>
                        <text
                          x={-130}
                          y={4}
                          fill="#a1a1aa"
                          fontSize={11}
                          textAnchor="start"
                        >
                          {displayValue}
                        </text>
                      </g>
                    );
                  }}
                  width={140}
                />
                <RechartsTooltip content={<CustomBarTooltip />} cursor={{ fill: '#27272a', opacity: 0.4 }} />
                <Bar 
                  dataKey="current_minutes" 
                  name="Current Period"
                  radius={[0, 4, 4, 0]}
                  barSize={16}
                >
                  {topAppsData.map((entry: any, index: number) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={getActivityHex(entry.activity_type)} 
                    />
                  ))}
                </Bar>
                {isComparing && (
                  <Bar 
                    dataKey="compare_minutes" 
                    name="Previous Period"
                    fill="#3f3f46" // zinc-700
                    radius={[0, 4, 4, 0]}
                    barSize={16}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
