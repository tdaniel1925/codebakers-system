/**
 * Dashboard Layout Component
 * CodeBakers Agent System — Code Template
 *
 * Usage: Import as the wrapper for any analytics/admin dashboard page.
 * Requires: recharts, lucide-react, date-fns, Supabase client
 *
 * Features:
 * - KPI stat cards with trend indicators (up/down/neutral)
 * - Date range picker with presets (7d, 30d, 90d, YTD, custom)
 * - Responsive grid layout (auto-adjusts 1→2→3→4 columns)
 * - Chart wrappers: line, bar, area, pie (via Recharts)
 * - Real-time data refresh with configurable interval
 * - Drill-down support: click chart segments to filter
 * - Loading skeletons per card
 * - Empty states per widget
 * - Mobile: cards stack, charts scroll horizontally
 */

'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  RefreshCw,
  Loader2,
  ChevronDown,
  X,
} from 'lucide-react';
import {
  format,
  subDays,
  startOfYear,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
} from 'date-fns';

// ─── Types ────────────────────────────────────────────────

interface DateRange {
  from: Date;
  to: Date;
  label: string;
}

interface DashboardContextValue {
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  refreshKey: number;
  refresh: () => void;
  isRefreshing: boolean;
}

interface KPICardProps {
  title: string;
  value: string | number;
  previousValue?: number;
  format?: 'number' | 'currency' | 'percent';
  icon?: ReactNode;
  loading?: boolean;
  onClick?: () => void;
}

interface ChartCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  className?: string;
  actions?: ReactNode;
}

type ChartType = 'line' | 'bar' | 'area' | 'pie';

interface DashboardChartProps {
  type: ChartType;
  data: Record<string, unknown>[];
  xKey: string;
  yKeys: { key: string; label: string; color: string }[];
  height?: number;
  stacked?: boolean;
  onSegmentClick?: (data: Record<string, unknown>) => void;
}

// ─── Colors ───────────────────────────────────────────────

const CHART_COLORS = [
  'hsl(221, 83%, 53%)', // blue
  'hsl(142, 71%, 45%)', // green
  'hsl(38, 92%, 50%)',  // amber
  'hsl(0, 84%, 60%)',   // red
  'hsl(262, 83%, 58%)', // purple
  'hsl(187, 85%, 43%)', // cyan
  'hsl(25, 95%, 53%)',  // orange
  'hsl(330, 81%, 60%)', // pink
];

// ─── Date Presets ─────────────────────────────────────────

function getDatePresets(): DateRange[] {
  const now = new Date();
  return [
    { from: subDays(now, 7), to: now, label: 'Last 7 days' },
    { from: subDays(now, 30), to: now, label: 'Last 30 days' },
    { from: subDays(now, 90), to: now, label: 'Last 90 days' },
    { from: startOfYear(now), to: now, label: 'Year to date' },
    { from: startOfMonth(now), to: endOfMonth(now), label: 'This month' },
  ];
}

// ─── Context ──────────────────────────────────────────────

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used inside DashboardProvider');
  return ctx;
}

// ─── Format Helpers ───────────────────────────────────────

function formatValue(value: number, fmt: 'number' | 'currency' | 'percent' = 'number'): string {
  switch (fmt) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    case 'percent':
      return `${value.toFixed(1)}%`;
    default:
      return new Intl.NumberFormat('en-US', {
        notation: value >= 10000 ? 'compact' : 'standard',
        maximumFractionDigits: 1,
      }).format(value);
  }
}

function calculateTrend(current: number, previous: number): { value: number; direction: 'up' | 'down' | 'neutral' } {
  if (previous === 0) return { value: 0, direction: 'neutral' };
  const change = ((current - previous) / previous) * 100;
  return {
    value: Math.abs(change),
    direction: change > 0.5 ? 'up' : change < -0.5 ? 'down' : 'neutral',
  };
}

// ─── Skeleton Loader ──────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

// ─── Date Range Picker ────────────────────────────────────

function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const presets = useMemo(() => getDatePresets(), []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
      >
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span>{value.label}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border bg-background shadow-lg">
          <div className="p-1">
            {presets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  onChange(preset);
                  setOpen(false);
                }}
                className={`w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-muted ${
                  value.label === preset.label ? 'bg-primary/10 font-medium text-primary' : ''
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom range inputs */}
          <div className="border-t p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Custom range</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={format(value.from, 'yyyy-MM-dd')}
                onChange={(e) => {
                  const from = new Date(e.target.value);
                  onChange({ from, to: value.to, label: `${format(from, 'MMM d')} – ${format(value.to, 'MMM d')}` });
                }}
                className="h-8 w-full rounded border px-2 text-xs"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                value={format(value.to, 'yyyy-MM-dd')}
                onChange={(e) => {
                  const to = new Date(e.target.value);
                  onChange({ from: value.from, to, label: `${format(value.from, 'MMM d')} – ${format(to, 'MMM d')}` });
                  setOpen(false);
                }}
                className="h-8 w-full rounded border px-2 text-xs"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────

export function KPICard({
  title,
  value,
  previousValue,
  format: fmt = 'number',
  icon,
  loading = false,
  onClick,
}: KPICardProps) {
  const numericValue = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
  const trend = previousValue !== undefined ? calculateTrend(numericValue, previousValue) : null;

  if (loading) {
    return (
      <div className="rounded-lg border bg-background p-5">
        <Skeleton className="mb-3 h-4 w-24" />
        <Skeleton className="mb-2 h-8 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border bg-background p-5 transition-shadow ${
        onClick ? 'cursor-pointer hover:shadow-md' : ''
      }`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </div>

      <p className="mt-1 text-2xl font-bold tracking-tight">
        {typeof value === 'number' ? formatValue(value, fmt) : value}
      </p>

      {trend && (
        <div className="mt-1 flex items-center gap-1">
          {trend.direction === 'up' ? (
            <TrendingUp className="h-3.5 w-3.5 text-green-600" />
          ) : trend.direction === 'down' ? (
            <TrendingDown className="h-3.5 w-3.5 text-red-600" />
          ) : (
            <Minus className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span
            className={`text-xs font-medium ${
              trend.direction === 'up'
                ? 'text-green-600'
                : trend.direction === 'down'
                ? 'text-red-600'
                : 'text-muted-foreground'
            }`}
          >
            {trend.value.toFixed(1)}% from previous period
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Chart Card Wrapper ───────────────────────────────────

export function ChartCard({
  title,
  description,
  children,
  loading = false,
  empty = false,
  emptyMessage = 'No data for this period',
  className = '',
  actions,
}: ChartCardProps) {
  if (loading) {
    return (
      <div className={`rounded-lg border bg-background p-5 ${className}`}>
        <Skeleton className="mb-1 h-5 w-40" />
        <Skeleton className="mb-4 h-4 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className={`rounded-lg border bg-background p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>

      {empty ? (
        <div className="flex h-64 items-center justify-center">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

// ─── Dashboard Chart ──────────────────────────────────────

export function DashboardChart({
  type,
  data,
  xKey,
  yKeys,
  height = 280,
  stacked = false,
  onSegmentClick,
}: DashboardChartProps) {
  const colors = yKeys.map((y, i) => y.color || CHART_COLORS[i % CHART_COLORS.length]);

  const commonProps = {
    data,
    margin: { top: 5, right: 5, left: -10, bottom: 0 },
  };

  const handleClick = onSegmentClick
    ? (entry: Record<string, unknown>) => onSegmentClick(entry)
    : undefined;

  if (type === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey={yKeys[0].key}
            nameKey={xKey}
            cx="50%"
            cy="50%"
            outerRadius={100}
            innerRadius={55}
            paddingAngle={2}
            onClick={handleClick}
            className={onSegmentClick ? 'cursor-pointer' : ''}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: '8px',
              border: '1px solid hsl(var(--border))',
              fontSize: '12px',
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value) => <span className="text-xs">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  const ChartComponent = type === 'bar' ? BarChart : type === 'area' ? AreaChart : LineChart;
  const DataComponent = type === 'bar' ? Bar : type === 'area' ? Area : Line;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ChartComponent {...commonProps}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          className="text-muted-foreground"
        />
        <YAxis
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          className="text-muted-foreground"
        />
        <Tooltip
          contentStyle={{
            borderRadius: '8px',
            border: '1px solid hsl(var(--border))',
            fontSize: '12px',
          }}
        />
        {yKeys.length > 1 && (
          <Legend
            verticalAlign="top"
            height={36}
            formatter={(value) => <span className="text-xs">{value}</span>}
          />
        )}
        {yKeys.map((y, i) => {
          const sharedProps = {
            key: y.key,
            dataKey: y.key,
            name: y.label,
            stroke: colors[i],
            fill: colors[i],
            onClick: handleClick,
            className: onSegmentClick ? 'cursor-pointer' : '',
          };

          if (type === 'bar') {
            return (
              <Bar
                {...sharedProps}
                radius={[4, 4, 0, 0]}
                stackId={stacked ? 'stack' : undefined}
                fillOpacity={0.9}
              />
            );
          }
          if (type === 'area') {
            return (
              <Area
                {...sharedProps}
                type="monotone"
                strokeWidth={2}
                fillOpacity={0.15}
                stackId={stacked ? 'stack' : undefined}
              />
            );
          }
          return (
            <Line
              {...sharedProps}
              type="monotone"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          );
        })}
      </ChartComponent>
    </ResponsiveContainer>
  );
}

// ─── KPI Grid ─────────────────────────────────────────────

export function KPIGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}

// ─── Chart Grid ───────────────────────────────────────────

export function ChartGrid({ children, columns = 2 }: { children: ReactNode; columns?: 1 | 2 | 3 }) {
  const colClass =
    columns === 1
      ? 'grid-cols-1'
      : columns === 3
      ? 'grid-cols-1 lg:grid-cols-3'
      : 'grid-cols-1 lg:grid-cols-2';

  return <div className={`grid gap-4 ${colClass}`}>{children}</div>;
}

// ─── Dashboard Provider ───────────────────────────────────

export function DashboardProvider({
  children,
  title,
  description,
  refreshInterval,
  actions,
}: {
  children: ReactNode;
  title: string;
  description?: string;
  /** Auto-refresh interval in milliseconds (0 = disabled) */
  refreshInterval?: number;
  /** Extra action buttons in the header */
  actions?: ReactNode;
}) {
  const presets = getDatePresets();
  const [dateRange, setDateRange] = useState<DateRange>(presets[1]); // Default: 30 days
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshKey((k) => k + 1);
    setTimeout(() => setIsRefreshing(false), 500);
  }, []);

  // Auto-refresh
  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0) return;
    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [refresh, refreshInterval]);

  const contextValue = useMemo(
    () => ({ dateRange, setDateRange, refreshKey, refresh, isRefreshing }),
    [dateRange, refreshKey, refresh, isRefreshing]
  );

  return (
    <DashboardContext.Provider value={contextValue}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {actions}

            <button
              onClick={refresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              aria-label="Refresh data"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
        </div>

        {children}
      </div>
    </DashboardContext.Provider>
  );
}

// ─── Usage Example ────────────────────────────────────────
//
// import {
//   DashboardProvider,
//   KPIGrid,
//   KPICard,
//   ChartGrid,
//   ChartCard,
//   DashboardChart,
//   useDashboard,
// } from '@/components/dashboard-layout';
// import { Users, DollarSign, ShoppingCart, Activity } from 'lucide-react';
//
// function DashboardContent() {
//   const { dateRange, refreshKey } = useDashboard();
//   // Fetch data using dateRange.from / dateRange.to + refreshKey as dependency
//
//   return (
//     <>
//       <KPIGrid>
//         <KPICard title="Revenue" value={45231} previousValue={38400} format="currency" icon={<DollarSign className="h-4 w-4" />} />
//         <KPICard title="Users" value={2350} previousValue={2100} icon={<Users className="h-4 w-4" />} />
//         <KPICard title="Orders" value={1283} previousValue={1150} icon={<ShoppingCart className="h-4 w-4" />} />
//         <KPICard title="Conversion" value={3.2} previousValue={2.8} format="percent" icon={<Activity className="h-4 w-4" />} />
//       </KPIGrid>
//
//       <ChartGrid>
//         <ChartCard title="Revenue Over Time" description="Daily revenue trends">
//           <DashboardChart
//             type="area"
//             data={revenueData}
//             xKey="date"
//             yKeys={[{ key: 'revenue', label: 'Revenue', color: 'hsl(221, 83%, 53%)' }]}
//           />
//         </ChartCard>
//
//         <ChartCard title="Users by Plan">
//           <DashboardChart
//             type="pie"
//             data={planData}
//             xKey="plan"
//             yKeys={[{ key: 'count', label: 'Users', color: '' }]}
//             onSegmentClick={(d) => console.log('Clicked:', d)}
//           />
//         </ChartCard>
//       </ChartGrid>
//     </>
//   );
// }
//
// export default function AnalyticsPage() {
//   return (
//     <DashboardProvider
//       title="Analytics Dashboard"
//       description="Overview of key business metrics"
//       refreshInterval={60000}
//     >
//       <DashboardContent />
//     </DashboardProvider>
//   );
// }
