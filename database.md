---
name: Database Engineer
tier: core
triggers: database, schema, migration, table, column, RLS, row level security, Supabase, PostgreSQL, Postgres, query, index, foreign key, relationship, seed, SQL, pgvector, function, trigger, view, join, normalization
depends_on: security.md, backend.md
conflicts_with: null
prerequisites: supabase CLI
description: Schema design, migrations, RLS policies, indexes, database functions, query optimization, and Supabase patterns
code_templates: null
design_tokens: null
---

# Database Engineer

## Role

Designs and implements the entire database layer — schemas, migrations, RLS policies, indexes, functions, triggers, and query optimization. Ensures every table follows CodeBakers standards (uuid PK, timestamps, soft delete) and has bulletproof RLS. Uses Supabase and PostgreSQL.

## When to Use

- Designing a new schema or data model
- Creating or modifying database tables
- Writing migration files
- Implementing RLS policies
- Optimizing slow queries
- Adding indexes for performance
- Creating database functions or triggers
- Setting up views for complex joins
- Generating seed data for development
- Reviewing database architecture for issues

## Also Consider

- **Security Engineer** — for RLS audit and data access patterns
- **Backend Engineer** — for service layer that queries the database
- **System Architect** — for data modeling during system design
- **Performance Engineer** — for query optimization and caching strategy

## Anti-Patterns (NEVER Do)

1. ❌ Tables without RLS enabled — no exceptions, ever
2. ❌ Missing `updated_at` trigger — every table needs automatic timestamp updates
3. ❌ Auto-incrementing integer IDs — use UUIDs (leaks count, not scalable)
4. ❌ N+1 queries — use joins, views, or batch fetches
5. ❌ Index every column — only index what's actually queried
6. ❌ Raw SQL string concatenation — always use parameterized queries
7. ❌ Schema changes without migration files — every change tracked
8. ❌ Skip seed data — developers need realistic test data
9. ❌ Nullable booleans — use `DEFAULT false` or `DEFAULT true`
10. ❌ Storing computed values that can be derived — compute on read or use generated columns

## Standards & Patterns

### Table Template
Every table MUST have this structure at minimum:
```sql
CREATE TABLE public.projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ DEFAULT NULL,

  -- Business fields here
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Updated_at trigger (required on every table)
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- RLS (required on every table)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY select_projects_owner ON public.projects
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY insert_projects_owner ON public.projects
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY update_projects_owner ON public.projects
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY delete_projects_owner ON public.projects
  FOR DELETE USING (auth.uid() = owner_id);
```

### The `handle_updated_at` Function
Create once, use on every table:
```sql
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### RLS Policy Naming Convention
`[action]_[table]_[role]`

Examples:
- `select_projects_owner` — owners can read their projects
- `select_projects_org_member` — org members can read org projects
- `insert_invoices_admin` — admins can create invoices
- `update_profiles_self` — users can update their own profile

### RLS Pattern: Organization-Based Access
```sql
-- Users belong to organizations via a membership table
CREATE POLICY select_projects_org_member ON public.projects
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = auth.uid()
      AND deleted_at IS NULL
    )
  );
```

### Foreign Key Rules
Always explicit `ON DELETE` behavior:
```sql
-- User owns the resource → cascade delete
owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

-- Resource references another entity → set null (preserve the record)
assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,

-- Required relationship that must exist → restrict delete
org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT
```

### Index Strategy
```sql
-- Always index foreign keys
CREATE INDEX idx_projects_owner_id ON public.projects(owner_id);

-- Index frequently filtered columns
CREATE INDEX idx_projects_status ON public.projects(status) WHERE deleted_at IS NULL;

-- Composite index for common query patterns
CREATE INDEX idx_tasks_project_status ON public.tasks(project_id, status) WHERE deleted_at IS NULL;

-- Partial index for soft delete (most queries filter this)
CREATE INDEX idx_projects_active ON public.projects(id) WHERE deleted_at IS NULL;
```

### Migration Workflow
```bash
# 1. Make changes in Supabase dashboard or SQL editor
# 2. Generate migration
supabase db diff -f add-projects-table

# 3. Review the generated migration in supabase/migrations/
# 4. Test locally
supabase db reset

# 5. Deploy
supabase db push
```

Rules:
- One logical change per migration file
- Migration names are descriptive: `add-projects-table`, `add-status-to-tasks`
- Never edit a migration that's been pushed to production
- Always test with `supabase db reset` before pushing

### Query Patterns

**Simple CRUD:**
```typescript
// Use Supabase client directly
const { data, error } = await supabase
  .from('projects')
  .select('id, name, status, created_at')
  .eq('owner_id', userId)
  .is('deleted_at', null)
  .order('created_at', { ascending: false })
  .range(0, 19);  // Pagination: first 20 rows
```

**Complex queries — use RPC:**
```sql
CREATE OR REPLACE FUNCTION public.get_project_summary(p_org_id UUID)
RETURNS TABLE (
  project_id UUID,
  project_name TEXT,
  task_count BIGINT,
  completed_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS project_id,
    p.name AS project_name,
    COUNT(t.id) AS task_count,
    COUNT(t.id) FILTER (WHERE t.status = 'done') AS completed_count
  FROM public.projects p
  LEFT JOIN public.tasks t ON t.project_id = p.id AND t.deleted_at IS NULL
  WHERE p.org_id = p_org_id AND p.deleted_at IS NULL
  GROUP BY p.id, p.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Pagination:**
- Offset-based for page numbers: `.range(offset, offset + pageSize - 1)`
- Cursor-based for infinite scroll: `.gt('created_at', lastCursor).limit(20)`

### Seed Data
```sql
-- supabase/seed.sql
-- Realistic test data for development

INSERT INTO public.organizations (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Acme Corp'),
  ('00000000-0000-0000-0000-000000000002', 'Test Org');

INSERT INTO public.projects (id, name, org_id, owner_id) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Website Redesign', '00000000-0000-0000-0000-000000000001', '<test-user-id>'),
  ('10000000-0000-0000-0000-000000000002', 'Mobile App', '00000000-0000-0000-0000-000000000001', '<test-user-id>');
```

## Code Templates

No pre-built templates in Stage 2. Specific patterns (pgvector search, realtime subscriptions) come in later stages.

## Checklist

Before declaring database work complete:
- [ ] Every table has: `id` (uuid), `created_at`, `updated_at`, `deleted_at`
- [ ] `handle_updated_at` trigger on every table
- [ ] RLS enabled on every table
- [ ] RLS policies tested with authorized AND unauthorized users
- [ ] Foreign keys have explicit `ON DELETE` behavior
- [ ] Indexes on all foreign keys and frequently queried columns
- [ ] Migration file created and tested with `supabase db reset`
- [ ] Seed data exists for development
- [ ] No N+1 query patterns in related service code
- [ ] Complex queries use views or RPC functions

## Common Pitfalls

1. **RLS bypass with service key** — the service role key bypasses ALL RLS. Never use it in client code. Use it server-side only and sparingly.
2. **Missing soft delete filter** — every query must include `WHERE deleted_at IS NULL` unless you specifically want deleted records. Use views to enforce this.
3. **Over-indexing** — indexes speed up reads but slow down writes. Only index columns that appear in WHERE, JOIN, and ORDER BY clauses.
4. **Schema drift** — always use migration files. Never modify production schemas directly.
5. **Eager loading everything** — select only the columns you need. `select('*')` is fine for small tables but wasteful for wide ones.
