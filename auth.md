---
name: Auth Specialist
tier: core
triggers: auth, authentication, login, signup, sign up, register, password, OAuth, Google login, GitHub login, social auth, RBAC, role, permission, multi-tenant, organization, session, token, MFA, 2FA, magic link, invite, logout, reset password
depends_on: database.md, security.md
conflicts_with: null
prerequisites: null
description: Authentication flows, OAuth providers, RBAC, multi-tenant organizations, session management, and invite systems
code_templates: null
design_tokens: null
---

# Auth Specialist

## Role

Implements all authentication and authorization — from basic email/password to OAuth, role-based access control, multi-tenant organizations, invite flows, and session management. Uses Supabase Auth by default. Ensures auth is secure, complete, and handles every edge case (expired tokens, duplicate emails, unverified accounts).

## When to Use

- Setting up authentication for a new project
- Adding OAuth providers (Google, GitHub, etc.)
- Implementing role-based access control (RBAC)
- Building multi-tenant organization support
- Creating invite and team member flows
- Adding MFA / 2FA
- Fixing auth-related bugs or security issues
- Implementing protected routes and middleware
- Building password reset or magic link flows
- Reviewing auth architecture for vulnerabilities

## Also Consider

- **Security Engineer** — for auth flow security audit and rate limiting
- **Database Engineer** — for user/role/org schema and RLS policies
- **Backend Engineer** — for protected server actions and API routes
- **Frontend Engineer** — for login/signup UI and auth state management
- **UX Engineer** — for onboarding flow and auth error messaging

## Anti-Patterns (NEVER Do)

1. ❌ Auth tokens in localStorage or sessionStorage — httpOnly cookies only
2. ❌ Client-only auth checks — always verify server-side
3. ❌ Hardcoded role strings scattered through code — use a roles table + constants
4. ❌ Missing email verification — always verify before granting full access
5. ❌ No rate limiting on login/signup — brute force protection is mandatory
6. ❌ Exposing user IDs in URLs without permission checks
7. ❌ Service role key in client code — server-side only
8. ❌ Skipping CSRF protection on auth forms
9. ❌ Same error message for "user not found" and "wrong password" — use generic "Invalid credentials"
10. ❌ Allowing password reset without email verification

## Standards & Patterns

### Supabase Auth Setup
```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    },
  );
}
```

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

### Auth Middleware
```typescript
// middleware.ts
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const publicRoutes = ['/', '/login', '/signup', '/reset-password', '/auth/callback'];

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

  const isPublicRoute = publicRoutes.some(route =>
    req.nextUrl.pathname === route || req.nextUrl.pathname.startsWith('/auth/')
  );

  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (user && (req.nextUrl.pathname === '/login' || req.nextUrl.pathname === '/signup')) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
```

### OAuth Callback Handler
```typescript
// app/auth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, req.url));
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth', req.url));
}
```

### RBAC Schema
```sql
-- Role definitions
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'member', 'viewer');

-- Organization members with roles
CREATE TABLE public.org_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ DEFAULT NULL,

  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'member',

  UNIQUE(org_id, user_id)
);

-- Helper function for RLS
CREATE OR REPLACE FUNCTION public.user_has_role(
  p_org_id UUID,
  p_min_role app_role
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = p_org_id
    AND user_id = auth.uid()
    AND deleted_at IS NULL
    AND role <= p_min_role  -- enum ordering: owner < admin < member < viewer
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Role Hierarchy
```
owner  → can do everything, transfer ownership, delete org
admin  → can manage members, settings, all content
member → can create and edit own content, view team content
viewer → read-only access
```

### Server-Side Auth Check Pattern
```typescript
// Use in every server action and API route
export async function protectedAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  // For role-based checks:
  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single();

  if (!member || !['owner', 'admin'].includes(member.role)) {
    return { success: false, error: 'Insufficient permissions' };
  }

  // ... proceed with action
}
```

### Invite Flow
1. Admin creates invite → store in `invites` table (email, org_id, role, token, expires_at)
2. Send invite email via Resend with unique link
3. User clicks link → if account exists, add to org. If not, signup flow with org pre-attached.
4. Invite marked as `accepted_at` after use
5. Expired invites cleaned up by cron or on-access check

### Password Requirements
- Minimum 8 characters
- Validated client-side for UX, enforced server-side for security
- No maximum length (let password managers do their thing)
- Check against common password lists (Supabase handles this)
- Rate limit failed attempts: 5 attempts per 15 minutes

## Code Templates

No pre-built templates in Stage 2. Auth-specific templates (Supabase auth setup, Clerk integration) may come in later stages.

## Checklist

Before declaring auth work complete:
- [ ] Auth tokens stored in httpOnly cookies (not localStorage)
- [ ] Middleware protects all authenticated routes
- [ ] Server-side auth check in every protected action/route
- [ ] OAuth callback handler works correctly
- [ ] Email verification required before full access
- [ ] Password reset flow works end-to-end
- [ ] Rate limiting on login, signup, and password reset
- [ ] Generic error messages (no "user not found" vs "wrong password" distinction)
- [ ] Logout clears session completely
- [ ] RBAC roles enforced at database level (RLS) and application level
- [ ] Invite flow works for new and existing users

## Common Pitfalls

1. **Client-side role checks only** — a determined user can bypass any client check. Always enforce roles server-side with RLS and action-level checks.
2. **Token refresh gaps** — Supabase handles refresh automatically, but make sure your middleware creates a fresh client per request to avoid stale sessions.
3. **OAuth redirect loops** — if the callback URL is wrong, users bounce between login and callback forever. Double-check Supabase dashboard config.
4. **Missing onboarding after signup** — the user signs up, verifies email, and then... what? Always have a clear post-signup flow.
5. **Invite link security** — invites should expire (24-48 hours), be single-use, and include the org context. Never reuse tokens.
