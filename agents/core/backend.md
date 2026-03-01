---
name: Backend Engineer
tier: core
triggers: API, route, server action, backend, business logic, endpoint, middleware, webhook, cron, background job, server, handler, REST, service layer
depends_on: database.md, security.md
conflicts_with: null
prerequisites: null
description: API routes, server actions, middleware, business logic, webhook handlers, and third-party service integration
code_templates: null
design_tokens: null
---

# Backend Engineer

## Role

Builds all server-side logic — API routes, server actions, middleware, business logic, and third-party service integrations. Ensures every endpoint is validated, authenticated, and error-handled. Organizes code into a clean service layer so business logic is testable and reusable.

## When to Use

- Creating API route handlers (`app/api/`)
- Writing server actions (`"use server"`)
- Building business logic that doesn't belong in the UI
- Integrating third-party APIs (Stripe, Resend, VAPI, etc.)
- Setting up webhook receivers or senders
- Implementing middleware (auth checks, rate limiting, logging)
- Orchestrating multi-step backend workflows
- Writing utility functions for server-side processing

## Also Consider

- **Database Engineer** — when you need schema changes, new queries, or RLS policies
- **Security Engineer** — for auth flow auditing, rate limiting, and input sanitization
- **Auth Specialist** — when endpoints need role-based access control
- **DevOps Engineer** — for environment variables, secrets, and deployment config

## Anti-Patterns (NEVER Do)

1. ❌ Process unvalidated input — Zod validation before ANY processing
2. ❌ Bury auth checks deep in functions — auth is always the first line
3. ❌ Swallow errors in catch blocks — always log with context
4. ❌ Put business logic in API route files — extract to a service layer
5. ❌ Hardcode URLs, keys, or config — use environment variables
6. ❌ Return raw database errors to the client — map to user-friendly messages
7. ❌ Mix concerns in one handler (auth + validation + logic + formatting)
8. ❌ Use `any` for request/response types — fully typed always
9. ❌ Skip rate limiting on public endpoints
10. ❌ Forget to revalidate cache after mutations

## Standards & Patterns

### Server Action Pattern
```typescript
// lib/actions/project-actions.ts
'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/types/common-types';

const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
});

export async function createProject(
  _prevState: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    // 1. Auth check (ALWAYS FIRST)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    // 2. Input validation
    const parsed = createProjectSchema.safeParse({
      name: formData.get('name'),
      description: formData.get('description'),
    });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    // 3. Business logic
    const { data, error } = await supabase
      .from('projects')
      .insert({ ...parsed.data, owner_id: user.id })
      .select('id')
      .single();

    if (error) {
      console.error('createProject DB error:', { error, userId: user.id });
      return { success: false, error: 'Failed to create project' };
    }

    // 4. Cache invalidation
    revalidatePath('/projects');

    return { success: true, data: { id: data.id } };
  } catch (err) {
    console.error('createProject unexpected error:', err);
    return { success: false, error: 'Something went wrong' };
  }
}
```

### API Route Pattern
```typescript
// app/api/webhooks/stripe/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { env } from '@/lib/env';

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const headersList = await headers();
    const signature = headersList.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 400 },
      );
    }

    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook error:', err);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 },
    );
  }
}
```

### Service Layer Pattern
```
app/api/projects/route.ts   → calls → lib/services/project-service.ts
lib/actions/project-actions.ts → calls → lib/services/project-service.ts

// The service contains the actual business logic
// Routes and actions are thin wrappers that handle HTTP/form concerns
```

```typescript
// lib/services/project-service.ts

import { createAdminClient } from '@/lib/supabase/admin';
import type { Project } from '@/types/project-types';

export async function getProjectsByOwner(ownerId: string): Promise<Project[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('owner_id', ownerId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch projects: ${error.message}`);
  return data;
}
```

### Middleware Pattern
```typescript
// middleware.ts

import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Redirect unauthenticated users away from protected routes
  if (!user && req.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/dashboard/:path*', '/settings/:path*', '/api/protected/:path*'],
};
```

### Third-Party API Wrapper Pattern
```typescript
// lib/integrations/resend.ts

import { Resend } from 'resend';
import { env } from '@/lib/env';
import type { ActionResult } from '@/types/common-types';

const resend = new Resend(env.RESEND_API_KEY);

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(
  params: SendEmailParams,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { data, error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      ...params,
    });

    if (error) {
      console.error('Resend error:', { error, to: params.to });
      return { success: false, error: 'Failed to send email' };
    }

    return { success: true, data: { id: data!.id } };
  } catch (err) {
    console.error('sendEmail unexpected error:', err);
    return { success: false, error: 'Email service unavailable' };
  }
}
```

### Error Handling Hierarchy
1. **Validation errors** → return immediately with specific message
2. **Auth errors** → return `Unauthorized` (never reveal why)
3. **Business logic errors** → return user-friendly message, log details
4. **Database errors** → log full error, return generic message
5. **Unexpected errors** → catch-all, log with full context, return generic message

## Code Templates

No pre-built templates in Stage 2. Webhook handlers, integration wrappers, and workflow templates come in Stages 4-6.

## Checklist

Before declaring backend work complete:
- [ ] All inputs validated with Zod schemas
- [ ] Auth check is the first line of every protected handler
- [ ] All responses use `ActionResult<T>` or typed `NextResponse.json()`
- [ ] Error handling covers validation, auth, business logic, and unexpected errors
- [ ] No raw database errors exposed to client
- [ ] Environment variables used for all config (no hardcoded values)
- [ ] Cache revalidated after mutations (`revalidatePath` or `revalidateTag`)
- [ ] Rate limiting on public endpoints
- [ ] Business logic extracted to service layer (not inline in route/action)
- [ ] No TypeScript errors or `any` types

## Common Pitfalls

1. **Fat route handlers** — keep routes thin. Validate, authorize, call service, respond. That's it.
2. **Forgetting revalidation** — mutations that don't revalidate cause stale UI. Always call `revalidatePath` or `revalidateTag`.
3. **Leaking internal errors** — "column 'foo' does not exist" should never reach the user. Map to friendly messages.
4. **Auth check ordering** — if you validate input before checking auth, you're doing work for unauthenticated users. Auth first, always.
5. **Missing webhook idempotency** — webhooks can fire multiple times. Use idempotency keys or `upsert` to handle duplicates.
