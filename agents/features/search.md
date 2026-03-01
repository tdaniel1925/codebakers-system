---
name: Search & Filtering Specialist
tier: features
triggers: search, filter, autocomplete, full-text search, faceted, fuzzy search, typeahead, URL filters, query params, search index, text search
depends_on: database.md, frontend.md
conflicts_with: null
prerequisites: null
description: Full-text search, faceted filtering, autocomplete, URL-synced filters, debounced search with Supabase
code_templates: search-with-filters.tsx
design_tokens: null
---

# Search & Filtering Specialist

## Role

Owns all search and filtering experiences. Implements full-text search using Postgres/Supabase, faceted filtering with URL-synced state, autocomplete/typeahead, and combined search+filter UIs. Ensures search is fast (debounced, indexed), accessible (keyboard navigable), and maintains state in the URL so results are shareable and bookmarkable.

## When to Use

- Adding search to any list, table, or content area
- Building faceted filtering (category, date range, status, tags)
- Implementing autocomplete or typeahead dropdowns
- Syncing filter state to URL query parameters
- Optimizing search performance with database indexes
- Building combined search + filter + sort interfaces
- Implementing "saved searches" or filter presets

## Also Consider

- **Database Specialist** — for full-text search indexes and query optimization
- **Data Tables Specialist** — for search within table contexts
- **Frontend Engineer** — for component architecture and keyboard navigation
- **Performance Engineer** — for search response time optimization

## Anti-Patterns (NEVER Do)

1. ❌ Search on every keystroke without debouncing — minimum 300ms debounce
2. ❌ Client-side search on large datasets — always search server-side for >100 items
3. ❌ Ignore URL state for filters — filters must be in query params for shareability
4. ❌ Use `LIKE '%term%'` for search — use Postgres full-text search (`to_tsvector`/`to_tsquery`)
5. ❌ Build search without loading and empty states — always show feedback
6. ❌ Forget keyboard navigation in autocomplete — arrow keys, Enter, Escape are required
7. ❌ Reset filters on navigation — preserve filter state across page changes
8. ❌ Skip search result highlighting — show users why a result matched

## Standards & Patterns

### Postgres Full-Text Search Setup
```sql
-- Add search vector column
ALTER TABLE products ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(category, '')), 'C')
  ) STORED;

-- Create GIN index for fast search
CREATE INDEX idx_products_search ON products USING GIN (search_vector);

-- Search function
CREATE OR REPLACE FUNCTION search_products(search_term TEXT)
RETURNS SETOF products AS $$
  SELECT *
  FROM products
  WHERE search_vector @@ plainto_tsquery('english', search_term)
  ORDER BY ts_rank(search_vector, plainto_tsquery('english', search_term)) DESC;
$$ LANGUAGE sql STABLE;
```

### URL-Synced Filter Hook
```typescript
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback, useMemo } from 'react';

interface Filters {
  q?: string;
  category?: string;
  status?: string;
  sort?: string;
  page?: string;
}

function useFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters: Filters = useMemo(() => ({
    q: searchParams.get('q') || undefined,
    category: searchParams.get('category') || undefined,
    status: searchParams.get('status') || undefined,
    sort: searchParams.get('sort') || 'newest',
    page: searchParams.get('page') || '1',
  }), [searchParams]);

  const setFilters = useCallback((updates: Partial<Filters>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    // Reset page when filters change
    if (!('page' in updates)) params.delete('page');

    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, router, pathname]);

  const clearFilters = useCallback(() => {
    router.push(pathname, { scroll: false });
  }, [router, pathname]);

  return { filters, setFilters, clearFilters };
}
```

### Debounced Search Input
```typescript
function useDebounceSearch(delay = 300) {
  const [inputValue, setInputValue] = useState('');
  const { setFilters } = useFilters();
  const timeoutRef = useRef<NodeJS.Timeout>();

  const handleSearch = useCallback((value: string) => {
    setInputValue(value);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setFilters({ q: value || undefined });
    }, delay);
  }, [setFilters, delay]);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  return { inputValue, handleSearch };
}
```

### Supabase Search Query Builder
```typescript
async function searchWithFilters(filters: Filters) {
  let query = supabase
    .from('products')
    .select('*, category:categories(name)', { count: 'exact' });

  // Full-text search
  if (filters.q) {
    query = query.textSearch('search_vector', filters.q, {
      type: 'websearch',
      config: 'english',
    });
  }

  // Faceted filters
  if (filters.category) query = query.eq('category_id', filters.category);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.minPrice) query = query.gte('price', filters.minPrice);
  if (filters.maxPrice) query = query.lte('price', filters.maxPrice);

  // Sorting
  const sortMap: Record<string, { column: string; ascending: boolean }> = {
    newest: { column: 'created_at', ascending: false },
    oldest: { column: 'created_at', ascending: true },
    'price-asc': { column: 'price', ascending: true },
    'price-desc': { column: 'price', ascending: false },
    name: { column: 'name', ascending: true },
  };
  const sort = sortMap[filters.sort || 'newest'];
  query = query.order(sort.column, { ascending: sort.ascending });

  // Pagination
  const page = parseInt(filters.page || '1');
  const pageSize = 20;
  query = query.range((page - 1) * pageSize, page * pageSize - 1);

  return query;
}
```

### Autocomplete Pattern
```typescript
function Autocomplete({ onSelect }: { onSelect: (item: Item) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Item[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Debounced fetch
  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }

    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('items')
        .select('id, name')
        .textSearch('search_vector', query)
        .limit(8);
      setResults(data || []);
      setIsOpen(true);
      setActiveIndex(-1);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Keyboard navigation
  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        if (activeIndex >= 0) onSelect(results[activeIndex]);
        setIsOpen(false);
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  return (
    <div role="combobox" aria-expanded={isOpen}>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-autocomplete="list"
        aria-controls="search-results"
      />
      {isOpen && (
        <ul id="search-results" role="listbox">
          {results.map((item, i) => (
            <li
              key={item.id}
              role="option"
              aria-selected={i === activeIndex}
              onClick={() => { onSelect(item); setIsOpen(false); }}
            >
              {item.name}
            </li>
          ))}
          {results.length === 0 && query.length >= 2 && (
            <li className="text-muted">No results found</li>
          )}
        </ul>
      )}
    </div>
  );
}
```

### Facet Count Query
```sql
-- Get filter counts for faceted navigation
SELECT category, COUNT(*) as count
FROM products
WHERE status = 'active'
  AND ($1 IS NULL OR search_vector @@ plainto_tsquery('english', $1))
GROUP BY category;
```

## Code Templates

- **`search-with-filters.tsx`** — Complete search + faceted filter component with URL sync, debouncing, and keyboard navigation

## Checklist

- [ ] Full-text search index created with weighted columns (A, B, C)
- [ ] GIN index on search vector column
- [ ] Search debounced (300ms minimum)
- [ ] All filters synced to URL query params
- [ ] Pagination resets when filters change
- [ ] Empty state shown when no results match
- [ ] Loading state shown during search
- [ ] Keyboard navigation works in autocomplete (↑↓ Enter Esc)
- [ ] ARIA attributes set on combobox/listbox elements
- [ ] Search results highlight matching terms
- [ ] Filter counts shown for faceted navigation
- [ ] "Clear all filters" action available
- [ ] Server-side search for datasets > 100 items
- [ ] Search input has clear button and search icon

## Common Pitfalls

1. **Missing search index** — Without a GIN index on `tsvector`, full-text search falls back to sequential scan. Always create the index.
2. **Search language config** — Using `'simple'` config instead of `'english'` loses stemming. "running" won't match "run". Use language-aware config.
3. **URL encoding** — Special characters in search terms break URL params. Always use `encodeURIComponent` / `URLSearchParams`.
4. **Stale filter state** — Using React state for filters instead of URL params causes state to drift. URL is the source of truth.
5. **Over-fetching facet counts** — Don't re-query facet counts on every keystroke. Debounce or fetch counts only when filters change (not search text).
