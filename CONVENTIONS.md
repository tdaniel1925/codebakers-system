# CONVENTIONS.md — Universal Coding Standards & Project Conventions

## Purpose

Every agent in the CodeBakers system follows these conventions. This ensures consistency across all generated code regardless of which agents are active. When an agent's guidance conflicts with these conventions, these conventions win unless the agent explicitly overrides with a documented reason.

## Technology Stack (Default)

```
Frontend:       Next.js 14+ (App Router)
Language:       TypeScript (strict mode)
Styling:        Tailwind CSS
UI Components:  shadcn/ui
Database:       Supabase (PostgreSQL + Auth + Storage + Realtime)
ORM:            Supabase JS Client (not Prisma, not Drizzle)
Payments:       Stripe
Email:          Resend
Hosting:        Vercel
Package Manager: pnpm
```

Override only when a specific integration or requirement demands it (e.g., `twilio` for SMS, `googleapis` for Google APIs).

## Project Structure

```
project-root/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth route group (login, signup, forgot-password)
│   ├── (dashboard)/              # Authenticated route group
│   │   ├── layout.tsx            # Dashboard shell (sidebar + header)
│   │   ├── page.tsx              # Dashboard home
│   │   ├── settings/
│   │   └── [feature]/            # Feature routes
│   ├── (marketing)/              # Public pages
│   │   ├── layout.tsx
│   │   └── page.tsx              # Landing page
│   ├── api/                      # API routes
│   │   ├── webhooks/             # Inbound webhooks (Stripe, Twilio, etc.)
│   │   └── v1/                   # Versioned REST API
│   ├── layout.tsx                # Root layout
│   └── globals.css
├── components/
│   ├── ui/                       # shadcn/ui primitives (button, input, dialog, etc.)
│   └── [feature]/                # Feature-specific components
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Browser client
│   │   ├── server.ts             # Server client (cookies-based)
│   │   ├── admin.ts              # Service role client
│   │   └── middleware.ts         # Auth middleware
│   ├── stripe/
│   │   └── client.ts
│   ├── [integration]/            # Per-integration utilities
│   └── utils.ts                  # General utilities
├── hooks/                        # Custom React hooks
├── types/                        # TypeScript type definitions
│   ├── database.ts               # Generated Supabase types
│   └── [feature].ts
├── actions/                      # Server Actions
├── config/                       # App configuration
│   ├── site.ts                   # Site metadata
│   ├── nav.ts                    # Navigation structure
│   └── plans.ts                  # Subscription plan definitions
├── supabase/
│   ├── migrations/               # SQL migrations (sequential)
│   │   ├── 00001_initial_schema.sql
│   │   ├── 00002_auth_setup.sql
│   │   └── ...
│   └── seed.sql                  # Seed data
├── public/                       # Static assets
├── .env.local                    # Local environment variables
├── .env.example                  # Template for env vars
├── middleware.ts                  # Next.js middleware (auth redirect)
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

## Naming Conventions

### Files & Directories

```
Directories:     kebab-case           app/user-settings/
Pages:           page.tsx             app/dashboard/page.tsx
Layouts:         layout.tsx           app/dashboard/layout.tsx
Components:      PascalCase.tsx       components/InvoiceTable.tsx
Utilities:       camelCase.ts         lib/formatCurrency.ts
Hooks:           use-camelCase.ts     hooks/use-debounce.ts
Types:           camelCase.ts         types/invoice.ts
Server Actions:  camelCase.ts         actions/createInvoice.ts
API Routes:      route.ts             app/api/v1/invoices/route.ts
Migrations:      00001_description.sql
Config:          camelCase.ts         config/siteConfig.ts
```

### Code Identifiers

```
Variables:          camelCase         const invoiceTotal = 0;
Functions:          camelCase         function calculateTotal() {}
React Components:   PascalCase       function InvoiceCard() {}
Types/Interfaces:   PascalCase       interface InvoiceLineItem {}
Enums:              PascalCase       enum InvoiceStatus {}
Constants:          UPPER_SNAKE      const MAX_RETRIES = 5;
Database tables:    snake_case       invoice_line_items
Database columns:   snake_case       created_at, billing_rate
API endpoints:      kebab-case       /api/v1/invoice-items
URL params:         kebab-case       /dashboard/user-settings
Environment vars:   UPPER_SNAKE      STRIPE_SECRET_KEY
CSS classes:        Tailwind only    className="flex items-center gap-2"
```

### Database Naming

```
Tables:             Plural snake_case           invoices, line_items, org_members
Columns:            Singular snake_case         invoice_id, created_at, is_active
Primary keys:       id (UUID)                   id UUID PRIMARY KEY DEFAULT gen_random_uuid()
Foreign keys:       [table_singular]_id         invoice_id, user_id, org_id
Timestamps:         [action]_at                 created_at, updated_at, deleted_at, sent_at
Booleans:           is_[adjective] / has_[noun] is_active, is_paid, has_children
Amounts:            [descriptor]_amount         total_amount, tax_amount, discount_amount
Rates:              [descriptor]_rate           billing_rate, tax_rate, commission_rate
Counts:             [noun]_count                item_count, attempt_count
JSON columns:       Descriptive noun            settings, metadata, custom_fields
Indexes:            idx_[table]_[columns]       idx_invoices_client_date
RLS Policies:       Descriptive string          "org_members_only", "own_records"
Functions:          snake_case verbs            calculate_balance, check_permission
```

## TypeScript Standards

### Strict Mode

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### Type Definitions

```typescript
// DO: Use interfaces for object shapes
interface Invoice {
  id: string;
  clientId: string;
  amount: number;
  status: InvoiceStatus;
  createdAt: string;
}

// DO: Use type for unions, intersections, and computed types
type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void';
type InvoiceWithClient = Invoice & { client: Client };

// DON'T: Use `any` — use `unknown` and narrow
// DON'T: Use `enum` at runtime — use union types instead
// DON'T: Use `I` prefix on interfaces (no IInvoice)
// DON'T: Export types/interfaces from component files — put in types/
```

### Function Signatures

```typescript
// DO: Explicit return types on exported functions
export async function getInvoice(id: string): Promise<Invoice | null> { }

// DO: Use descriptive parameter names
export async function createInvoice(
  orgId: string,
  clientId: string,
  lineItems: CreateLineItemInput[]
): Promise<Invoice> { }

// DON'T: Use positional boolean parameters
// BAD:  createInvoice(orgId, true, false)
// GOOD: createInvoice(orgId, { sendEmail: true, draft: false })
```

### Error Handling

```typescript
// Application errors — use typed error classes
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super('NOT_FOUND', `${resource} not found: ${id}`, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, string>) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super('FORBIDDEN', message, 403);
  }
}

export class PlanLimitError extends AppError {
  constructor(message: string, public limitKey: string, public current: number, public limit: number) {
    super('PLAN_LIMIT', message, 403, { limitKey, current, limit });
  }
}

// API route error handler
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      { code: error.code, message: error.message, details: error.details },
      { status: error.status }
    );
  }
  console.error('Unhandled error:', error);
  return NextResponse.json(
    { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    { status: 500 }
  );
}
```

## API Route Standards

### Route Structure

```typescript
// app/api/v1/invoices/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/errors';

// GET /api/v1/invoices — List invoices
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') ?? '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '25'), 100);
    const offset = (page - 1) * limit;

    const { data, count } = await supabase
      .from('invoices')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    return NextResponse.json({
      data,
      meta: { page, limit, total: count, pages: Math.ceil((count ?? 0) / limit) },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/v1/invoices — Create invoice
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });

    const body = await req.json();
    // Validate body...

    const { data, error } = await supabase
      .from('invoices')
      .insert({ ...body, created_by: user.id })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
```

### API Response Format

```typescript
// Success — single resource
{ "id": "...", "name": "...", "created_at": "..." }

// Success — list
{
  "data": [...],
  "meta": { "page": 1, "limit": 25, "total": 150, "pages": 6 }
}

// Error
{
  "code": "VALIDATION_ERROR",
  "message": "Email is required",
  "details": { "email": "This field is required" }
}
```

## Database Standards

### Every Table Must Have

```sql
CREATE TABLE example (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),   -- Tenant isolation
  -- ... domain columns ...
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE example ENABLE ROW LEVEL SECURITY;
```

### Required Patterns

1. **UUID primary keys** — Always `gen_random_uuid()`, never auto-increment integers
2. **org_id on every tenant table** — No exceptions. This is the tenant isolation key.
3. **RLS enabled on every table** — Even if policies are permissive during development
4. **Timestamps** — `created_at` and `updated_at` on every table
5. **Soft deletes** — Use `is_archived`, `deleted_at`, or `status` fields. Never `DELETE`.
6. **DECIMAL for money** — `DECIMAL(12,2)` minimum. Never `FLOAT` or `REAL`.
7. **TEXT over VARCHAR** — PostgreSQL treats them identically. Use `TEXT` with CHECK constraints.
8. **CHECK constraints** — Enum-like columns use `CHECK (status IN ('a', 'b', 'c'))`, not pg enums
9. **Foreign keys** — Always declare. Use `ON DELETE CASCADE` only on child tables.
10. **Indexes** — Add indexes on foreign keys, frequently filtered columns, and sort columns.

### Migration Numbering

```
00001_initial_schema.sql          — Core tables (organizations, users)
00002_auth_and_roles.sql          — Auth setup, roles, permissions
00003_[feature]_tables.sql        — Feature-specific tables
00004_[feature]_indexes.sql       — Indexes for the feature
00005_[feature]_rls.sql           — RLS policies
00006_[feature]_functions.sql     — Database functions and triggers
```

## Component Standards

### Server Components (Default)

```typescript
// app/dashboard/invoices/page.tsx
// Server Component — no 'use client' directive
import { createServerClient } from '@/lib/supabase/server';
import { InvoiceTable } from '@/components/invoices/InvoiceTable';

export default async function InvoicesPage() {
  const supabase = await createServerClient();
  const { data: invoices } = await supabase
    .from('invoices')
    .select('*, clients(name)')
    .order('created_at', { ascending: false });

  return <InvoiceTable invoices={invoices ?? []} />;
}
```

### Client Components (When Needed)

```typescript
// components/invoices/InvoiceTable.tsx
'use client';

import { useState } from 'react';

interface Props {
  invoices: Invoice[];
}

export function InvoiceTable({ invoices }: Props) {
  const [sortField, setSortField] = useState<string>('created_at');
  // Interactive logic...
}
```

### When to Use Client Components

- User interaction (clicks, form input, hover states)
- Browser APIs (localStorage, clipboard, geolocation)
- React state or effects
- Third-party client libraries (charts, maps, editors)

**Default to Server Components.** Only add `'use client'` when the component genuinely needs browser interactivity.

## Environment Variables

### Naming Convention

```env
# Service credentials: [SERVICE]_[CREDENTIAL_TYPE]
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...

RESEND_API_KEY=re_...

# App config: APP_[SETTING]
APP_URL=https://yourapp.com
APP_NAME=YourApp

# Feature flags: FEATURE_[FLAG_NAME]
FEATURE_AI_ASSISTANT=true
```

### Rules

- `NEXT_PUBLIC_` prefix only for values safe to expose to the browser
- Never commit `.env.local` — commit `.env.example` with placeholder values
- All secrets must be in environment variables, never in code
- Document every env var in `.env.example` with comments

## Git Conventions

### Branch Naming

```
main              — Production
develop           — Integration branch
feature/[name]    — feature/invoice-pdf-generation
fix/[name]        — fix/timezone-calculation
hotfix/[name]     — hotfix/stripe-webhook-verify
```

### Commit Messages

```
feat: add invoice PDF generation
fix: correct timezone in deadline calculation
refactor: extract billing logic to service class
docs: update API documentation for v2 endpoints
chore: upgrade stripe SDK to v14
test: add integration tests for webhook handler
```

## Performance Defaults

- Images: Use `next/image` with appropriate `sizes` prop
- Fonts: Use `next/font` for self-hosted fonts
- Imports: Dynamic import (`next/dynamic`) for heavy client components
- Data: Fetch in Server Components, not in `useEffect`
- Lists: Paginate at 25 items default, 100 max
- Queries: Always include `.select()` with specific columns when possible
- Caching: Use Next.js `unstable_cache` or React `cache` for repeated server queries

## Accessibility Defaults

- All interactive elements must be keyboard accessible
- All images must have `alt` text
- Form inputs must have associated `<label>` elements
- Color contrast must meet WCAG AA (4.5:1 for text)
- Focus states must be visible
- Use semantic HTML (`<nav>`, `<main>`, `<section>`, `<article>`)
- ARIA attributes only when semantic HTML is insufficient

## Security Defaults

- All user input must be validated server-side (never trust the client)
- All database queries must use parameterized queries (Supabase client handles this)
- All API routes must verify authentication
- All file uploads must validate file type and size
- CORS: Restrict to known origins in production
- CSP: Configure Content-Security-Policy headers
- Rate limiting on authentication endpoints (minimum)
- HTTPS only in production (enforced via Vercel)
