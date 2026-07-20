'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fetchSummary } from '@/lib/api';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  LineChart, Line
} from 'recharts';
import { Clock, Activity, MonitorSmartphone, Calendar, TrendingUp } from 'lucide-react';

interface SummaryViewProps {
  date: string;
}

const ACTIVITY_COLORS: Record<string, string> = {
  coding:        '#3b82f6', // blue-500
  browsing:      '#10b981', // emerald-500
  communication: '#a855f7', // purple-500
  design:        '#f59e0b', // amber-500
  productivity:  '#14b8a6', // teal-500
};
const DEFAULT_COLOR = '#71717a'; // zinc-500

function formatTimeFromMinutes(mins: number) {
  const hours = Math.floor(mins / 60);
  const remaining = Math.round(mins % 60);
  if (hours === 0) return `${remaining}m`;
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
}

// Custom Tooltips
const CustomPieTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 shadow-xl">
        <p className="text-sm font-medium text-zinc-100 capitalize mb-1">{data.activity_type}</p>
        <p className="text-xs text-zinc-400">Duration: <span className="font-medium text-zinc-200">{formatTimeFromMinutes(data.total_minutes)}</span></p>
        <p className="text-xs text-zinc-400 mt-0.5">Events: <span className="font-medium text-zinc-200">{data.event_count}</span></p>
      </div>
    );
  }
  return null;
};

const CustomBarTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 shadow-xl">
        <p className="text-sm font-medium text-zinc-100 mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} className="text-xs text-zinc-400">
            {p.name}: <span className="font-medium text-zinc-200" style={{ color: p.color }}>{formatTimeFromMinutes(p.value)}</span>
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
  let compareStart = new Date(anchor);
  let compareEnd = new Date(anchor);

  if (period === 'day') {
    compareStart.setDate(anchor.getDate() - 1);
    compareEnd.setDate(anchor.getDate() - 1);
  } else if (period === 'week') {
    const day = anchor.getDay();
    const diff = anchor.getDate() - day + (day === 0 ? -6 : 1);
    currentStart = new Date(anchor.setDate(diff));
    currentEnd = new Date(currentStart);
    currentEnd.setDate(currentStart.getDate() + 6);
    
    compareStart = new Date(currentStart);
    compareStart.setDate(currentStart.getDate() - 7);
    compareEnd = new Date(currentEnd);
    compareEnd.setDate(currentEnd.getDate() - 7);
  } else if (period === 'month') {
    currentStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    currentEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    
    compareStart = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
    compareEnd = new Date(anchor.getFullYear(), anchor.getMonth(), 0);
  }

  return {
    start: currentStart.toISOString().split('T')[0],
    end: currentEnd.toISOString().split('T')[0],
    compareStart: compareStart.toISOString().split('T')[0],
    compareEnd: compareEnd.toISOString().split('T')[0],
  };
}

export default function SummaryView({ date }: SummaryViewProps) {
  const { session } = useAuth();
  
  // Local state for period and comparison
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [isComparing, setIsComparing] = useState(false);
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!session) return;
      setLoading(true);
      setError(null);
      try {
        const ranges = getPeriodRanges(period, date);
        const result = await fetchSummary(
          session, 
          ranges.start, 
          ranges.end, 
          isComparing ? ranges.compareStart : undefined,
          isComparing ? ranges.compareEnd : undefined
        );
        setData(result);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [date, period, isComparing, session]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
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
        <div className="mt-4 flex gap-2 bg-zinc-900 p-1 rounded-lg">
          {['day', 'week', 'month'].map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p as any)}
              className={`px-3 py-1 text-xs rounded-md capitalize ${period === p ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500'}`}
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

  // Calculate Deltas
  const totalDelta = cmp ? ((cp.total_active_time_minutes - cmp.total_active_time_minutes) / Math.max(1, cmp.total_active_time_minutes)) * 100 : 0;
  
  // Prepare Comparison Top Apps Data (Merge)
  let topAppsData = cp.top_applications.map((app: any) => {
    const compareApp = cmp?.top_applications.find((a: any) => a.activity_name === app.activity_name);
    return {
      activity_name: app.activity_name,
      activity_type: app.activity_type,
      current_minutes: app.total_minutes,
      compare_minutes: compareApp ? compareApp.total_minutes : 0,
    };
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Controls Bar */}
      <div className="flex flex-wrap gap-4 items-center justify-between bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-3 backdrop-blur-xl">
        <div className="flex items-center gap-2 bg-zinc-950/50 p-1 rounded-lg border border-zinc-800/60">
          {(['day', 'week', 'month'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md capitalize transition-colors ${
                period === p 
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
            <input 
              type="checkbox" 
              checked={isComparing} 
              onChange={e => setIsComparing(e.target.checked)}
              className="rounded bg-zinc-900 border-zinc-700 text-blue-500 focus:ring-blue-500/20 focus:ring-offset-zinc-950"
            />
            Compare to previous {period}
          </label>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-5 backdrop-blur-xl">
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Total Active Time</span>
          </div>
          <div className="flex items-baseline gap-3">
            <p className="text-3xl font-semibold text-zinc-100">
              {formatTimeFromMinutes(cp.total_active_time_minutes)}
            </p>
            {isComparing && cmp && (
              <span className={`text-sm font-medium ${totalDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {totalDelta >= 0 ? '+' : ''}{totalDelta.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
        
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-5 backdrop-blur-xl">
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <Activity className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Total Events</span>
          </div>
          <p className="text-3xl font-semibold text-zinc-100">
            {cp.activity_breakdown.reduce((acc: number, curr: any) => acc + curr.event_count, 0)}
          </p>
        </div>
      </div>

      {/* Time Series Line Chart */}
      {cp.time_series && cp.time_series.length > 0 && period !== 'day' && (
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-6 backdrop-blur-xl flex flex-col">
          <h3 className="text-sm font-medium text-zinc-100 mb-6 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-zinc-400" />
            Trend over {period}
          </h3>
          <div className="w-full h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={
                // Transform data: group by date, make activity_types as keys
                Object.values(cp.time_series.reduce((acc: any, curr: any) => {
                  if (!acc[curr.date]) acc[curr.date] = { date: curr.date };
                  acc[curr.date][curr.activity_type] = curr.total_minutes;
                  return acc;
                }, {}))
              }>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                <XAxis dataKey="date" tick={{ fill: '#a1a1aa', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis hide />
                <RechartsTooltip content={<CustomBarTooltip />} cursor={{ fill: '#27272a', opacity: 0.1 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
                
                {Object.keys(ACTIVITY_COLORS).map(type => (
                  <Line 
                    key={type}
                    type="monotone" 
                    dataKey={type} 
                    stroke={ACTIVITY_COLORS[type]} 
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
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-6 backdrop-blur-xl flex flex-col">
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
                      fill={ACTIVITY_COLORS[entry.activity_type] || DEFAULT_COLOR} 
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
                  className="w-2.5 h-2.5 rounded-full" 
                  style={{ backgroundColor: ACTIVITY_COLORS[item.activity_type] || DEFAULT_COLOR }} 
                />
                <span className="text-xs text-zinc-400 capitalize">{item.activity_type}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bar Chart: Top Apps */}
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-6 backdrop-blur-xl flex flex-col">
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
                      fill={ACTIVITY_COLORS[entry.activity_type] || DEFAULT_COLOR} 
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
