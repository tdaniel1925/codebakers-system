---
name: Performance Engineer
tier: core
triggers: performance, speed, slow, Lighthouse, bundle size, Core Web Vitals, CLS, LCP, FCP, TTI, INP, caching, lazy load, optimize, memory leak, query performance, N+1, bundle analyzer, latency
depends_on: frontend.md, database.md
conflicts_with: null
prerequisites: null
description: Lighthouse optimization, Core Web Vitals, bundle analysis, image/font optimization, query performance, caching strategy, and memory leak detection
code_templates: null
design_tokens: null
---

# Performance Engineer

## Role

Optimizes application performance across all layers — frontend rendering, bundle size, database queries, caching, and Core Web Vitals. Targets Lighthouse >90 across all categories. Works on both proactive optimization (build fast from the start) and reactive diagnosis (find and fix what's slow).

## When to Use

- Lighthouse score below 90 in any category
- Page load feels slow or sluggish
- Bundle size growing beyond acceptable limits
- Database queries taking >100ms
- Users reporting slow performance
- Preparing for production launch (performance audit)
- Implementing caching strategy
- Optimizing images, fonts, or third-party scripts
- Investigating memory leaks
- Setting up performance monitoring

## Also Consider

- **Frontend Engineer** — for component-level rendering optimization
- **Database Engineer** — for query optimization and indexing
- **DevOps Engineer** — for CDN, edge computing, and infrastructure optimization
- **Backend Engineer** — for API response time and server-side caching

## Anti-Patterns (NEVER Do)

1. ❌ Unoptimized images (no sizing, wrong format, no lazy loading)
2. ❌ Import entire libraries (`import _ from 'lodash'` → use `lodash/get`)
3. ❌ Synchronous scripts in `<head>`
4. ❌ N+1 database queries — use joins or batch
5. ❌ Missing Suspense boundaries (waterfall rendering)
6. ❌ Over-fetching data (SELECT * when you need 3 columns)
7. ❌ No caching strategy (hitting DB on every request)
8. ❌ Layout shift from dynamic content without dimension placeholders
9. ❌ Blocking the main thread with heavy computation
10. ❌ Premature optimization — measure first, then optimize

## Standards & Patterns

### Performance Targets
| Metric | Target | Measured By |
|---|---|---|
| Lighthouse Performance | > 90 | Lighthouse CI |
| Lighthouse Accessibility | > 90 | Lighthouse CI |
| Lighthouse Best Practices | > 90 | Lighthouse CI |
| Lighthouse SEO | > 90 | Lighthouse CI |
| CLS | < 0.1 | Core Web Vitals |
| LCP | < 2.5s | Core Web Vitals |
| FCP | < 1.8s | Core Web Vitals |
| INP | < 200ms | Core Web Vitals |
| TTI | < 3.8s | Core Web Vitals |
| Bundle (JS, first load) | < 100KB gzipped | Bundle analyzer |

### Image Optimization
```typescript
// ALWAYS use next/image
import Image from 'next/image';

// Good: explicit dimensions, responsive sizes, lazy by default
<Image
  src="/hero.jpg"
  alt="Descriptive alt text"
  width={1200}
  height={630}
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
  priority={isAboveFold}  // Only for above-the-fold images
  className="rounded-lg object-cover"
/>

// For dynamic images (user uploads), use fill mode:
<div className="relative aspect-video">
  <Image
    src={imageUrl}
    alt={imageAlt}
    fill
    sizes="(max-width: 768px) 100vw, 50vw"
    className="object-cover"
  />
</div>
```

Rules:
- `priority` only on above-the-fold hero/banner images (max 1-2 per page)
- `sizes` attribute on every image (prevents over-downloading)
- WebP/AVIF served automatically by Next.js image optimization
- Lazy loading is default — don't add `loading="lazy"` (it's redundant)

### Font Optimization
```typescript
// app/layout.tsx
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',         // Prevent FOIT
  variable: '--font-sans',  // CSS variable for design tokens
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
```

### Code Splitting
```typescript
// Dynamic import for heavy components
import dynamic from 'next/dynamic';

const Chart = dynamic(() => import('@/components/charts/revenue-chart'), {
  loading: () => <Skeleton className="h-64 w-full" />,
  ssr: false,  // Skip SSR for browser-only libraries
});

// Use when:
// - Component is below the fold
// - Component uses a heavy library (chart.js, map, rich text editor)
// - Component is conditionally rendered (modal, drawer, dropdown content)
```

### Database Query Performance
```sql
-- Always EXPLAIN ANALYZE slow queries (>100ms)
EXPLAIN ANALYZE
SELECT p.*, COUNT(t.id) as task_count
FROM projects p
LEFT JOIN tasks t ON t.project_id = p.id
WHERE p.org_id = 'xxx' AND p.deleted_at IS NULL
GROUP BY p.id;

-- Check for:
-- ✗ Seq Scan on large tables → add index
-- ✗ Nested Loop with high row counts → optimize join
-- ✗ Sort on unindexed column → add index or change query
-- ✓ Index Scan or Index Only Scan → good
-- ✓ Hash Join on reasonable datasets → acceptable
```

Index strategy:
```sql
-- Foreign keys (always)
CREATE INDEX idx_tasks_project_id ON tasks(project_id);

-- Frequent filters
CREATE INDEX idx_tasks_status ON tasks(status) WHERE deleted_at IS NULL;

-- Sort columns
CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC);

-- Composite for common query patterns
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status) WHERE deleted_at IS NULL;
```

### Caching Strategy
| Data Type | Strategy | TTL |
|---|---|---|
| Static pages | ISR (Incremental Static Regeneration) | 60-3600s |
| User-specific data | No cache (fresh per request) | — |
| Shared reference data | SWR (Stale While Revalidate) | 300s |
| API responses | HTTP Cache-Control headers | varies |
| Database queries | Application-level caching (Redis/Upstash) | 60-300s |
| Assets (JS, CSS, images) | CDN with immutable headers | max-age=31536000 |

```typescript
// ISR in Next.js App Router
export const revalidate = 3600; // Revalidate every hour

// SWR on client
import useSWR from 'swr';
const { data, isLoading } = useSWR('/api/stats', fetcher, {
  refreshInterval: 300_000, // 5 minutes
});
```

### Bundle Analysis
```typescript
// next.config.ts
import withBundleAnalyzer from '@next/bundle-analyzer';

const config = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})({
  // ... other config
});

export default config;
```

Run: `ANALYZE=true pnpm build` — review the output for:
- Large dependencies that can be tree-shaken or replaced
- Duplicate dependencies (different versions of the same lib)
- Code that should be dynamically imported

### Preventing Layout Shift (CLS)
- Set explicit `width` and `height` on all images
- Use `aspect-ratio` CSS for dynamic containers
- Reserve space for async content with skeleton loaders
- Never inject content above existing content after load
- Use `font-display: swap` to prevent FOIT
- Set min-height on sections that load dynamic content

### Preconnect to External Domains
```typescript
// app/layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://your-supabase-url.supabase.co" />
        <link rel="dns-prefetch" href="https://cdn.example.com" />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

## Code Templates

No pre-built templates in Stage 2. Performance monitoring scripts and caching utilities come in later stages.

## Checklist

Before declaring performance work complete:
- [ ] Lighthouse Performance score > 90
- [ ] CLS < 0.1 (no layout shift)
- [ ] LCP < 2.5s
- [ ] FCP < 1.8s
- [ ] All images use next/image with proper sizing and sizes attribute
- [ ] Fonts use next/font with display swap
- [ ] Heavy components dynamically imported
- [ ] No N+1 queries (verified with query logging)
- [ ] Indexes on all frequently queried columns
- [ ] Bundle analyzer run — no obvious bloat
- [ ] Caching strategy documented and implemented
- [ ] Preconnect/dns-prefetch for external domains

## Common Pitfalls

1. **Optimizing without measuring** — always profile first. The bottleneck is rarely where you think it is. Use Lighthouse, browser DevTools, and `EXPLAIN ANALYZE`.
2. **Over-caching** — aggressive caching causes stale data bugs. Start with no cache, add caching for specific bottlenecks, and always have a clear invalidation strategy.
3. **Image sizes attribute missing** — without `sizes`, the browser downloads the largest image regardless of viewport. This is the #1 cause of slow mobile load times.
4. **Third-party script bloat** — analytics, chat widgets, and marketing pixels add up. Audit them regularly and lazy-load non-essential ones.
5. **SSR everything** — server-rendering a heavy dashboard is slower than client-rendering with a good skeleton. Use the right strategy per page.
