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
} from 'lucide-react';

interface TelemetryData {
  timeframe: string;
  totalEvaluations: number;
  totalRawCostUsd: number;
  totalBilledCostUsd: number;
  profitMarginUsd: number;
  avgLatencyMs: number;
  totalTokens: number;
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSseActive, setIsSseActive] = useState(false);
  const [pulseCount, setPulseCount] = useState(0);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const fetchStats = async () => {
    try {
      const result = await apiRequest(`/telemetry/stats?timeframe=${timeframe}`);
      setData(result);
    } catch (err) {
      console.error('Failed to load telemetry stats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [timeframe]);

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
            <h1 className="text-2xl font-bold tracking-tight text-white">Platform Telemetry</h1>
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
              <span className={`h-2 w-2 rounded-full bg-emerald-500 ${isSseActive ? 'animate-ping' : ''}`} />
              <span>{isSseActive ? 'SSE LIVE STREAM ACTIVE' : 'CONNECTING SSE...'}</span>
            </div>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Real-time LLM token ledger, profit margins, AI inference latency, and database pool health.
          </p>
        </div>

        {/* Timeframe Filter Dropdown */}
        <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/60 p-1 backdrop-blur">
          {(['1h', '24h', '7d', '30d'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
                timeframe === t
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Net Profit Margin */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Net Profit Margin</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">
              {formatCurrency(data?.profitMarginUsd || 0)}
            </span>
            <span className="inline-flex items-center text-xs font-semibold text-emerald-400">
              <ArrowUpRight className="h-3.5 w-3.5" />
              <span>4.0x Billed</span>
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Billed: {formatCurrency(data?.totalBilledCostUsd || 0)} | Gemini Cost: {formatCurrency(data?.totalRawCostUsd || 0)}
          </p>
        </div>

        {/* AI Inference Latency */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Average Latency</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{data?.avgLatencyMs || 0} ms</span>
            <span className="text-xs font-medium text-slate-400">P50 / P95</span>
          </div>
          <p className="mt-1 text-[11px] text-indigo-400">
            Target &lt; 800ms • Gemini 3.5 Flash-Lite
          </p>
        </div>

        {/* Total Evaluations */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Evaluations Run</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
              <Zap className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{data?.totalEvaluations || 0}</span>
            <span className="text-xs font-medium text-violet-400">+{pulseCount} live events</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Over selected timeframe ({timeframe})
          </p>
        </div>

        {/* Tokens Processed */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Tokens Processed</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
              <Cpu className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">
              {(data?.totalTokens || 0).toLocaleString()}
            </span>
            <span className="text-xs font-medium text-slate-400">Tokens</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Exact token ledger accounting ($0.30 in / $2.50 out)
          </p>
        </div>
      </div>

      {/* Main Charts & Live Telemetry Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recharts Area Chart: Profit Margin & Billed vs Raw */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">Profit Margin & Cost Trajectory</h2>
              <p className="text-xs text-slate-400">
                Visualizing agency billed revenue against Gemini 3.5 Flash-Lite API consumption
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span className="text-slate-300">Billed Cost ($)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
                <span className="text-slate-300">Raw Gemini Cost ($)</span>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
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
                No telemetry points in the selected timeframe yet. Run an evaluation via extension.
              </div>
            )}
          </div>
        </div>

        {/* Server & DB Health Widget */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-white">System Infrastructure</h2>
            <Server className="h-5 w-5 text-indigo-400" />
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">PostgreSQL Pool (Supabase)</span>
                <span className="text-xs font-semibold text-emerald-400">Connected</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-xl font-bold text-white">
                  {data?.serverHealth.dbPool.totalCount || 0}
                </span>
                <span className="text-xs text-slate-500">
                  {data?.serverHealth.dbPool.idleCount || 0} Idle • {data?.serverHealth.dbPool.waitingCount || 0} Waiting
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Node.js Process Memory</span>
                <span className="text-xs font-semibold text-indigo-400">
                  {data?.serverHealth.memoryUsageMb || 0} MB
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-xl font-bold text-white">
                  {Math.floor((data?.serverHealth.uptimeSeconds || 0) / 3600)}h{' '}
                  {Math.floor(((data?.serverHealth.uptimeSeconds || 0) % 3600) / 60)}m
                </span>
                <span className="text-xs text-slate-500">Fastify Server Uptime</span>
              </div>
            </div>

            {/* Platform Table Row Counts */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Database Table Row Counts
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between border-b border-slate-800/80 pb-1">
                  <span className="text-slate-400">Agencies</span>
                  <span className="font-semibold text-white">{data?.serverHealth.tableCounts.organizations || 0}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/80 pb-1">
                  <span className="text-slate-400">Users</span>
                  <span className="font-semibold text-white">{data?.serverHealth.tableCounts.users || 0}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-400">Ledger Rows</span>
                  <span className="font-semibold text-white">{data?.serverHealth.tableCounts.ledgerEntries || 0}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-400">Matched JDs</span>
                  <span className="font-semibold text-white">{data?.serverHealth.tableCounts.matchedJds || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
