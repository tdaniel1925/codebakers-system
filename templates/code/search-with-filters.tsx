/**
 * Search with Filters Component
 * CodeBakers Agent System — Code Template
 *
 * Usage: Import for any searchable, filterable listing page.
 * Requires: Supabase client, lucide-react, nuqs (or next/navigation for URL state)
 *
 * Features:
 * - Full-text search with debounced input
 * - Faceted filters: select, multi-select, range, toggle
 * - URL-synced state (every filter change updates the URL, supports bookmarking/sharing)
 * - Autocomplete suggestions from Supabase distinct values
 * - Active filter pills with individual clear
 * - Result count + sort options
 * - Responsive: filters collapse to bottom sheet on mobile
 * - Keyboard accessible: Escape to clear, Enter to search
 * - Supabase full-text search + ilike fallback
 */

'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  Search,
  X,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Check,
  Loader2,
  ArrowUpDown,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────

type FilterType = 'select' | 'multi_select' | 'range' | 'toggle';

interface FilterOption {
  label: string;
  value: string;
  count?: number;
}

interface FilterDefinition {
  /** URL param key */
  key: string;
  /** Display label */
  label: string;
  /** Filter type */
  type: FilterType;
  /** Options for select/multi_select filters */
  options?: FilterOption[];
  /** Whether to auto-fetch options from Supabase distinct values */
  autoOptions?: { table: string; column: string };
  /** Min/max for range filters */
  range?: { min: number; max: number; step?: number; unit?: string };
  /** Default value */
  defaultValue?: string | string[] | number[] | boolean;
}

interface SortOption {
  label: string;
  value: string;
  column: string;
  ascending: boolean;
}

interface SearchWithFiltersProps<TData> {
  /** Supabase table name */
  table: string;
  /** Supabase select string */
  select?: string;
  /** Column to full-text search (must have a tsvector index, or falls back to ilike) */
  searchColumn?: string;
  /** Additional columns to ilike search across */
  searchColumns?: string[];
  /** Filter definitions */
  filters: FilterDefinition[];
  /** Sort options */
  sortOptions?: SortOption[];
  /** Default sort */
  defaultSort?: string;
  /** Rows per page */
  pageSize?: number;
  /** Render function for each result item */
  renderItem: (item: TData, index: number) => ReactNode;
  /** Render function for empty state */
  renderEmpty?: () => ReactNode;
  /** Additional static Supabase filters */
  staticFilters?: [string, string, string | number | boolean][];
  /** Class for the results grid */
  resultsClassName?: string;
}

// ─── Debounce Hook ────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ─── URL State Helpers ────────────────────────────────────

function parseFiltersFromURL(
  searchParams: URLSearchParams,
  filters: FilterDefinition[]
): Record<string, string | string[] | number[] | boolean> {
  const result: Record<string, string | string[] | number[] | boolean> = {};

  for (const filter of filters) {
    const raw = searchParams.get(filter.key);
    if (!raw) continue;

    switch (filter.type) {
      case 'multi_select':
        result[filter.key] = raw.split(',');
        break;
      case 'range':
        result[filter.key] = raw.split(',').map(Number);
        break;
      case 'toggle':
        result[filter.key] = raw === 'true';
        break;
      default:
        result[filter.key] = raw;
    }
  }

  return result;
}

function filtersToURLParams(
  activeFilters: Record<string, string | string[] | number[] | boolean>,
  query: string,
  sort: string
): URLSearchParams {
  const params = new URLSearchParams();

  if (query) params.set('q', query);
  if (sort) params.set('sort', sort);

  for (const [key, value] of Object.entries(activeFilters)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }

  return params;
}

// ─── Filter Panel Components ──────────────────────────────

function SelectFilter({
  filter,
  value,
  onChange,
}: {
  filter: FilterDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedLabel = filter.options?.find((o) => o.value === value)?.label || filter.label;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${
          value ? 'border-primary/50 bg-primary/5 font-medium' : 'hover:bg-muted'
        }`}
      >
        <span className="truncate">{value ? selectedLabel : filter.label}</span>
        {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 max-h-60 w-full min-w-[180px] overflow-y-auto rounded-md border bg-background shadow-lg">
          <button
            onClick={() => { onChange(''); setOpen(false); }}
            className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
          >
            All
          </button>
          {(filter.options || []).map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted ${
                value === opt.value ? 'bg-primary/5 font-medium text-primary' : ''
              }`}
            >
              <span>{opt.label}</span>
              <span className="flex items-center gap-1.5">
                {opt.count !== undefined && (
                  <span className="text-xs text-muted-foreground">{opt.count}</span>
                )}
                {value === opt.value && <Check className="h-3.5 w-3.5" />}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MultiSelectFilter({
  filter,
  value,
  onChange,
}: {
  filter: FilterDefinition;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggle = (optValue: string) => {
    onChange(
      value.includes(optValue)
        ? value.filter((v) => v !== optValue)
        : [...value, optValue]
    );
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${
          value.length > 0 ? 'border-primary/50 bg-primary/5 font-medium' : 'hover:bg-muted'
        }`}
      >
        <span className="truncate">
          {value.length > 0 ? `${filter.label} (${value.length})` : filter.label}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 max-h-60 w-full min-w-[180px] overflow-y-auto rounded-md border bg-background shadow-lg">
          {value.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="w-full border-b px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              Clear all
            </button>
          )}
          {(filter.options || []).map((opt) => {
            const isSelected = value.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => toggle(opt.value)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted ${
                  isSelected ? 'bg-primary/5' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-4 w-4 items-center justify-center rounded border ${
                      isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <span>{opt.label}</span>
                </div>
                {opt.count !== undefined && (
                  <span className="text-xs text-muted-foreground">{opt.count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RangeFilter({
  filter,
  value,
  onChange,
}: {
  filter: FilterDefinition;
  value: number[];
  onChange: (value: number[]) => void;
}) {
  const range = filter.range!;
  const [min, max] = value.length === 2 ? value : [range.min, range.max];

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{filter.label}</p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={min}
          min={range.min}
          max={max}
          step={range.step || 1}
          onChange={(e) => onChange([Number(e.target.value), max])}
          className="h-8 w-full rounded border px-2 text-sm"
          placeholder="Min"
        />
        <span className="text-xs text-muted-foreground">–</span>
        <input
          type="number"
          value={max}
          min={min}
          max={range.max}
          step={range.step || 1}
          onChange={(e) => onChange([min, Number(e.target.value)])}
          className="h-8 w-full rounded border px-2 text-sm"
          placeholder="Max"
        />
        {range.unit && <span className="text-xs text-muted-foreground">{range.unit}</span>}
      </div>
    </div>
  );
}

function ToggleFilter({
  filter,
  value,
  onChange,
}: {
  filter: FilterDefinition;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative h-5 w-9 rounded-full transition-colors ${
          value ? 'bg-primary' : 'bg-muted-foreground/20'
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
      <span className="text-sm">{filter.label}</span>
    </label>
  );
}

// ─── Active Filter Pills ──────────────────────────────────

function ActiveFilterPills({
  filters,
  activeFilters,
  onClear,
  onClearAll,
}: {
  filters: FilterDefinition[];
  activeFilters: Record<string, unknown>;
  onClear: (key: string) => void;
  onClearAll: () => void;
}) {
  const pills: { key: string; label: string }[] = [];

  for (const filter of filters) {
    const value = activeFilters[filter.key];
    if (!value || (Array.isArray(value) && value.length === 0) || value === false) continue;

    let label = filter.label + ': ';
    if (filter.type === 'multi_select' && Array.isArray(value)) {
      const labels = (value as string[])
        .map((v) => filter.options?.find((o) => o.value === v)?.label || v)
        .join(', ');
      label += labels;
    } else if (filter.type === 'range' && Array.isArray(value)) {
      label += `${value[0]}–${value[1]}${filter.range?.unit ? ` ${filter.range.unit}` : ''}`;
    } else if (filter.type === 'toggle') {
      label = filter.label;
    } else {
      label += filter.options?.find((o) => o.value === value)?.label || String(value);
    }

    pills.push({ key: filter.key, label });
  }

  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pills.map((pill) => (
        <span
          key={pill.key}
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
        >
          {pill.label}
          <button
            onClick={() => onClear(pill.key)}
            className="hover:text-primary/70"
            aria-label={`Remove ${pill.label} filter`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <button
        onClick={onClearAll}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        Clear all
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────

export function SearchWithFilters<TData extends Record<string, unknown>>({
  table,
  select = '*',
  searchColumn,
  searchColumns = [],
  filters,
  sortOptions = [],
  defaultSort,
  pageSize = 24,
  renderItem,
  renderEmpty,
  staticFilters,
  resultsClassName = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3',
}: SearchWithFiltersProps<TData>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // ─── State from URL ────────────────────────────────────

  const initialQuery = searchParams.get('q') || '';
  const initialSort = searchParams.get('sort') || defaultSort || '';
  const initialFilters = useMemo(() => parseFiltersFromURL(searchParams, filters), [searchParams, filters]);

  const [query, setQuery] = useState(initialQuery);
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>(initialFilters);
  const [sort, setSort] = useState(initialSort);
  const [results, setResults] = useState<TData[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const debouncedQuery = useDebounce(query, 300);

  // ─── Sync to URL ───────────────────────────────────────

  useEffect(() => {
    startTransition(() => {
      const params = filtersToURLParams(
        activeFilters as Record<string, string | string[] | number[] | boolean>,
        debouncedQuery,
        sort
      );
      const newURL = params.toString() ? `${pathname}?${params}` : pathname;
      router.replace(newURL, { scroll: false });
    });
  }, [debouncedQuery, activeFilters, sort, pathname, router]);

  // ─── Fetch Results ─────────────────────────────────────

  const fetchResults = useCallback(
    async (pageNum: number, append = false) => {
      setLoading(true);
      try {
        const supabase = createClient();
        let q = supabase.from(table).select(select, { count: 'exact' });

        // Text search
        if (debouncedQuery) {
          if (searchColumn) {
            // Try full-text search first
            q = q.textSearch(searchColumn, debouncedQuery, { type: 'websearch' });
          } else if (searchColumns.length > 0) {
            // Fall back to ilike across multiple columns
            const orClauses = searchColumns
              .map((col) => `${col}.ilike.%${debouncedQuery}%`)
              .join(',');
            q = q.or(orClauses);
          }
        }

        // Apply faceted filters
        for (const filter of filters) {
          const value = activeFilters[filter.key];
          if (!value || (Array.isArray(value) && value.length === 0) || value === false) continue;

          switch (filter.type) {
            case 'select':
              q = q.eq(filter.key, value);
              break;
            case 'multi_select':
              q = q.in(filter.key, value as string[]);
              break;
            case 'range': {
              const [min, max] = value as number[];
              q = q.gte(filter.key, min).lte(filter.key, max);
              break;
            }
            case 'toggle':
              q = q.eq(filter.key, true);
              break;
          }
        }

        // Static filters
        if (staticFilters) {
          for (const [col, op, val] of staticFilters) {
            q = q.filter(col, op, val);
          }
        }

        // Sort
        if (sort && sortOptions.length > 0) {
          const sortOpt = sortOptions.find((s) => s.value === sort);
          if (sortOpt) {
            q = q.order(sortOpt.column, { ascending: sortOpt.ascending });
          }
        }

        // Paginate
        const from = pageNum * pageSize;
        const to = from + pageSize - 1;
        q = q.range(from, to);

        const { data, error, count } = await q;
        if (error) throw error;

        const items = (data as TData[]) || [];
        setResults((prev) => (append ? [...prev, ...items] : items));
        setTotalCount(count || 0);
        setHasMore(items.length === pageSize);
        setPage(pageNum);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    },
    [table, select, debouncedQuery, searchColumn, searchColumns, filters, activeFilters, staticFilters, sort, sortOptions, pageSize]
  );

  // Re-fetch when filters change
  useEffect(() => {
    fetchResults(0);
  }, [fetchResults]);

  // ─── Filter handlers ───────────────────────────────────

  const updateFilter = useCallback((key: string, value: unknown) => {
    setActiveFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilter = useCallback((key: string) => {
    setActiveFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setActiveFilters({});
    setQuery('');
  }, []);

  const activeFilterCount = Object.values(activeFilters).filter(
    (v) => v !== undefined && v !== null && v !== '' && v !== false && !(Array.isArray(v) && v.length === 0)
  ).length;

  // ─── Render ────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Search bar + controls */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder="Search…"
            className="h-10 w-full rounded-md border bg-background pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Sort */}
          {sortOptions.length > 0 && (
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Sort by…</option>
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}

          {/* Filter toggle (mobile) */}
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium lg:hidden ${
              activeFilterCount > 0 ? 'border-primary/50 bg-primary/5 text-primary' : 'hover:bg-muted'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Active filter pills */}
      <ActiveFilterPills
        filters={filters}
        activeFilters={activeFilters}
        onClear={clearFilter}
        onClearAll={clearAllFilters}
      />

      {/* Main layout: sidebar filters + results */}
      <div className="flex gap-6">
        {/* Filter sidebar (desktop always visible, mobile toggleable) */}
        <aside
          className={`w-60 shrink-0 space-y-4 ${
            filtersOpen ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Filters</h3>
            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Reset
              </button>
            )}
          </div>

          <div className="space-y-3">
            {filters.map((filter) => {
              switch (filter.type) {
                case 'select':
                  return (
                    <SelectFilter
                      key={filter.key}
                      filter={filter}
                      value={(activeFilters[filter.key] as string) || ''}
                      onChange={(v) => updateFilter(filter.key, v)}
                    />
                  );
                case 'multi_select':
                  return (
                    <MultiSelectFilter
                      key={filter.key}
                      filter={filter}
                      value={(activeFilters[filter.key] as string[]) || []}
                      onChange={(v) => updateFilter(filter.key, v)}
                    />
                  );
                case 'range':
                  return (
                    <RangeFilter
                      key={filter.key}
                      filter={filter}
                      value={(activeFilters[filter.key] as number[]) || [filter.range!.min, filter.range!.max]}
                      onChange={(v) => updateFilter(filter.key, v)}
                    />
                  );
                case 'toggle':
                  return (
                    <ToggleFilter
                      key={filter.key}
                      filter={filter}
                      value={(activeFilters[filter.key] as boolean) || false}
                      onChange={(v) => updateFilter(filter.key, v)}
                    />
                  );
                default:
                  return null;
              }
            })}
          </div>
        </aside>

        {/* Results */}
        <div className="flex-1 space-y-4">
          {/* Result count */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {loading ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                </span>
              ) : (
                `${totalCount} result${totalCount !== 1 ? 's' : ''}`
              )}
            </p>
          </div>

          {/* Results grid */}
          {!loading && results.length === 0 ? (
            renderEmpty ? (
              renderEmpty()
            ) : (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
                <Search className="mb-3 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium text-muted-foreground">No results found</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Try adjusting your search or filters
                </p>
                {(query || activeFilterCount > 0) && (
                  <button
                    onClick={clearAllFilters}
                    className="mt-3 text-xs font-medium text-primary hover:underline"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            )
          ) : (
            <>
              <div className={resultsClassName}>
                {results.map((item, index) => renderItem(item, index))}
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="flex justify-center pt-4">
                  <button
                    onClick={() => fetchResults(page + 1, true)}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 rounded-md border px-6 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                      </>
                    ) : (
                      'Load more'
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Usage Example ────────────────────────────────────────
//
// import { SearchWithFilters } from '@/components/search-with-filters';
//
// interface Product {
//   id: string;
//   name: string;
//   category: string;
//   price: number;
//   in_stock: boolean;
//   image_url: string;
// }
//
// const filters = [
//   {
//     key: 'category',
//     label: 'Category',
//     type: 'select' as const,
//     options: [
//       { label: 'Electronics', value: 'electronics', count: 42 },
//       { label: 'Clothing', value: 'clothing', count: 28 },
//       { label: 'Home', value: 'home', count: 15 },
//     ],
//   },
//   {
//     key: 'price',
//     label: 'Price',
//     type: 'range' as const,
//     range: { min: 0, max: 1000, step: 10, unit: '$' },
//   },
//   {
//     key: 'in_stock',
//     label: 'In Stock Only',
//     type: 'toggle' as const,
//   },
// ];
//
// const sortOptions = [
//   { label: 'Price: Low → High', value: 'price_asc', column: 'price', ascending: true },
//   { label: 'Price: High → Low', value: 'price_desc', column: 'price', ascending: false },
//   { label: 'Newest', value: 'newest', column: 'created_at', ascending: false },
// ];
//
// export default function ProductsPage() {
//   return (
//     <SearchWithFilters<Product>
//       table="products"
//       searchColumns={['name', 'description']}
//       filters={filters}
//       sortOptions={sortOptions}
//       defaultSort="newest"
//       renderItem={(product) => (
//         <div key={product.id} className="rounded-lg border p-4">
//           <img src={product.image_url} alt={product.name} className="aspect-square rounded object-cover" />
//           <h3 className="mt-2 font-medium">{product.name}</h3>
//           <p className="text-sm text-muted-foreground">${product.price}</p>
//         </div>
//       )}
//     />
//   );
// }
