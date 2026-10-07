'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  Activity,
  DollarSign,
  Cpu,
  Clock,
  Database,
  Server,
  Zap,
  Radio,
  Layers,
  ArrowUpRight,
  Building2,
  ChevronDown,
  FileText,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { CustomDropdown } from '@/components/ui/CustomDropdown';

interface ActionBreakdown {
  count: number;
  billedCostUsd: number;
  rawCostUsd: number;
  profitMarginUsd: number;
  tokens: number;
}

interface OrgResumeStat {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  analysisCount: number;
  billedCostUsd: number;
  rawCostUsd: number;
  tokensConsumed: number;
  profitMarginUsd: number;
}

interface ResumeStatsSuper {
  role: 'super_admin';
  totalAnalyses: number;
  totalTokens: number;
  billedCostUsd: number;
  rawCostUsd: number;
  profitMarginUsd: number;
  orgBreakdown: OrgResumeStat[];
}

interface TelemetryData {
  timeframe: string;
  totalEvaluations: number;
  totalRawCostUsd: number;
  totalBilledCostUsd: number;
  profitMarginUsd: number;
  avgLatencyMs: number;
  totalTokens: number;
  resumeAnalysis?: ActionBreakdown;
  regularEval?: ActionBreakdown;
  timeSeries: Array<{
    timestamp: string;
    rawCost: number;
    billedCost: number;
    profit: number;
    latencyMs: number;
  }>;
  serverHealth: {
    uptimeSeconds: number;
    memoryUsageMb: number;
    dbPool: {
      totalCount: number;
      idleCount: number;
      waitingCount: number;
    };
    tableCounts: {
      organizations: number;
      users: number;
      ledgerEntries: number;
      matchedJds: number;
    };
  };
}

export default function TelemetryPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [timeframe, setTimeframe] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [data, setData] = useState<TelemetryData | null>(null);
  const [resumeStats, setResumeStats] = useState<ResumeStatsSuper | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSseActive, setIsSseActive] = useState(false);
  const [pulseCount, setPulseCount] = useState(0);

  interface OrgOption {
    id: string;
    name: string;
    slug: string;
  }
  const [organizations, setOrganizations] = useState<OrgOption[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('all');

  useEffect(() => {
    setIsMounted(true);
    apiRequest('/orgs')
      .then((orgs) => setOrganizations(orgs || []))
      .catch((err) => console.error('Failed to load orgs for telemetry:', err));
  }, []);

  const fetchStats = async () => {
    try {
      const orgQuery = selectedOrgId !== 'all' ? `&organizationId=${selectedOrgId}` : '';
      const [telemetryResult, resumeResult] = await Promise.all([
        apiRequest(`/telemetry/stats?timeframe=${timeframe}${orgQuery}`),
        apiRequest('/analyze/resume-stats'),
      ]);
      setData(telemetryResult);
      setResumeStats(resumeResult);
    } catch (err) {
      console.error('Failed to load telemetry stats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [timeframe, selectedOrgId]);

  // Connect to live Fastify SSE endpoint
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    // Use EventSource
    const eventSource = new EventSource(`http://localhost:4000/api/telemetry/stream`);

    eventSource.onopen = () => {
      setIsSseActive(true);
    };

    eventSource.addEventListener('connected', () => {
      setIsSseActive(true);
    });

    eventSource.addEventListener('evaluation', (event: any) => {
      setPulseCount((prev) => prev + 1);
      // Refresh aggregates when evaluation occurs
      fetchStats();
    });

    eventSource.addEventListener('health_pulse', (event: any) => {
      const pulse = JSON.parse(event.data);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          serverHealth: {
            ...prev.serverHealth,
            uptimeSeconds: pulse.data.uptimeSeconds,
            dbPool: {
              ...prev.serverHealth.dbPool,
              totalCount: pulse.data.dbConnections || prev.serverHealth.dbPool.totalCount,
            },
          },
        };
      });
    });

    eventSource.onerror = () => {
      setIsSseActive(false);
    };

    return () => {
      eventSource.close();
      setIsSseActive(false);
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Platform Telemetry</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Real-time metrics, profit margins, latency, and database pool health.
          </p>
        </div>

        {/* Filters: Agency Dropdown and Timeframe */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Requirement 6: Agency Filter Dropdown */}
          <div className="w-56">
            <CustomDropdown
              size="sm"
              value={selectedOrgId}
              onChange={setSelectedOrgId}
              options={[
                { value: 'all', label: 'All Agencies', badge: `${organizations.length}` },
                ...organizations.map((org) => ({
                  value: org.id,
                  label: org.name,
                  sublabel: org.slug,
                })),
              ]}
              icon={<Building2 className="h-3.5 w-3.5" />}
              placeholder="Filter by Agency"
            />
          </div>

          {/* Timeframe Filter Dropdown */}
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-1 shadow-xs backdrop-blur">
            {(['1h', '24h', '7d', '30d'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTimeframe(t)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${timeframe === t
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Net Profit Margin */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Net Profit Margin</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {formatCurrency(data?.profitMarginUsd || 0)}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Billed: {formatCurrency(data?.totalBilledCostUsd || 0)} | Provider Cost: {formatCurrency(data?.totalRawCostUsd || 0)}
          </p>
        </div>

        {/* AI Inference Latency */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Average Latency</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{data?.avgLatencyMs || 0} ms</span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">P50 / P95</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Target &lt; 4000ms
          </p>
        </div>

        {/* Total Evaluations */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Evaluations Run</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <Zap className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{data?.totalEvaluations || 0}</span>
            <span className="text-xs font-medium text-violet-600 dark:text-violet-400">+{pulseCount} live events</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Selected timeframe ({timeframe})
          </p>
        </div>

        {/* Tokens Processed */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Tokens Processed</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Cpu className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {(data?.totalTokens || 0).toLocaleString()}
            </span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Tokens</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Total tokens
          </p>
        </div>
      </div>

      {/* Service Channel Breakdown Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Card 1: Resume Analysis Intelligence (Stealth 3x) */}
        <div className="relative overflow-hidden rounded-2xl border border-purple-200 dark:border-purple-500/30 bg-gradient-to-br from-purple-50 via-white to-purple-50/50 dark:from-purple-950/40 dark:via-slate-900/80 dark:to-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>Resume Analysis Intelligence</span>
                  <span className="rounded-md border border-purple-200 dark:border-purple-500/30 bg-purple-100 dark:bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 dark:text-purple-300">
                    Stealth Resume
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">AI Deep Resume Breakdown & Scoring</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
                {data?.resumeAnalysis?.billedCostUsd
                  ? `${(((data.resumeAnalysis.profitMarginUsd / data.resumeAnalysis.billedCostUsd) * 100).toFixed(1))}% Margin`
                  : '—'}
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2 border-t border-purple-200 dark:border-purple-500/20 pt-3">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Analyses</span>
              <p className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">{data?.resumeAnalysis?.count || 0}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Billed</span>
              <p className="mt-0.5 text-base font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(data?.resumeAnalysis?.billedCostUsd || 0)}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Raw Cost</span>
              <p className="mt-0.5 text-base font-bold text-indigo-600 dark:text-indigo-400">
                {formatCurrency(data?.resumeAnalysis?.rawCostUsd || 0)}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Net Profit</span>
              <p className="mt-0.5 text-base font-bold text-purple-700 dark:text-purple-300">
                +{formatCurrency(data?.resumeAnalysis?.profitMarginUsd || 0)}
              </p>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            {(data?.resumeAnalysis?.tokens || 0).toLocaleString()} tokens consumed across platform
          </div>
        </div>

        {/* Card 2: Standard JD Evaluations */}
        <div className="relative overflow-hidden rounded-2xl border border-indigo-200 dark:border-indigo-500/30 bg-gradient-to-br from-indigo-50 via-white to-indigo-50/50 dark:from-indigo-950/40 dark:via-slate-900/80 dark:to-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>Job Description Evaluations</span>
                  <span className="rounded-md border border-indigo-200 dark:border-indigo-500/30 bg-indigo-100 dark:bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">
                    Standard Engine
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Real-time candidate evaluation & JD matching</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                {data?.regularEval?.billedCostUsd
                  ? `${(((data.regularEval.profitMarginUsd / data.regularEval.billedCostUsd) * 100).toFixed(1))}% Margin`
                  : '—'}
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2 border-t border-indigo-200 dark:border-indigo-500/20 pt-3">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Evals</span>
              <p className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">{data?.regularEval?.count || 0}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Billed</span>
              <p className="mt-0.5 text-base font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(data?.regularEval?.billedCostUsd || 0)}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Raw Cost</span>
              <p className="mt-0.5 text-base font-bold text-indigo-600 dark:text-indigo-400">
                {formatCurrency(data?.regularEval?.rawCostUsd || 0)}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Net Profit</span>
              <p className="mt-0.5 text-base font-bold text-emerald-700 dark:text-emerald-300">
                +{formatCurrency(data?.regularEval?.profitMarginUsd || 0)}
              </p>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            {(data?.regularEval?.tokens || 0).toLocaleString()} tokens consumed across platform
          </div>
        </div>
      </div>

      {/* Main Charts & Live Telemetry Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recharts Area Chart: Profit Margin & Billed vs Raw */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-xl">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Profit Margin & Cost Trajectory</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Billed revenue vs provider costs over {timeframe}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
              <span className="rounded-lg border border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 px-2.5 py-1 text-[11px] text-purple-700 dark:text-purple-300">
                Resume: {formatCurrency(data?.resumeAnalysis?.billedCostUsd || 0)} billed
              </span>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span className="text-slate-600 dark:text-slate-300">Billed ($)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
                <span className="text-slate-600 dark:text-slate-300">Raw AI ($)</span>
              </div>
            </div>
          </div>

          <div className="h-[280px] w-full">
            {isMounted && data?.timeSeries && data.timeSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.timeSeries}>
                  <defs>
                    <linearGradient id="billedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="rawGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-800" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(str) => {
                      const d = new Date(str);
                      return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
                    }}
                    stroke="#64748b"
                    fontSize={11}
                  />
                  <YAxis stroke="#64748b" fontSize={11} tickFormatter={(val) => `$${val}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      color: '#f8fafc',
                    }}
                    formatter={(val: any) => [`$${Number(val).toFixed(4)}`, '']}
                  />
                  <Area
                    type="monotone"
                    dataKey="billedCost"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#billedGrad)"
                    name="Agency Billed"
                  />
                  <Area
                    type="monotone"
                    dataKey="rawCost"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#rawGrad)"
                    name="Raw AI Cost"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
                No telemetry data available for the selected timeframe.
              </div>
            )}
          </div>
        </div>

        {/* Server & DB Health Widget */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">System Infrastructure</h2>
            <Server className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">Database Pool</span>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Connected</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-xl font-bold text-slate-900 dark:text-white">
                  {data?.serverHealth.dbPool.totalCount || 0}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {data?.serverHealth.dbPool.idleCount || 0} Idle • {data?.serverHealth.dbPool.waitingCount || 0} Waiting
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">Memory Usage</span>
                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  {data?.serverHealth.memoryUsageMb || 0} MB
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-xl font-bold text-slate-900 dark:text-white">
                  {Math.floor((data?.serverHealth.uptimeSeconds || 0) / 3600)}h{' '}
                  {Math.floor(((data?.serverHealth.uptimeSeconds || 0) % 3600) / 60)}m
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">Server Uptime</span>
              </div>
            </div>

            {/* Platform Table Row Counts */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Database Records
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between border-b border-slate-200 dark:border-slate-800/80 pb-1">
                  <span className="text-slate-500 dark:text-slate-400">Agencies</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{data?.serverHealth.tableCounts.organizations || 0}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 dark:border-slate-800/80 pb-1">
                  <span className="text-slate-500 dark:text-slate-400">Users</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{data?.serverHealth.tableCounts.users || 0}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-500 dark:text-slate-400">Ledger Rows</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{data?.serverHealth.tableCounts.ledgerEntries || 0}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-500 dark:text-slate-400">Matched JDs</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{data?.serverHealth.tableCounts.matchedJds || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Super Admin: Platform-Wide Resume Analysis by Agency Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-xl">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Agency Resume Intelligence Breakdown</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Total resume analyses, billed charges, raw AI provider cost, and profit margin across all agencies
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-purple-200 dark:border-purple-500/20 bg-purple-50 dark:bg-purple-950/30 px-3.5 py-1.5 text-xs">
              <span className="text-purple-700 dark:text-purple-300">Total Analyses: </span>
              <span className="font-bold text-slate-900 dark:text-white font-mono">{resumeStats?.totalAnalyses || 0}</span>
            </div>
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-950/30 px-3.5 py-1.5 text-xs">
              <span className="text-emerald-700 dark:text-emerald-300">Total Net Margin: </span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {formatCurrency(resumeStats?.profitMarginUsd || 0)}
              </span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <th className="pb-3 pl-2">Agency</th>
                <th className="pb-3">Resume Analyses</th>
                <th className="pb-3">Tokens Consumed</th>
                <th className="pb-3">Billed Charges (USD)</th>
                <th className="pb-3">Raw AI Cost (USD)</th>
                <th className="pb-3">Net Profit (USD)</th>
                <th className="pb-3 pr-2 text-right">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
              {resumeStats?.orgBreakdown && resumeStats.orgBreakdown.length > 0 ? (
                resumeStats.orgBreakdown.map((org) => {
                  const marginPct =
                    org.billedCostUsd > 0
                      ? ((org.profitMarginUsd / org.billedCostUsd) * 100).toFixed(1)
                      : '0.0';

                  return (
                    <tr key={org.organizationId} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition">
                      <td className="py-3.5 pl-2">
                        <div className="font-medium text-slate-900 dark:text-white">{org.organizationName}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{org.organizationSlug}</div>
                      </td>
                      <td className="py-3.5">
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 px-2.5 py-0.5 text-xs font-bold text-purple-700 dark:text-purple-300">
                          {org.analysisCount}
                        </span>
                      </td>
                      <td className="py-3.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                        {org.tokensConsumed.toLocaleString()}
                      </td>
                      <td className="py-3.5 font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(org.billedCostUsd)}
                      </td>
                      <td className="py-3.5 font-mono text-xs text-indigo-600 dark:text-indigo-400">
                        {formatCurrency(org.rawCostUsd)}
                      </td>
                      <td className="py-3.5 font-bold text-purple-700 dark:text-purple-300">
                        +{formatCurrency(org.profitMarginUsd)}
                      </td>
                      <td className="py-3.5 pr-2 text-right font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                        {marginPct}%
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                    No resume analyses recorded yet across agencies.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
