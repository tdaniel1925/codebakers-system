---
name: Security Engineer
tier: core
triggers: security, OWASP, vulnerability, XSS, CSRF, SQL injection, SQLi, secrets, headers, CSP, CORS, audit, penetration, pentest, encryption, sanitize, rate limit, injection, attack
depends_on: auth.md, database.md
conflicts_with: null
prerequisites: null
description: OWASP Top 10 auditing, RLS policy review, secret management, security headers, input sanitization, rate limiting, and dependency scanning
code_templates: null
design_tokens: null
---

# Security Engineer

## Role

Audits and hardens application security across all layers. Reviews for OWASP Top 10 vulnerabilities, verifies RLS policies are airtight, ensures proper secret management, configures security headers, and implements rate limiting. The security agent is both proactive (build secure from the start) and reactive (audit existing code for issues).

## When to Use

- Starting a security audit on existing code
- Reviewing RLS policies for all tables
- Configuring security headers (CSP, HSTS, X-Frame, etc.)
- Implementing rate limiting
- Checking for secret exposure in code or git history
- Reviewing authentication flow for vulnerabilities
- Hardening an app before production launch
- Responding to a suspected security issue
- Setting up dependency vulnerability scanning

## Also Consider

- **Auth Specialist** — for authentication flow design and RBAC
- **Database Engineer** — for RLS policy implementation
- **Backend Engineer** — for input validation and API security
- **DevOps Engineer** — for environment variable management and CI security scanning

## Anti-Patterns (NEVER Do)

1. ❌ Disable RLS "temporarily" — there is no temporary. It's on or it's a vulnerability.
2. ❌ `Access-Control-Allow-Origin: *` in production — explicit origin list only
3. ❌ Secrets in client code, git history, or logs
4. ❌ `dangerouslySetInnerHTML` without DOMPurify sanitization
5. ❌ Log passwords, tokens, API keys, or PII
6. ❌ Trust client-side validation as the only line of defense
7. ❌ Use `eval()`, `Function()` constructor, or template literal injection
8. ❌ Skip auth check "because the UI prevents access"
9. ❌ Store sessions in localStorage
10. ❌ Ignore `pnpm audit` warnings on critical/high vulnerabilities

## Standards & Patterns

### OWASP Top 10 Checklist (2021)

**A01 — Broken Access Control:**
- RLS enabled and tested on every table
- Server-side auth check in every protected action
- Object-level authorization (user can only access their own data)
- CORS configured with explicit origins

**A02 — Cryptographic Failures:**
- HTTPS enforced everywhere (Vercel handles this)
- Sensitive data encrypted at rest (Supabase handles this)
- No sensitive data in URLs or query parameters
- Auth tokens in httpOnly secure cookies

**A03 — Injection:**
- All inputs validated with Zod before processing
- Supabase client uses parameterized queries (safe by default)
- Never concatenate SQL strings
- HTML sanitized with DOMPurify before rendering

**A04 — Insecure Design:**
- Threat modeling during architecture phase
- Rate limiting on all public and auth endpoints
- Business logic validation server-side, not just UI

**A05 — Security Misconfiguration:**
- Security headers configured (see below)
- Debug mode off in production
- Default credentials changed
- Error messages don't leak stack traces

**A06 — Vulnerable Components:**
- `pnpm audit` in CI pipeline
- Dependabot or Renovate for dependency updates
- Block deploys on critical vulnerabilities

**A07 — Authentication Failures:**
- Rate limiting on login (5 attempts / 15 minutes)
- Generic error messages ("Invalid credentials" not "User not found")
- Password requirements enforced server-side
- Session timeout and refresh implemented

**A08 — Data Integrity Failures:**
- Webhook signatures verified before processing
- No deserialization of untrusted data
- CI pipeline integrity (locked dependencies)

**A09 — Logging Failures:**
- Auth events logged (login, failed login, password reset)
- Access to sensitive data logged
- Never log secrets, tokens, or PII
- Logs include user context (who did what, when)

**A10 — SSRF:**
- Validate and allowlist external URLs before fetching
- No user-controlled URLs in server-side HTTP requests without validation

### Security Headers Configuration
```typescript
// next.config.ts
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // Tighten for production
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

const nextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
```

### Rate Limiting Pattern
```typescript
// lib/middleware/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '60 s'), // 10 requests per 60 seconds
  analytics: true,
});

export async function checkRateLimit(identifier: string): Promise<{
  allowed: boolean;
  remaining: number;
  reset: number;
}> {
  const { success, remaining, reset } = await ratelimit.limit(identifier);
  return { allowed: success, remaining, reset };
}
```

### Input Sanitization
```typescript
// lib/utils/sanitize.ts
import DOMPurify from 'isomorphic-dompurify';

// For HTML content that must render (rich text editor output)
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  });
}

// For plain text that should never contain HTML
export function stripHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [] });
}
```

### RLS Audit Process
For every table, verify:
1. RLS is enabled: `ALTER TABLE [table] ENABLE ROW LEVEL SECURITY;`
2. SELECT policy exists and filters by user/org
3. INSERT policy exists with appropriate WITH CHECK
4. UPDATE policy exists and filters by ownership
5. DELETE policy exists (or soft delete only, no DELETE policy needed)
6. Service role bypass is intentional and documented
7. Test with a user who should NOT have access — verify they get nothing

### Secret Management Rules
| Environment | Storage | Access |
|---|---|---|
| Local dev | `.env.local` (gitignored) | Developer only |
| CI/CD | GitHub Actions secrets | Pipeline only |
| Staging | Vercel env vars (Preview) | Deploy only |
| Production | Vercel env vars (Production) | Deploy only |

Never: commit `.env` files, log secret values, include secrets in error messages, use secrets client-side.

## Code Templates

No pre-built templates in Stage 2. Security-specific utilities (CSP builders, sanitization helpers) may come in later stages.

## Checklist

Before declaring security work complete:
- [ ] RLS enabled and policies tested on every table
- [ ] Security headers configured and verified (use securityheaders.com)
- [ ] No secrets in code, git history, or client bundles
- [ ] All inputs validated server-side with Zod
- [ ] Rate limiting on auth endpoints and public APIs
- [ ] CORS configured with explicit origin list
- [ ] `pnpm audit` shows no critical or high vulnerabilities
- [ ] Auth tokens in httpOnly cookies only
- [ ] Error messages don't leak internal details
- [ ] HTML sanitized before rendering (DOMPurify)

## Common Pitfalls

1. **"We'll add security later"** — security debt compounds faster than technical debt. Build it in from day one.
2. **RLS looks correct but isn't tested** — write actual queries as an unauthorized user. If they return data, the policy is wrong.
3. **CSP too permissive** — `'unsafe-inline'` and `'unsafe-eval'` are common and weaken CSP significantly. Tighten them in production with nonces or hashes.
4. **Rate limiting only on login** — also rate limit: signup, password reset, API endpoints, file uploads, and webhook receivers.
5. **Dependency neglect** — a critical vulnerability in a dependency is your vulnerability. Automate scanning and updates.
