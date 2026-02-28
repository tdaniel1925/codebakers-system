# CodeBakers — Code Standards & Design System

> Loaded with every agent, every time. These standards are non-negotiable.

---

## Stack Defaults

| Layer | Default | Alternatives (if client requires) |
|---|---|---|
| Framework | Next.js 14+ (App Router) | Remix, Astro |
| Language | TypeScript (strict) | — |
| Database | Supabase (Postgres) | PlanetScale, Neon |
| Auth | Supabase Auth | Clerk, NextAuth |
| Styling | Tailwind CSS + CSS custom properties | — |
| Hosting | Vercel | Netlify, Railway |
| Email | Resend | SendGrid |
| Payments | Stripe | — |
| Voice AI | VAPI | — |
| Package Manager | pnpm | — |
| Testing | Vitest + Playwright | — |
| Linting | ESLint + Prettier | — |

---

## TypeScript

- `strict: true` in every `tsconfig.json` — no exceptions
- **Never use `any`** — use `unknown` + type guards or generic constraints
- Zod for ALL runtime validation: API inputs, form data, env vars, webhook payloads
- Prefer `interface` for object shapes, `type` for unions/intersections/computed types
- Named exports only — no default exports except Next.js pages/layouts/route handlers
- Exhaustive switch statements with `never` check for discriminated unions

### API Response Pattern
```typescript
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };
```

### Environment Variables
```typescript
// Always validate with Zod at startup
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);
```

---

## File & Naming Conventions

| Type | Pattern | Example |
|---|---|---|
| Files & folders | `kebab-case` | `user-settings.tsx` |
| Components | `PascalCase` export | `export function UserSettings()` |
| Hooks | `use-[name].ts` | `use-auth.ts` |
| Utils | `[domain]-utils.ts` | `billing-utils.ts` |
| Types | `[domain]-types.ts` | `billing-types.ts` |
| Server actions | `[domain]-actions.ts` | `billing-actions.ts` |
| API routes | `app/api/[domain]/route.ts` | `app/api/billing/route.ts` |
| Tests | `[name].test.ts(x)` co-located | `user-card.test.tsx` |
| Constants | `[domain]-constants.ts` | `billing-constants.ts` |

### Directory Structure (App Router)
```
src/
├── app/
│   ├── (auth)/           # Route group: login, signup, reset
│   ├── (dashboard)/      # Route group: authenticated pages
│   ├── api/              # API routes
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/               # Primitives (button, input, card)
│   └── [feature]/        # Feature-specific components
├── lib/
│   ├── supabase/         # Client + server + middleware
│   ├── stripe/           # Stripe helpers
│   └── utils.ts          # Shared utilities
├── hooks/                # Custom hooks
├── types/                # Shared type definitions
└── styles/
    └── tokens.css        # Design token definitions
```

---

## Component Rules

1. **Functional components only** — no class components, ever
2. Props interface named `[Component]Props` — defined directly above the component
3. Destructure props in the function signature
4. Children typed as `React.ReactNode`
5. Extract reusable logic into custom hooks
6. **No inline styles** — Tailwind classes only, referencing design tokens via CSS vars
7. Every data-fetching component must handle three states: **loading, error, empty**
8. Use `Suspense` boundaries at the route segment level
9. Prefer composition over configuration — small components composed together
10. Client components (`"use client"`) only when necessary: event handlers, hooks, browser APIs

---

## Database Patterns (Supabase)

### Table Requirements
Every table MUST have:
```sql
id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
```

### Soft Delete
```sql
deleted_at TIMESTAMPTZ DEFAULT NULL
```
All queries filter `WHERE deleted_at IS NULL` by default. Use a view or helper for this.

### Row Level Security
- **RLS enabled on every table** — no exceptions
- Policies follow pattern: `[action]_[table]_[role]` (e.g., `select_invoices_owner`)
- Test RLS policies with both authorized and unauthorized users
- Service role key used **server-side only** — never exposed to client

### Foreign Keys
```sql
-- Always explicit ON DELETE behavior
user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
org_id UUID REFERENCES organizations(id) ON DELETE SET NULL
```

### Migrations
- Use Supabase CLI: `supabase db diff -f [migration-name]`
- One logical change per migration
- Always include both up and down paths
- Test migrations against production data shape before deploying

### Query Patterns
- Simple CRUD → Supabase client `.select()`, `.insert()`, `.update()`, `.delete()`
- Complex queries → `supabase.rpc('function_name', params)`
- Joins → prefer database views or RPC over multiple client calls
- Pagination → cursor-based for infinite scroll, offset for page numbers

---

## API & Server Action Patterns

```typescript
// Server Action Template
'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/types/common-types';

const inputSchema = z.object({
  name: z.string().min(1).max(100),
});

export async function createItem(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const parsed = inputSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { success: false, error: 'Invalid input' };

    const { data, error } = await supabase
      .from('items')
      .insert({ ...parsed.data, user_id: user.id })
      .select('id')
      .single();

    if (error) return { success: false, error: error.message };

    revalidatePath('/items');
    return { success: true, data: { id: data.id } };
  } catch (err) {
    console.error('createItem failed:', err);
    return { success: false, error: 'Something went wrong' };
  }
}
```

---

## Error Handling

| Context | Strategy |
|---|---|
| Expected failures (validation, auth) | Return `ActionResult` with error message |
| Unexpected failures (network, DB) | Catch, log with context, return generic message |
| Client components | Error boundaries at route segment level |
| API routes | Try/catch with typed `NextResponse.json()` |
| Third-party APIs | Wrap in helper with retry + timeout + typed errors |

**Never** swallow errors silently. Every catch block must log or report.

---

## Security Baseline

- Environment variables in `.env.local` — **never committed** (add to `.gitignore`)
- All secrets stored in Vercel env vars for production
- CSRF protection on all mutation endpoints
- **Never** use `dangerouslySetInnerHTML` without DOMPurify sanitization
- SQL injection: Supabase parameterizes by default — never concatenate SQL strings
- Auth tokens: httpOnly secure cookies only — **never localStorage**
- Content Security Policy headers configured in `next.config.js`
- Rate limiting on: auth endpoints, public APIs, webhook receivers
- CORS: restrictive origin list, never `*` in production
- Dependency audit: `pnpm audit` in CI pipeline

---

## Design Token System

### Philosophy
- **Neutral-first:** 90% of the UI is grayscale. Color is used intentionally for actions and status.
- **One accent color:** picked per project/industry. Everything else derives from it.
- **Semantic naming:** tokens describe purpose, not value (`--color-primary`, not `--color-blue`)
- **Reference sites:** Linear, Stripe, Vercel, Notion — clean, quiet, professional.

### Base Tokens (`:root`)
```css
:root {
  /* Surface & Background */
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f9fafb;
  --color-bg-tertiary: #f3f4f6;
  --color-bg-inverse: #111827;

  /* Text */
  --color-text-primary: #111827;
  --color-text-secondary: #6b7280;
  --color-text-tertiary: #9ca3af;
  --color-text-inverse: #ffffff;

  /* Accent (override per project) */
  --color-accent: #2563eb;
  --color-accent-hover: #1d4ed8;
  --color-accent-subtle: #eff6ff;

  /* Status */
  --color-success: #059669;
  --color-warning: #d97706;
  --color-error: #dc2626;
  --color-info: #2563eb;

  /* Border */
  --color-border: #e5e7eb;
  --color-border-hover: #d1d5db;

  /* Spacing (8px grid) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
  --space-24: 96px;

  /* Typography */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  --text-xs: 0.75rem;    /* 12px */
  --text-sm: 0.875rem;   /* 14px */
  --text-base: 1rem;     /* 16px */
  --text-lg: 1.125rem;   /* 18px */
  --text-xl: 1.25rem;    /* 20px */
  --text-2xl: 1.5rem;    /* 24px */
  --text-3xl: 1.875rem;  /* 30px */
  --text-4xl: 2.25rem;   /* 36px */
  --text-5xl: 3rem;      /* 48px */
  --text-6xl: 3.75rem;   /* 60px */

  /* Line Heights */
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;

  /* Font Weights */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;

  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-full: 9999px;

  /* Shadows (subtle) */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.07), 0 4px 6px -4px rgb(0 0 0 / 0.05);

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-base: 200ms ease;
  --transition-slow: 300ms ease;

  /* Z-Index Scale */
  --z-dropdown: 10;
  --z-sticky: 20;
  --z-overlay: 30;
  --z-modal: 40;
  --z-toast: 50;
}
```

### Token Usage Rules
1. **Never hardcode** colors, spacing, radii, or shadows — always use tokens
2. In Tailwind, reference via `theme.extend` in `tailwind.config.ts` pointing to CSS vars
3. Industry presets override token values — component code never changes
4. Dark mode = override `--color-bg-*` and `--color-text-*` tokens
5. One accent color per project — set in `project-profile.md`, applied in `tokens.css`

---

## Git Standards

### Commits
```
feat(scope): add new feature
fix(scope): resolve bug description
refactor(scope): restructure without behavior change
chore(scope): tooling, deps, configs
docs(scope): documentation only
test(scope): add or update tests
perf(scope): performance improvement
```

### Branches
- `main` — production, always deployable
- `develop` — integration branch (if using gitflow)
- `feat/[slug]` — feature branches
- `fix/[slug]` — bugfix branches
- `pre-agent/[timestamp]` — safety snapshot before agent work

### Rules
- Never force push to `main`
- Squash merge feature branches
- Delete branches after merge
- Write descriptive PR titles (same format as commits)

---

## Performance Baseline

| Metric | Target |
|---|---|
| Lighthouse Performance | > 90 |
| Lighthouse Accessibility | > 90 |
| Lighthouse Best Practices | > 90 |
| Lighthouse SEO | > 90 |
| CLS | < 0.1 |
| FCP | < 1.8s |
| LCP | < 2.5s |
| TTI | < 3.8s |

### Enforcement
- `next/image` for all images — proper `width`, `height`, `sizes`, WebP/AVIF
- `next/font` for fonts — `display: swap`, no layout shift
- Dynamic imports for heavy components: `const Chart = dynamic(() => import('./chart'), { ssr: false })`
- Bundle analysis: `@next/bundle-analyzer` configured and checked before major releases
- No synchronous scripts in `<head>`
- Preconnect to external domains (`<link rel="preconnect">`)

---

## Accessibility Baseline (WCAG AA)

- All interactive elements keyboard-accessible
- Focus indicators visible (never `outline: none` without replacement)
- Color contrast ratio ≥ 4.5:1 for text, ≥ 3:1 for large text
- All images have descriptive `alt` text
- Form inputs have associated `<label>` elements
- Error messages linked to inputs via `aria-describedby`
- Skip navigation link as first focusable element
- Heading hierarchy: one `h1` per page, sequential levels
- ARIA attributes only when native HTML semantics are insufficient

---

## What NOT To Do (Universal Anti-Patterns)

1. ❌ `any` type anywhere
2. ❌ `console.log` in production code (use proper logging)
3. ❌ Secrets in client-side code
4. ❌ RLS disabled or missing policies
5. ❌ Default exports (except Next.js pages/layouts)
6. ❌ Inline styles
7. ❌ Hardcoded colors, spacing, or font sizes
8. ❌ Ignoring loading/error/empty states
9. ❌ Force pushing to main
10. ❌ Committing `.env` files
11. ❌ Using `localStorage` for auth tokens
12. ❌ Skipping input validation
13. ❌ Catching errors without logging them
14. ❌ Using `!important` in CSS
15. ❌ Nested ternaries (extract to variables or early returns)
