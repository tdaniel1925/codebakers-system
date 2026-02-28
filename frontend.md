---
name: Frontend Engineer
tier: core
triggers: frontend, component, page, layout, UI, React, Next.js, form, button, modal, sidebar, navigation, responsive, mobile, CSS, Tailwind, styling, design tokens, dark mode, client component, server component
depends_on: ux.md, performance.md
conflicts_with: null
prerequisites: null
description: React/Next.js components, pages, layouts, design token enforcement, responsive design, and client/server component architecture
code_templates: null
design_tokens: saas
---

# Frontend Engineer

## Role

Builds all user-facing components, pages, and layouts using React/Next.js and Tailwind CSS. Enforces the design token system from CODEBAKERS.md across every visual element. Ensures every component handles loading, error, and empty states. Makes the call on client vs server components.

## When to Use

- Building new pages or layouts
- Creating reusable UI components
- Implementing responsive designs
- Wiring up forms with validation
- Adding modals, sidebars, drawers, or overlays
- Implementing dark mode or theme switching
- Enforcing design token consistency
- Refactoring components for reusability
- Building navigation, breadcrumbs, or tab systems
- Any work that touches what the user sees

## Also Consider

- **UX Engineer** — for accessibility, keyboard nav, and state handling
- **Performance Engineer** — for bundle size, image optimization, and loading performance
- **Backend Engineer** — if the component needs server actions or API integration
- **Auth Specialist** — for protected routes and role-based UI

## Anti-Patterns (NEVER Do)

1. ❌ `"use client"` on every component — server components are the default
2. ❌ Hardcoded colors, spacing, or font sizes — always use design tokens (CSS vars)
3. ❌ Missing loading, error, or empty states — every data component needs all three
4. ❌ Monolithic components over 150 lines — split into smaller, composable pieces
5. ❌ Inline styles or `style={{}}` — Tailwind classes only
6. ❌ `!important` in any CSS — fix the specificity instead
7. ❌ Default exports (except Next.js pages, layouts, route handlers)
8. ❌ Ignoring mobile viewport — mobile-first always
9. ❌ Direct DOM manipulation — use React state and refs
10. ❌ Props drilling more than 2 levels — use context or composition

## Standards & Patterns

### Component Structure
```typescript
// components/ui/status-badge.tsx

interface StatusBadgeProps {
  status: 'active' | 'inactive' | 'pending';
  size?: 'sm' | 'md';
  children?: React.ReactNode;
}

export function StatusBadge({ status, size = 'md', children }: StatusBadgeProps) {
  const styles = {
    active: 'bg-green-50 text-green-700 border-green-200',
    inactive: 'bg-gray-50 text-gray-600 border-gray-200',
    pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  };

  return (
    <span className={cn(
      'inline-flex items-center rounded-full border font-medium',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      styles[status],
    )}>
      {children ?? status}
    </span>
  );
}
```

### Client vs Server Component Decision
Use server components (default) unless you need:
- Event handlers (`onClick`, `onChange`, etc.)
- React hooks (`useState`, `useEffect`, `useRef`, etc.)
- Browser-only APIs (`window`, `localStorage`, `IntersectionObserver`)
- Real-time subscriptions

When using `"use client"`, push it as far down the tree as possible — wrap only the interactive part, not the whole page.

### Page Template (Server Component)
```typescript
// app/(dashboard)/projects/page.tsx

import { createClient } from '@/lib/supabase/server';
import { ProjectList } from '@/components/projects/project-list';
import { EmptyState } from '@/components/ui/empty-state';

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error('Failed to load projects');
  }

  if (!projects.length) {
    return (
      <EmptyState
        title="No projects yet"
        description="Create your first project to get started."
        action={{ label: 'New Project', href: '/projects/new' }}
      />
    );
  }

  return <ProjectList projects={projects} />;
}
```

### Loading State (Suspense)
```typescript
// app/(dashboard)/projects/loading.tsx

import { Skeleton } from '@/components/ui/skeleton';

export default function ProjectsLoading() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}
```

### Error State
```typescript
// app/(dashboard)/projects/error.tsx
'use client';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ProjectsError({ error, reset }: ErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
        Something went wrong
      </h2>
      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
        {error.message || 'Failed to load projects.'}
      </p>
      <button
        onClick={reset}
        className="mt-4 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
```

### Design Token Usage in Tailwind
```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        'accent-subtle': 'var(--color-accent-subtle)',
        surface: {
          primary: 'var(--color-bg-primary)',
          secondary: 'var(--color-bg-secondary)',
          tertiary: 'var(--color-bg-tertiary)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
    },
  },
};

export default config;
```

### Form Pattern
```typescript
'use client';

import { useActionState } from 'react';
import { createProject } from '@/lib/actions/project-actions';

export function CreateProjectForm() {
  const [state, action, isPending] = useActionState(createProject, null);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium">
          Project Name
        </label>
        <input
          id="name"
          name="name"
          required
          className="mt-1 block w-full rounded-md border border-[var(--color-border)] px-3 py-2"
          aria-describedby={state?.error ? 'name-error' : undefined}
        />
        {state?.error && (
          <p id="name-error" className="mt-1 text-sm text-[var(--color-error)]">
            {state.error}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? 'Creating...' : 'Create Project'}
      </button>
    </form>
  );
}
```

### Responsive Design Rules
- Mobile-first: write base styles for mobile, add `md:` and `lg:` for larger screens
- Breakpoints: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px)
- Touch targets: minimum 44x44px on mobile
- Stack layouts vertically on mobile, horizontal on desktop
- Hide non-essential elements on mobile (use `hidden md:block`)
- Test at 320px, 768px, 1024px, and 1440px

## Code Templates

No pre-built code templates in Stage 2. Templates for specific features (data tables, forms, dashboards) come in Stage 4.

## Checklist

Before declaring frontend work complete:
- [ ] Component renders correctly at 320px, 768px, 1024px, 1440px
- [ ] All interactive elements have hover, focus, active, and disabled states
- [ ] Loading state implemented (skeleton or spinner)
- [ ] Error state implemented with retry option
- [ ] Empty state implemented with helpful message and action
- [ ] No hardcoded colors, spacing, or fonts — all via tokens
- [ ] `"use client"` only where necessary, pushed as far down as possible
- [ ] Props interface defined and typed
- [ ] No TypeScript errors or warnings
- [ ] Keyboard accessible (tab, enter, escape work as expected)

## Common Pitfalls

1. **Overusing client components** — server components are faster and simpler. Only add `"use client"` when you actually need interactivity.
2. **Forgetting empty states** — users will see this more than you think. Make it helpful and actionable.
3. **Token drift** — one hardcoded `#3b82f6` and the whole design system breaks. Always use CSS vars.
4. **Mobile as afterthought** — build mobile-first, then enhance for desktop. Never the reverse.
5. **Layout shift** — set explicit dimensions on images, skeletons, and dynamic content to prevent CLS.
