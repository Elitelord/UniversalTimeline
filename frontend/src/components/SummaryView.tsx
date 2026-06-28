'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fetchSummary } from '@/lib/api';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid 
} from 'recharts';
import { Clock, Activity, MonitorSmartphone } from 'lucide-react';

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

// Custom Tooltip for Recharts Pie
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

// Custom Tooltip for Recharts Bar
const CustomBarTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 shadow-xl">
        <p className="text-sm font-medium text-zinc-100 mb-1">{label}</p>
        <p className="text-xs text-zinc-400">Time spent: <span className="font-medium text-zinc-200">{formatTimeFromMinutes(payload[0].value)}</span></p>
      </div>
    );
  }
  return null;
};

export default function SummaryView({ date }: SummaryViewProps) {
  const { session } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!session) return;
      setLoading(true);
      setError(null);
      try {
        const result = await fetchSummary(session, date);
        setData(result);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [date, session]);

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

  if (!data || data.total_active_time_minutes === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-zinc-500">
        <Activity className="w-12 h-12 mb-4 opacity-20" strokeWidth={1} />
        <p className="text-sm font-medium text-zinc-400">No activity recorded</p>
        <p className="text-xs mt-1 text-zinc-600">Track some events to see your daily summary</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-5 backdrop-blur-xl">
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Total Active Time</span>
          </div>
          <p className="text-3xl font-semibold text-zinc-100">
            {formatTimeFromMinutes(data.total_active_time_minutes)}
          </p>
        </div>
        
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-5 backdrop-blur-xl">
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <Activity className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Total Events</span>
          </div>
          <p className="text-3xl font-semibold text-zinc-100">
            {data.activity_breakdown.reduce((acc: number, curr: any) => acc + curr.event_count, 0)}
          </p>
        </div>
      </div>

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
                  data={data.activity_breakdown}
                  dataKey="total_minutes"
                  nameKey="activity_type"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {data.activity_breakdown.map((entry: any, index: number) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={ACTIVITY_COLORS[entry.activity_type] || DEFAULT_COLOR} 
                      stroke="transparent"
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomPieTooltip />} cursor={{ fill: 'transparent' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 justify-center">
            {data.activity_breakdown.map((item: any) => (
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
                data={data.top_applications}
                layout="vertical"
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#27272a" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="activity_name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#a1a1aa', fontSize: 12 }}
                  width={80}
                />
                <Tooltip content={<CustomBarTooltip />} cursor={{ fill: '#27272a', opacity: 0.4 }} />
                <Bar 
                  dataKey="total_minutes" 
                  radius={[0, 4, 4, 0]}
                  barSize={24}
                >
                  {data.top_applications.map((entry: any, index: number) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={ACTIVITY_COLORS[entry.activity_type] || DEFAULT_COLOR} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
