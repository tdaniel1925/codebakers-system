---
name: Dashboard Specialist
tier: features
triggers: dashboard, charts, KPI, metrics, analytics, graph, bar chart, line chart, pie chart, date range, drill-down, reporting, visualization, widget, real-time dashboard
depends_on: database.md, frontend.md
conflicts_with: null
prerequisites: null
description: Dashboard layouts, charts, KPI cards, date range pickers, drill-down, real-time metrics, data visualization
code_templates: dashboard-layout.tsx
design_tokens: null
---

# Dashboard Specialist

## Role

Owns all dashboard and data visualization implementations. Builds KPI cards, chart components (line, bar, pie, area), date range selectors, drill-down navigation, and real-time metric displays. Ensures dashboards load fast (skeleton loading, data streaming), look professional (design token compliant), and provide genuine insight rather than vanity metrics. Uses Recharts as the primary charting library.

## When to Use

- Building admin or analytics dashboards
- Creating KPI cards with trend indicators
- Implementing charts and data visualizations
- Adding date range pickers for data filtering
- Building drill-down views (summary → detail)
- Creating real-time metrics displays
- Designing dashboard layouts with responsive grid
- Building client-facing reporting views

## Also Consider

- **Data Tables Specialist** — for tabular data within dashboards
- **Realtime Specialist** — for live-updating metrics via WebSocket
- **Performance Engineer** — for dashboard loading speed optimization
- **Database Specialist** — for aggregation queries and materialized views
- **Search Specialist** — for filtering dashboard data

## Anti-Patterns (NEVER Do)

1. ❌ Load all chart data on initial page load — lazy load charts in viewport
2. ❌ Use 3D charts, dual axes, or pie charts with >5 slices — they mislead
3. ❌ Show raw numbers without context — always include comparison (vs. last period, target)
4. ❌ Hardcode date ranges — always let users pick custom ranges
5. ❌ Fetch dashboard data in one giant query — parallel smaller queries with skeleton loading
6. ❌ Use rainbow colors in charts — use a sequential or diverging palette from design tokens
7. ❌ Forget empty states for charts — "No data for this period" with helpful context
8. ❌ Skip loading states — skeleton cards while data loads, never blank space
9. ❌ Ignore mobile — dashboards must reflow to single column on mobile
10. ❌ Show meaningless metrics — every number needs context (trend, comparison, benchmark)

## Standards & Patterns

### Dashboard Layout
```tsx
function DashboardPage() {
  const [dateRange, setDateRange] = useState(defaultRange);

  return (
    <div className="space-y-6">
      {/* Header with date range */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Revenue" query={revenueQuery} dateRange={dateRange} format="currency" />
        <KPICard title="Users" query={usersQuery} dateRange={dateRange} format="number" />
        <KPICard title="Conversion" query={conversionQuery} dateRange={dateRange} format="percent" />
        <KPICard title="Churn Rate" query={churnQuery} dateRange={dateRange} format="percent" invertTrend />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Revenue Over Time">
          <RevenueChart dateRange={dateRange} />
        </ChartCard>
        <ChartCard title="Users by Source">
          <SourceBreakdownChart dateRange={dateRange} />
        </ChartCard>
      </div>

      {/* Detail Table */}
      <ChartCard title="Recent Transactions">
        <TransactionsTable dateRange={dateRange} />
      </ChartCard>
    </div>
  );
}
```

### KPI Card Component
```tsx
interface KPICardProps {
  title: string;
  value: number;
  previousValue: number;
  format: 'currency' | 'number' | 'percent';
  invertTrend?: boolean; // true for metrics where down is good (churn)
  isLoading?: boolean;
}

function KPICard({ title, value, previousValue, format, invertTrend, isLoading }: KPICardProps) {
  if (isLoading) return <KPICardSkeleton />;

  const formatted = formatValue(value, format);
  const change = previousValue ? ((value - previousValue) / previousValue) * 100 : 0;
  const isPositive = invertTrend ? change < 0 : change > 0;

  return (
    <div className="rounded-xl border bg-card p-6">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-3xl font-semibold mt-1">{formatted}</p>
      <div className={`flex items-center gap-1 mt-2 text-sm
        ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
        <span>{Math.abs(change).toFixed(1)}%</span>
        <span className="text-muted-foreground">vs last period</span>
      </div>
    </div>
  );
}

function formatValue(value: number, format: string) {
  switch (format) {
    case 'currency': return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
    case 'percent': return `${value.toFixed(1)}%`;
    case 'number': return new Intl.NumberFormat('en-US').format(value);
  }
}
```

### Recharts Pattern
```tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

function RevenueChart({ data }: { data: ChartDataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }}
          tickFormatter={(d) => formatShortDate(d)}
        />
        <YAxis
          tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }}
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
          }}
          formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
        />
        <Line
          type="monotone"
          dataKey="revenue"
          stroke="var(--color-accent)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### Date Range Presets
```typescript
const DATE_PRESETS = [
  { label: 'Last 7 days', getValue: () => ({ start: subDays(new Date(), 7), end: new Date() }) },
  { label: 'Last 30 days', getValue: () => ({ start: subDays(new Date(), 30), end: new Date() }) },
  { label: 'Last 90 days', getValue: () => ({ start: subDays(new Date(), 90), end: new Date() }) },
  { label: 'This month', getValue: () => ({ start: startOfMonth(new Date()), end: new Date() }) },
  { label: 'Last month', getValue: () => ({
    start: startOfMonth(subMonths(new Date(), 1)),
    end: endOfMonth(subMonths(new Date(), 1)),
  })},
  { label: 'This year', getValue: () => ({ start: startOfYear(new Date()), end: new Date() }) },
];
```

### Dashboard Data Aggregation
```sql
-- Materialized view for fast dashboard queries
CREATE MATERIALIZED VIEW daily_metrics AS
SELECT
  date_trunc('day', created_at)::date AS date,
  COUNT(*) AS total_orders,
  SUM(amount) AS total_revenue,
  COUNT(DISTINCT user_id) AS unique_customers,
  AVG(amount) AS avg_order_value
FROM orders
WHERE status = 'completed'
GROUP BY date_trunc('day', created_at)::date;

CREATE UNIQUE INDEX idx_daily_metrics_date ON daily_metrics(date);

-- Refresh on schedule (cron)
REFRESH MATERIALIZED VIEW CONCURRENTLY daily_metrics;
```

### Parallel Data Loading
```typescript
// Load dashboard data in parallel, not sequentially
async function loadDashboardData(dateRange: DateRange) {
  const [revenue, users, conversions, recentOrders] = await Promise.all([
    fetchRevenueMetrics(dateRange),
    fetchUserMetrics(dateRange),
    fetchConversionMetrics(dateRange),
    fetchRecentOrders(dateRange),
  ]);

  return { revenue, users, conversions, recentOrders };
}

// Or use React Suspense with individual data boundaries
function DashboardWithSuspense() {
  return (
    <>
      <Suspense fallback={<KPICardSkeleton count={4} />}>
        <KPICards />
      </Suspense>
      <Suspense fallback={<ChartSkeleton />}>
        <RevenueChart />
      </Suspense>
    </>
  );
}
```

## Code Templates

- **`dashboard-layout.tsx`** — Responsive dashboard with KPI cards, chart cards, date range picker, and skeleton loading states

## Checklist

- [ ] Date range picker with presets and custom range
- [ ] KPI cards show value, trend, and comparison to previous period
- [ ] Charts use design token colors (not random colors)
- [ ] All data loading is parallel (not waterfall)
- [ ] Skeleton loading states for every card and chart
- [ ] Empty states for charts with no data in selected range
- [ ] Responsive grid: 4-col → 2-col → 1-col on mobile
- [ ] Charts are accessible (tooltips, screen reader labels)
- [ ] Materialized views or caching for expensive aggregate queries
- [ ] Date range persisted in URL query params
- [ ] Drill-down navigation (click chart → detail view)
- [ ] Numbers formatted with locale (commas, currency symbols)

## Common Pitfalls

1. **Vanity metrics** — Showing "total users" (always goes up) instead of "active users this week" (actionable). Every metric should answer "so what?"
2. **Slow aggregate queries** — Running `SUM()` over millions of rows on every dashboard load. Use materialized views refreshed on a schedule.
3. **Chart overload** — 8+ charts on one page overwhelms users. Start with 3-4 key metrics, let users drill down for more.
4. **Color blindness** — Red/green for up/down trends is inaccessible. Always pair color with an icon (↑/↓) or text label.
5. **Timezone in aggregations** — `date_trunc('day', created_at)` uses UTC. If users are in CST, their "today" doesn't match UTC's "today". Truncate in the user's timezone.
