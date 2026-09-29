'use client';

import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { Activity, PieChart as PieChartIcon, BarChart3 } from 'lucide-react';

interface DailyStat {
  date: string;
  evaluations: number;
  totalTokens?: number;
  cost?: string;
}

interface RecruiterStat {
  recruiterId: string;
  recruiterName: string;
  count?: number;
  evaluations?: number;
  totalTokens?: number;
  cost?: string;
}

interface VerdictStats {
  applyCount: number;
  skipCount: number;
  otherCount: number;
}

interface BillingChartsProps {
  dailyStats?: DailyStat[];
  recruiterBreakdown?: RecruiterStat[];
  verdictStats?: VerdictStats;
  totalEvaluations: number;
}

const VERDICT_COLORS = ['#10B981', '#EF4444', '#6B7280'];

// Custom High-Contrast Tooltip for Pie Chart
const CustomPieTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const item = payload[0];
    const isApply = item.name?.toLowerCase().includes('apply');
    const color = item.payload?.color || (isApply ? '#10B981' : '#EF4444');
    const title = isApply ? 'Apply (Match)' : 'Skip (No Match)';
    const count = Number(item.value) || 0;

    return (
      <div className="rounded-xl border border-slate-700/80 bg-slate-950/95 px-3.5 py-2.5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0 shadow-sm"
            style={{ backgroundColor: color }}
          />
          <span className="text-xs font-bold text-white tracking-tight">{title}</span>
        </div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-base font-extrabold text-white font-mono">{count}</span>
          <span className="text-xs font-medium text-slate-400">
            {count === 1 ? 'evaluation' : 'evaluations'}
          </span>
        </div>
      </div>
    );
  }
  return null;
};

export default function BillingCharts({
  dailyStats = [],
  recruiterBreakdown = [],
  verdictStats,
  totalEvaluations,
}: BillingChartsProps) {
  const verdictChartData = verdictStats
    ? [
        { name: 'Apply (Match)', value: verdictStats.applyCount, color: '#10B981' },
        { name: 'Skip (No Match)', value: verdictStats.skipCount, color: '#EF4444' },
        ...(verdictStats.otherCount > 0 ? [{ name: 'Other', value: verdictStats.otherCount, color: '#6B7280' }] : []),
      ].filter((d) => d.value > 0)
    : [];

  return (
    <div className="space-y-6">
      {/* 2-Column Grid: Trend Chart & Verdict Chart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Chart 1: Daily Evaluation Velocity (Area Chart) */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-violet-400" />
                <h3 className="text-sm font-bold text-white">Evaluations & Token Volume Trend</h3>
              </div>
              <p className="text-xs text-slate-400">Daily evaluation count over the last 14 days</p>
            </div>
            <span className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-300">
              {totalEvaluations} Total Run
            </span>
          </div>

          <div className="h-64 w-full">
            {dailyStats && dailyStats.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={dailyStats}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="evalGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#64748B"
                    fontSize={11}
                    tickFormatter={(val) => (typeof val === 'string' ? val.slice(5) : val)}
                  />
                  <YAxis stroke="#64748B" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#020617',
                      borderColor: '#334155',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                      color: '#F8FAFC',
                      boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5)',
                    }}
                    itemStyle={{ color: '#F8FAFC' }}
                    labelStyle={{ color: '#FFFFFF', fontWeight: 'bold' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="evaluations"
                    stroke="#8B5CF6"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#evalGradient)"
                    name="Evaluations"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">
                No evaluation trend history available yet.
              </div>
            )}
          </div>
        </div>

        {/* Chart 2: Match Verdict Distribution (Donut Chart) */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <PieChartIcon className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Verdict Distribution</h3>
              </div>
              <p className="text-xs text-slate-400">Match recommendation outcomes</p>
            </div>
          </div>

          <div className="flex h-64 flex-col items-center justify-center">
            {verdictChartData.length > 0 ? (
              <>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={verdictChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {verdictChartData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.color}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomPieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    <span className="text-slate-300">
                      Apply ({verdictStats?.applyCount || 0})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                    <span className="text-slate-300">
                      Skip ({verdictStats?.skipCount || 0})
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center text-xs text-slate-500">
                <p>No evaluations recorded yet.</p>
                <p className="mt-1 text-[11px] text-slate-600">Run candidate matches to populate verdicts.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chart 3: Recruiter Evaluation Share (Bar Chart) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white">Recruiter Activity Distribution</h3>
            </div>
            <p className="text-xs text-slate-400">Total evaluations executed per recruiter seat</p>
          </div>
        </div>

        <div className="h-56 w-full">
          {recruiterBreakdown && recruiterBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={recruiterBreakdown}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis dataKey="recruiterName" stroke="#64748B" fontSize={11} />
                <YAxis stroke="#64748B" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#020617',
                    borderColor: '#334155',
                    borderRadius: '0.75rem',
                    fontSize: '12px',
                    color: '#F8FAFC',
                    boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5)',
                  }}
                  itemStyle={{ color: '#F8FAFC' }}
                  labelStyle={{ color: '#FFFFFF', fontWeight: 'bold' }}
                  formatter={(val: any) => [`${val} evaluations`, 'Evaluations']}
                />
                <Bar
                  dataKey="count"
                  fill="#6366F1"
                  radius={[6, 6, 0, 0]}
                  name="Evaluations Run"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              No recruiter activity recorded yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
