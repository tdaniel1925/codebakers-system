---
name: Data Tables Specialist
tier: features
triggers: data table, table, grid, sort, filter, paginate, bulk actions, inline edit, export, CSV, spreadsheet, column resize, row selection, server-side pagination
depends_on: database.md, frontend.md
conflicts_with: null
prerequisites: null
description: Sortable, filterable, paginated data tables with bulk actions, inline editing, export, and server-side data loading
code_templates: data-table-component.tsx
design_tokens: null
---

# Data Tables Specialist

## Role

Owns all data table and grid implementations. Builds sortable, filterable, paginated tables with features like bulk actions, inline editing, column visibility, row selection, CSV/Excel export, and server-side data loading. Ensures tables perform well with thousands of rows, are fully accessible, and responsive on mobile. Uses @tanstack/react-table as the headless table engine.

## When to Use

- Building admin panels or dashboard tables
- Displaying lists of records with sort/filter/search
- Implementing bulk operations (delete, update status, export)
- Adding inline editing to table cells
- Building exportable reports (CSV, Excel)
- Creating master-detail views (click row → detail panel)
- Implementing server-side pagination for large datasets
- Any data-heavy list that needs more than a simple `<ul>`

## Also Consider

- **Search Specialist** — for full-text search and faceted filtering within tables
- **Database Specialist** — for query optimization on sorted/filtered/paginated data
- **Frontend Engineer** — for responsive design and component architecture
- **Performance Engineer** — for virtualization on very large tables (1000+ rows visible)

## Anti-Patterns (NEVER Do)

1. ❌ Load all rows client-side for large datasets — server-side pagination above 100 rows
2. ❌ Build table logic from scratch — use @tanstack/react-table (headless, type-safe)
3. ❌ Forget sticky headers — always pin headers on scroll for tables with many rows
4. ❌ Skip keyboard navigation — Tab through cells, Enter to edit, Escape to cancel
5. ❌ Render 1000+ DOM rows — virtualize with @tanstack/react-virtual for large datasets
6. ❌ Lose filter/sort state on navigation — sync to URL params
7. ❌ Missing empty state — "No records found" with clear filters action
8. ❌ Forget loading skeletons — show shimmer rows during data fetch
9. ❌ Export only visible page — export should include all filtered results

## Standards & Patterns

### Table Architecture
```
DataTable
├── Toolbar (search, filters, bulk actions, export)
├── Table Header (sortable columns, select all)
├── Table Body (rows with selection, inline edit)
├── Table Footer (pagination, row count)
└── Column visibility toggle
```

### Server-Side Data Hook
```typescript
interface TableParams {
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
  filters?: Record<string, string>;
}

async function fetchTableData<T>(
  table: string,
  params: TableParams
): Promise<{ data: T[]; total: number }> {
  let query = supabase
    .from(table)
    .select('*', { count: 'exact' });

  // Search
  if (params.search) {
    query = query.textSearch('search_vector', params.search);
  }

  // Filters
  if (params.filters) {
    for (const [key, value] of Object.entries(params.filters)) {
      if (value) query = query.eq(key, value);
    }
  }

  // Sort
  query = query.order(params.sortBy, { ascending: params.sortOrder === 'asc' });

  // Paginate
  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) throw error;

  return { data: data as T[], total: count || 0 };
}
```

### TanStack Table Setup
```typescript
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  getFilteredRowModel, getPaginationRowModel,
  flexRender, ColumnDef, SortingState,
} from '@tanstack/react-table';

function DataTable<T>({ columns, data, total, onParamsChange }: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] = useState({});

  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,    // server-side
    manualSorting: true,       // server-side
    manualFiltering: true,     // server-side
    pageCount: Math.ceil(total / pageSize),
    enableRowSelection: true,
  });

  // Sync state changes to parent (which syncs to URL + refetch)
  useEffect(() => {
    onParamsChange({
      sortBy: sorting[0]?.id || 'created_at',
      sortOrder: sorting[0]?.desc ? 'desc' : 'asc',
    });
  }, [sorting]);

  return (/* render table */);
}
```

### Column Definition Pattern
```typescript
const columns: ColumnDef<User>[] = [
  // Selection checkbox
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
  },
  // Data columns
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <SortableHeader column={column}>Name</SortableHeader>
    ),
    cell: ({ row }) => <span className="font-medium">{row.getValue('name')}</span>,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.getValue('status')} />,
    filterFn: 'equals',
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => <SortableHeader column={column}>Created</SortableHeader>,
    cell: ({ row }) => formatDate(row.getValue('created_at')),
  },
  // Actions column
  {
    id: 'actions',
    cell: ({ row }) => <RowActions row={row} />,
    enableSorting: false,
  },
];
```

### Bulk Actions
```typescript
function BulkActions({ table }: { table: Table<any> }) {
  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedIds = selectedRows.map((r) => r.original.id);

  if (selectedRows.length === 0) return null;

  return (
    <div className="flex items-center gap-2 p-2 bg-muted rounded">
      <span className="text-sm">{selectedRows.length} selected</span>
      <Button size="sm" variant="outline" onClick={() => handleBulkStatusChange(selectedIds, 'active')}>
        Activate
      </Button>
      <Button size="sm" variant="outline" onClick={() => handleBulkExport(selectedIds)}>
        Export
      </Button>
      <Button size="sm" variant="destructive" onClick={() => handleBulkDelete(selectedIds)}>
        Delete
      </Button>
    </div>
  );
}
```

### CSV Export
```typescript
function exportToCsv(data: Record<string, any>[], filename: string) {
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map((row) =>
      headers.map((h) => {
        const val = row[h]?.toString() || '';
        // Escape commas and quotes
        return val.includes(',') || val.includes('"')
          ? `"${val.replace(/"/g, '""')}"`
          : val;
      }).join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// For full filtered export (not just current page)
async function exportAllFiltered(table: string, filters: Filters) {
  const { data } = await supabase
    .from(table)
    .select('*')
    ./* apply same filters as table */
    .csv(); // Supabase native CSV export

  // Or fetch all and convert client-side
}
```

### Inline Editing
```typescript
function EditableCell({ value, row, column, onSave }: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  const handleSave = async () => {
    await onSave(row.original.id, column.id, editValue);
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <span
        onDoubleClick={() => setIsEditing(true)}
        className="cursor-pointer hover:bg-muted px-2 py-1 rounded"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setIsEditing(true)}
      >
        {value}
      </span>
    );
  }

  return (
    <input
      autoFocus
      value={editValue}
      onChange={(e) => setEditValue(e.target.value)}
      onBlur={handleSave}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') { setEditValue(value); setIsEditing(false); }
      }}
      className="w-full px-2 py-1 border rounded"
    />
  );
}
```

### Responsive Table
```typescript
// On mobile, switch to card layout
function ResponsiveTable({ table, columns }: ResponsiveTableProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (isMobile) {
    return (
      <div className="space-y-3">
        {table.getRowModel().rows.map((row) => (
          <div key={row.id} className="border rounded-lg p-4 space-y-2">
            {columns.filter((c) => c.id !== 'select' && c.id !== 'actions').map((col) => (
              <div key={col.id} className="flex justify-between">
                <span className="text-muted-foreground text-sm">{col.header}</span>
                <span>{flexRender(col.cell, row.getVisibleCells().find((c) => c.column.id === col.id)!)}</span>
              </div>
            ))}
            <RowActions row={row} />
          </div>
        ))}
      </div>
    );
  }

  return <table>{/* standard table rendering */}</table>;
}
```

## Code Templates

- **`data-table-component.tsx`** — Full data table with sort, filter, paginate, bulk actions, column visibility, export, and responsive card layout

## Checklist

- [ ] Server-side pagination for datasets > 100 rows
- [ ] Sort state synced to URL query params
- [ ] Filter state synced to URL query params
- [ ] Loading skeleton shown during data fetch
- [ ] Empty state with "clear filters" action
- [ ] Sticky header on scroll
- [ ] Row selection with select-all (current page)
- [ ] Bulk actions appear when rows selected
- [ ] CSV export works for all filtered results (not just current page)
- [ ] Column visibility toggle available
- [ ] Keyboard navigable (Tab, Enter for actions)
- [ ] Responsive: card layout on mobile
- [ ] Page size selector (10, 25, 50, 100)
- [ ] Total row count displayed
- [ ] Sort indicators (↑↓) on column headers

## Common Pitfalls

1. **Client-side everything** — Loading 10,000 rows and sorting/filtering in JS. Server-side pagination is mandatory for large datasets.
2. **Missing indexes** — Tables sort by `created_at` but no index exists. Every sortable column needs a database index.
3. **Export performance** — Exporting 100k rows client-side crashes the browser. Use server-side CSV generation for large exports.
4. **Select all confusion** — "Select all" selects current page only. If user expects all rows, add "Select all X results" option that triggers server-side bulk operation.
5. **Filter cascade** — Changing one filter resets others unexpectedly. Preserve all filter state in URL params independently.
