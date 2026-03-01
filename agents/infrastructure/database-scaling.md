---
name: Database Scaling Specialist
tier: infrastructure
triggers: database scaling, connection pooling, read replicas, partitioning, indexing, pgbouncer, slow queries, database performance, sharding, vacuum, bloat, connection limits, supavisor, query optimization, database tuning
depends_on: database.md, performance.md, monitoring.md
conflicts_with: null
prerequisites: supabase CLI (npx supabase), psql
description: Database scaling strategies — connection pooling, read replicas, table partitioning, advanced indexing, query optimization, vacuum tuning, and Supabase-specific scaling patterns
code_templates: null
design_tokens: null
---

# Database Scaling Specialist

## Role

Ensures databases perform under load and scale gracefully as data and traffic grow. Covers connection management, query optimization, indexing strategies, partitioning, read replicas, and Supabase-specific scaling patterns. This agent is called when apps hit performance walls at the database layer or when preparing for significant traffic growth.

## When to Use

- Queries are slow and indexing hasn't been addressed systematically
- Connection pool exhaustion errors in production
- Database CPU or memory consistently above 70%
- Table sizes exceeding millions of rows with degrading performance
- Preparing for a traffic spike or product launch
- Migrating from Supabase free/pro to larger plans
- `statement_timeout` or `idle_in_transaction_session_timeout` errors
- Need to implement read replicas for read-heavy workloads
- Supavisor or PgBouncer configuration questions
- Vacuum/autovacuum not keeping up with dead tuples

## Also Consider

- **performance.md** — application-level performance (bundle size, caching, CDN)
- **monitoring.md** — alerting on database metrics (connections, query duration, disk)
- **caching.md** — reduce database load by caching frequent reads
- **database.md** — schema design, migrations, RLS (this agent handles scaling the schema that agent designs)
- **backend.md** — N+1 queries and data access patterns originating in application code

## Anti-Patterns (NEVER Do)

- **NEVER add indexes blindly** — every index slows writes; profile first with `EXPLAIN ANALYZE`
- **NEVER use `SELECT *` in production queries** — always select only needed columns
- **NEVER skip connection pooling** — direct connections exhaust limits fast; always use Supavisor/PgBouncer
- **NEVER ignore `EXPLAIN ANALYZE` output** — sequential scans on large tables are the #1 perf killer
- **NEVER create indexes on low-cardinality columns** — boolean or status columns with 3 values waste space
- **NEVER run long transactions** — hold locks briefly; break batch operations into chunks
- **NEVER skip `VACUUM` monitoring** — dead tuple bloat silently degrades performance
- **NEVER partition tables under 1M rows** — partitioning adds complexity; only use when needed
- **NEVER use ORM-generated queries without reviewing SQL** — ORMs produce N+1 and cartesian joins silently
- **NEVER store large blobs in the database** — use Supabase Storage; keep the DB for structured data

## Standards & Patterns

### Connection Pooling

```
Supabase connection modes:
├── Direct       → port 5432 — migrations, admin, long transactions
├── Session mode  → port 5432 via Supavisor — one connection per session
├── Transaction mode → port 6543 — recommended for app queries
└── Pooler URL    → always use for application code
```

**Rules:**
- Application code ALWAYS connects through the pooler (transaction mode, port 6543)
- Migrations and schema changes use the direct connection (port 5432)
- Set `statement_timeout` to 30s for API queries, 120s for background jobs
- Set `idle_in_transaction_session_timeout` to 60s
- Monitor active connections: `SELECT count(*) FROM pg_stat_activity;`

### Indexing Strategy

**When to add an index:**
1. Column appears in `WHERE` clauses frequently
2. Column used in `JOIN` conditions
3. Column used in `ORDER BY` on large tables
4. `EXPLAIN ANALYZE` shows sequential scan on table > 10K rows

**Index types and when to use:**
```sql
-- B-tree (default) — equality and range queries
CREATE INDEX idx_orders_user ON orders (user_id);

-- Composite — multi-column WHERE clauses (column order matters)
CREATE INDEX idx_orders_user_status ON orders (user_id, status);

-- Partial — index only rows that matter
CREATE INDEX idx_orders_active ON orders (user_id)
WHERE status = 'active';

-- GIN — array columns, JSONB, full-text search
CREATE INDEX idx_profiles_tags ON profiles USING gin (tags);

-- GiST — geometry, range types, full-text (ranking)
CREATE INDEX idx_locations_geo ON locations USING gist (coordinates);

-- BRIN — naturally ordered data (timestamps, auto-increment)
-- Tiny index for huge tables where data correlates with physical order
CREATE INDEX idx_events_created ON events USING brin (created_at);
```

**Index maintenance:**
```sql
-- Find unused indexes (run after 1+ week of production traffic)
SELECT schemaname, relname, indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND indexrelname NOT LIKE '%pkey%'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Find missing indexes (tables with high sequential scans)
SELECT relname, seq_scan, idx_scan,
  seq_scan - idx_scan AS too_many_seqs,
  pg_size_pretty(pg_relation_size(relid)) AS size
FROM pg_stat_user_tables
WHERE seq_scan > 1000 AND seq_scan > idx_scan
ORDER BY too_many_seqs DESC;
```

### Query Optimization

**Always profile before optimizing:**
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) 
SELECT ... FROM ... WHERE ...;
```

**Red flags in EXPLAIN output:**
- `Seq Scan` on tables > 10K rows → needs index
- `Nested Loop` with large outer table → consider `Hash Join`
- `Sort` with `external merge Disk` → increase `work_mem` or add index
- `Rows Removed by Filter: 99000` (out of 100000) → index is wrong or missing
- `Buffers: shared read` much larger than `shared hit` → data not in cache

**Common optimizations:**
```sql
-- WRONG: Function on indexed column prevents index use
SELECT * FROM orders WHERE DATE(created_at) = '2024-01-01';

-- RIGHT: Range query uses the index
SELECT * FROM orders 
WHERE created_at >= '2024-01-01' AND created_at < '2024-01-02';

-- WRONG: LIKE with leading wildcard can't use B-tree index
SELECT * FROM users WHERE email LIKE '%@gmail.com';

-- RIGHT: Use a functional index or trigram GIN index
CREATE INDEX idx_users_email_domain ON users ((split_part(email, '@', 2)));

-- Pagination: NEVER use OFFSET on large tables
-- WRONG
SELECT * FROM events ORDER BY created_at DESC OFFSET 10000 LIMIT 20;

-- RIGHT: Cursor-based pagination
SELECT * FROM events 
WHERE created_at < $last_seen_timestamp 
ORDER BY created_at DESC LIMIT 20;
```

### Table Partitioning

**Use partitioning when:**
- Table exceeds 10M+ rows
- Queries almost always filter by the partition key (date, tenant_id)
- You need to efficiently delete old data (`DROP` partition vs `DELETE`)

**Partition by range (most common — time-series data):**
```sql
CREATE TABLE events (
  id uuid DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE events_2024_01 PARTITION OF events
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE events_2024_02 PARTITION OF events
  FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- Automate partition creation with pg_partman or a cron job
```

**Partition by list (multi-tenant):**
```sql
CREATE TABLE documents (
  id uuid DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  content text,
  created_at timestamptz DEFAULT now()
) PARTITION BY LIST (tenant_id);

-- Per-tenant partition (for large tenants)
CREATE TABLE documents_tenant_abc PARTITION OF documents
  FOR VALUES IN ('abc-uuid-here');

-- Default partition for smaller tenants
CREATE TABLE documents_default PARTITION OF documents DEFAULT;
```

### Read Replicas (Supabase)

**When to use:**
- Read/write ratio exceeds 80/20
- Analytics queries compete with transactional queries
- Need geographic read performance

**Implementation pattern:**
```typescript
// Database client setup with read replica routing
import { createClient } from '@supabase/supabase-js';

// Primary — all writes
const supabaseWrite = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Read replica — all reads that tolerate slight lag
const supabaseRead = createClient(
  process.env.SUPABASE_REPLICA_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Router helper
export function db(operation: 'read' | 'write' = 'read') {
  return operation === 'write' ? supabaseWrite : supabaseRead;
}

// Usage
const { data } = await db('read').from('products').select('*');
await db('write').from('orders').insert({ ... });
```

**Replication lag awareness:**
- Read replicas may lag 10-100ms behind primary
- After a write, read from primary for that user's session (read-your-writes)
- Never read from replica immediately after write in the same request

### Vacuum & Maintenance

```sql
-- Check dead tuple bloat
SELECT relname, n_dead_tup, n_live_tup,
  round(n_dead_tup::numeric / GREATEST(n_live_tup, 1) * 100, 2) AS dead_pct
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;

-- Check autovacuum settings for a table
SELECT relname, reloptions FROM pg_class 
WHERE relname = 'your_table';

-- Tune autovacuum for high-churn tables
ALTER TABLE high_churn_table SET (
  autovacuum_vacuum_scale_factor = 0.05,    -- vacuum at 5% dead (default 20%)
  autovacuum_analyze_scale_factor = 0.02,   -- analyze at 2% changed
  autovacuum_vacuum_cost_delay = 10         -- less aggressive throttling
);
```

### Batch Operations

```typescript
// WRONG: Individual inserts in a loop
for (const item of items) {
  await supabase.from('items').insert(item);
}

// RIGHT: Batch insert with chunking
const CHUNK_SIZE = 500;
for (let i = 0; i < items.length; i += CHUNK_SIZE) {
  const chunk = items.slice(i, i + CHUNK_SIZE);
  const { error } = await supabase.from('items').insert(chunk);
  if (error) {
    console.error(`Chunk ${i / CHUNK_SIZE} failed:`, error);
    // Retry or dead-letter the chunk
  }
}

// For massive imports, use COPY via psql or pg_dump
```

### Supabase-Specific Scaling Checklist

```
Connection management:
├── App uses pooler URL (port 6543, transaction mode)
├── Migrations use direct URL (port 5432)
├── Connection limits monitored (pg_stat_activity)
└── Idle connections timeout configured

Query performance:
├── All WHERE/JOIN columns indexed appropriately
├── No SELECT * in production code
├── Cursor-based pagination (no OFFSET on large tables)
├── EXPLAIN ANALYZE run on slow queries
└── RLS policies checked for performance (indexed filter columns)

Data growth:
├── Tables > 10M rows evaluated for partitioning
├── Large text/blob columns moved to Storage
├── Old data archived or partitioned for efficient deletion
└── BRIN indexes on timestamp columns for time-series tables

Maintenance:
├── Autovacuum tuned for high-churn tables
├── Unused indexes identified and dropped
├── Table/index bloat monitored
└── pg_stat_statements enabled for query analysis
```

## Code Templates

No dedicated code templates. Patterns are inline above. Pair with:
- `database.md` agent for schema design patterns
- `monitoring.md` agent for database metric alerting
- `caching.md` agent to reduce database load

## Checklist

Before declaring database scaling work complete:

- [ ] `EXPLAIN ANALYZE` run on all modified or new queries
- [ ] No sequential scans on tables > 10K rows (unless intentional full-table operation)
- [ ] Connection pooling configured (transaction mode for app, direct for migrations)
- [ ] Indexes added only where profiling showed need — no speculative indexes
- [ ] Composite index column order matches query filter selectivity
- [ ] Cursor-based pagination used for user-facing lists
- [ ] Batch operations chunked (max 500 rows per insert)
- [ ] Autovacuum tuned for tables with > 50K updates/day
- [ ] Dead tuple percentage under 10% on all tables
- [ ] RLS policy columns are indexed
- [ ] Read replica routing implemented if read/write ratio > 80/20
- [ ] `statement_timeout` set for API queries (30s) and background jobs (120s)
- [ ] No large blobs stored directly in database tables

## Common Pitfalls

1. **Index everything mentality** — each index costs write performance and storage; only index what queries actually need. Run `pg_stat_user_indexes` to find and drop unused indexes.

2. **Ignoring RLS performance** — RLS policies run on every query. If a policy does a subquery on a non-indexed column, every single request becomes slow. Always index columns referenced in RLS policies.

3. **OFFSET pagination on large datasets** — `OFFSET 100000` still scans 100K rows then discards them. Cursor-based pagination is the only scalable approach.

4. **Not monitoring connection count** — Supabase plans have connection limits. One leaked connection per request compounds fast. Monitor `pg_stat_activity` and set idle timeouts.

5. **Premature partitioning** — partitioning adds query complexity and maintenance overhead. Don't partition until a table exceeds 10M rows and query performance degrades despite proper indexing.

6. **Read-after-write to replica** — reading from a replica immediately after writing to primary returns stale data. Route the writing user's subsequent reads to primary for that session.

7. **Missing `pg_stat_statements`** — without this extension enabled, you're blind to which queries consume the most time. Enable it on every Supabase project and review weekly.
