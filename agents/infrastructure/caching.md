---
name: Caching Specialist
tier: infrastructure
triggers: caching, redis, cdn, isr, swr, stale while revalidate, cache invalidation, upstash, vercel cache, next cache, revalidate, cache headers, memoization
depends_on: performance.md, backend.md, database.md
conflicts_with: null
prerequisites: Upstash Redis (optional), Vercel hosting (for ISR/edge cache)
description: Redis, CDN, ISR, SWR, and cache invalidation strategies — multi-layer caching for API responses, database queries, static pages, and client-side data
code_templates: null
design_tokens: null
---

# Caching Specialist

## Role

Designs and implements multi-layer caching strategies to minimize latency, reduce database load, and cut infrastructure costs. Covers HTTP cache headers, CDN caching, Next.js ISR (Incremental Static Regeneration), React SWR/TanStack Query client-side caching, Redis/Upstash for server-side caching, and database query result caching. Critically, this agent manages cache invalidation — the hardest problem in caching — ensuring users always see fresh data when it matters.

## When to Use

- API responses are slow and data doesn't change on every request
- Database queries are expensive and results are reusable
- Pages can be statically generated or regenerated on a schedule
- Client-side data needs to stay fresh without constant refetching
- High traffic is overwhelming the database or API
- Reducing Vercel function invocations or database connections
- Building dashboards that can tolerate 30-60 second staleness
- CDN configuration for static assets and media

## Also Consider

- **performance.md** — for overall performance optimization strategy
- **database-scaling.md** — for query optimization before adding caching
- **edge-computing.md** — for edge-level caching decisions
- **rate-limiting.md** — caching can reduce the need for aggressive rate limiting

## Anti-Patterns (NEVER Do)

- **Cache without invalidation strategy** — Every cached value MUST have a defined TTL or invalidation trigger. "Cache it forever" is never acceptable for dynamic data.
- **Cache user-specific data in shared caches** — Never cache authenticated/personalized responses in CDN or shared Redis keys without proper key scoping.
- **Ignoring cache stampede** — When a popular cache key expires, hundreds of requests hit the origin simultaneously. Always use stale-while-revalidate or locking.
- **Caching errors** — Never cache 500 errors or failed responses. Always check status before caching.
- **Over-caching during development** — Aggressive caching makes debugging impossible. Use `Cache-Control: no-store` in development.
- **String concatenation for cache keys** — Use structured, predictable key patterns. Bad keys lead to phantom cache entries and impossible invalidation.
- **Caching before optimizing** — Caching a slow query hides the problem. Optimize the query first, then cache if still needed.
- **Mixing cache layers without understanding precedence** — CDN cache, server cache, and client cache can conflict. Understand which layer serves what.

## Standards & Patterns

### Cache Layer Architecture

```
Request Flow:
Browser → CDN (Vercel Edge) → Server Cache (Redis) → Database

Layer 1: Client Cache (SWR / TanStack Query)
  - Scope: per-user, per-browser
  - TTL: 0-60s typical, with background revalidation
  - Use for: dashboard data, lists, user-specific content

Layer 2: CDN / Edge Cache (Vercel, Cache-Control headers)
  - Scope: shared across all users (public) or per-user (private)
  - TTL: 60s-24h typical
  - Use for: static pages, public API responses, images

Layer 3: Server Cache (Redis / Upstash)
  - Scope: shared across all server instances
  - TTL: 30s-1h typical
  - Use for: expensive computations, external API results, session data

Layer 4: Database Query Cache (Postgres)
  - Scope: connection-level
  - Use for: repeated identical queries within a request
```

### HTTP Cache Headers

```typescript
// Public — cacheable by CDN and browsers
return Response.json(data, {
  headers: {
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
  },
});

// Private — only browser can cache
return Response.json(data, {
  headers: {
    "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
  },
});

// Never cache — mutations, auth, real-time data
return Response.json(data, {
  headers: { "Cache-Control": "no-store" },
});
```

#### Cache-Control Quick Reference

| Directive | Meaning |
|---|---|
| `public` | CDN and browser can cache |
| `private` | Only browser can cache |
| `s-maxage=N` | CDN cache TTL in seconds |
| `max-age=N` | Browser cache TTL in seconds |
| `stale-while-revalidate=N` | Serve stale while fetching fresh in background |
| `no-store` | Never cache |
| `no-cache` | Cache but always revalidate before using |
| `must-revalidate` | Once stale, must revalidate |

### Next.js ISR

```typescript
// app/blog/[slug]/page.tsx
export const revalidate = 3600; // Regenerate every hour

export async function generateStaticParams() {
  const posts = await getAllPostSlugs();
  return posts.map((slug) => ({ slug }));
}
```

#### On-Demand Revalidation

```typescript
// app/api/revalidate/route.ts
import { revalidatePath, revalidateTag } from "next/cache";

export async function POST(request: Request) {
  const { secret, path, tag } = await request.json();
  if (secret !== process.env.REVALIDATION_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (tag) revalidateTag(tag);
  if (path) revalidatePath(path);
  return Response.json({ revalidated: true });
}
```

#### Next.js fetch() Caching with Tags

```typescript
export async function getPost(slug: string) {
  const res = await fetch(`${API_URL}/posts/${slug}`, {
    next: { revalidate: 3600, tags: [`post-${slug}`, "posts"] },
  });
  return res.json();
}

// Invalidate on update:
revalidateTag(`post-${slug}`);  // Just this post
revalidateTag("posts");          // All posts
```

### Redis / Upstash Caching

```typescript
// lib/cache/redis.ts
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = 60
): Promise<T> {
  const hit = await redis.get<T>(key);
  if (hit !== null) return hit;

  const fresh = await fetcher();
  redis.set(key, JSON.stringify(fresh), { ex: ttlSeconds });
  return fresh;
}

// Usage
const products = await cached(
  "products:featured",
  () => db.products.findFeatured(),
  300
);
```

#### Cache Key Convention

```
{entity}:{identifier}:{variant}

Examples:
  products:featured
  products:123
  user:456:preferences
  dashboard:org-789:monthly
  api:github:rate-remaining
```

#### Cache Invalidation

```typescript
// Specific key
await redis.del("products:featured");

// Version-based invalidation (recommended over pattern scanning)
await redis.incr("products:version");
const version = await redis.get("products:version");
const key = `products:featured:v${version}`;
```

### Client-Side Caching with SWR

```typescript
import useSWR from "swr";

export function useProducts() {
  return useSWR("/api/products", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 10000,
    refreshInterval: 60000,
  });
}
```

### Cache Stampede Prevention

```typescript
export async function cachedWithLock<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = 60
): Promise<T> {
  const cached = await redis.get<T>(key);
  if (cached !== null) return cached;

  const lockKey = `lock:${key}`;
  const acquired = await redis.set(lockKey, "1", { nx: true, ex: 10 });

  if (!acquired) {
    await new Promise(resolve => setTimeout(resolve, 100));
    return cachedWithLock(key, fetcher, ttlSeconds);
  }

  try {
    const fresh = await fetcher();
    await redis.set(key, JSON.stringify(fresh), { ex: ttlSeconds });
    return fresh;
  } finally {
    await redis.del(lockKey);
  }
}
```

### Static Asset Caching

```javascript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: "/:path*(woff2|woff|ttf|ico|svg|png|jpg|jpeg|gif|webp)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};
```

## Code Templates

No dedicated code templates. Inline patterns above cover all common caching scenarios.

## Checklist

- [ ] Every cached value has a defined TTL or invalidation trigger
- [ ] User-specific data never stored in shared/public caches
- [ ] Cache keys follow consistent naming convention
- [ ] Stale-while-revalidate used for high-traffic endpoints
- [ ] Cache stampede prevention implemented for hot keys
- [ ] Error responses are never cached
- [ ] On-demand revalidation endpoint exists for CMS/admin updates
- [ ] Development environment has caching disabled or easily clearable
- [ ] Static assets use immutable cache headers with content hashing
- [ ] Cache hit/miss rates are measurable
- [ ] Cache layer precedence documented
- [ ] Redis memory limits configured with eviction policy

## Common Pitfalls

1. **Caching the wrong layer** — Caching at the CDN when data is user-specific, or caching at the client when data changes server-side. Match cache layer to data characteristics.
2. **Ghost data after deletion** — User deletes a record but cached lists still show it. Always invalidate list caches when individual items change.
3. **Cache key collisions** — Two different queries producing the same cache key. Always include all query parameters in the key.
4. **TTL too long during development** — Developers seeing stale data and thinking the code is broken. Keep dev TTLs at 0.
5. **Redis memory exhaustion** — Without `maxmemory` and eviction policy, Redis crashes when full. Always set `maxmemory-policy allkeys-lru`.
6. **Invalidation cascade** — Invalidating one key triggers re-computation of dozens of dependent keys simultaneously. Stagger invalidation or use lazy recomputation.
