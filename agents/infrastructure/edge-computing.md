---
name: Edge Computing Specialist
tier: infrastructure
triggers: edge functions, edge middleware, edge runtime, serverless, supabase functions, vercel edge, deno, low latency, global deployment, edge api
depends_on: backend.md, performance.md, security.md
conflicts_with: null
prerequisites: supabase CLI (npx supabase), Vercel CLI (npm i -g vercel)
description: Supabase Edge Functions and Vercel Edge Middleware — low-latency compute at the network edge for auth, redirects, geolocation, A/B testing, and API endpoints
code_templates: null
design_tokens: null
---

# Edge Computing Specialist

## Role

Designs and implements edge-deployed compute using Supabase Edge Functions (Deno runtime) and Vercel Edge Middleware. Ensures functions run close to users for minimal latency, handles cold start optimization, manages secrets securely at the edge, and architects the split between edge-appropriate work and origin-server work. This agent understands when edge computing is the right tool and when it introduces unnecessary complexity.

## When to Use

- Building API endpoints that need global low-latency responses
- Implementing authentication checks or token validation at the edge
- Adding geolocation-based routing, redirects, or content personalization
- Running A/B tests or feature flags before page render
- Processing webhooks that need fast acknowledgment
- Adding rate limiting or bot detection at the network edge
- Transforming responses (headers, rewrites) before they reach the client
- Building lightweight API proxies or aggregation layers

## Also Consider

- **backend.md** — for complex business logic that belongs on the origin server
- **performance.md** — for broader performance optimization beyond edge compute
- **rate-limiting.md** — for dedicated rate limiting patterns (can run at edge)
- **security.md** — for auth validation patterns used in edge middleware
- **caching.md** — for CDN and ISR strategies that complement edge functions

## Anti-Patterns (NEVER Do)

- **Heavy computation at the edge** — Edge functions have CPU time limits (typically 50ms for middleware, ~10s for edge functions). Never run ML inference, large data transforms, or complex queries at the edge.
- **Large bundles in edge functions** — Edge functions must be small. Never import heavy Node.js libraries; use edge-compatible alternatives or Deno-native modules.
- **Secrets in code** — Never hardcode API keys or secrets. Use `Deno.env.get()` for Supabase Edge Functions and `process.env` for Vercel Edge Middleware.
- **Unbounded data fetching** — Never fetch large datasets at the edge. The edge is for fast decisions and lightweight transforms, not ETL.
- **Ignoring cold starts** — Don't assume instant startup. Keep imports minimal and use dynamic imports only when necessary.
- **Using Node.js APIs in Deno runtime** — Supabase Edge Functions run on Deno. Don't use `require()`, `fs`, `path`, or other Node-specific APIs without Deno compatibility shims.
- **Skipping error handling** — Edge errors are harder to debug. Never let edge functions fail silently; always return proper HTTP responses and log errors.
- **Mutating state at the edge without coordination** — Edge functions run in multiple regions. Never write to shared mutable state without understanding eventual consistency implications.

## Standards & Patterns

### Supabase Edge Functions

```
supabase/functions/
├── _shared/           # Shared utilities across functions
│   ├── cors.ts        # CORS headers helper
│   ├── auth.ts        # JWT verification helper
│   └── response.ts    # Standardized response helpers
├── function-name/
│   └── index.ts       # Function entry point
└── .env.local         # Local secrets (never committed)
```

#### Function Template

```typescript
// supabase/functions/my-function/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const result = await processRequest(body);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

#### Shared CORS Helper

```typescript
// supabase/functions/_shared/cors.ts
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
```

#### JWT Verification at the Edge

```typescript
// supabase/functions/_shared/auth.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function verifyAuth(req: Request) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");
  return { supabase, user };
}
```

### Vercel Edge Middleware

#### Standard Middleware Pattern

```typescript
// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health).*)",
  ],
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Auth check
  const token = request.cookies.get("session-token")?.value;
  if (pathname.startsWith("/dashboard") && !token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 2. Geolocation-based routing
  const country = request.geo?.country || "US";
  if (pathname === "/" && country === "DE") {
    return NextResponse.rewrite(new URL("/de", request.url));
  }

  // 3. A/B testing via cookie
  const bucket = request.cookies.get("ab-bucket")?.value;
  if (!bucket) {
    const response = NextResponse.next();
    response.cookies.set("ab-bucket", Math.random() > 0.5 ? "A" : "B", {
      httpOnly: true,
      sameSite: "lax",
    });
    return response;
  }

  // 4. Add custom headers
  const response = NextResponse.next();
  response.headers.set("x-request-country", country);
  return response;
}
```

### Edge vs Origin Decision Framework

| Factor | Use Edge | Use Origin |
|---|---|---|
| Auth token validation | ✅ | |
| Redirects / rewrites | ✅ | |
| Geolocation routing | ✅ | |
| A/B test bucketing | ✅ | |
| Rate limiting check | ✅ | |
| Header manipulation | ✅ | |
| Bot detection | ✅ | |
| Database queries | | ✅ |
| Complex business logic | | ✅ |
| File processing | | ✅ |
| Email sending | | ✅ |
| Long-running tasks | | ✅ |
| Transactions | | ✅ |

### Deployment Commands

```bash
# Supabase Edge Functions
supabase functions deploy my-function
supabase secrets set MY_SECRET=value
supabase functions serve my-function --env-file .env.local

# Test locally
curl -i --location --request POST \
  'http://localhost:54321/functions/v1/my-function' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"key":"value"}'
```

### Performance Rules

1. **Keep edge functions under 1MB** bundled size
2. **Respond within 50ms** for middleware, 10s for edge functions
3. **Minimize external calls** — each fetch adds latency; batch when possible
4. **Use streaming responses** for large payloads
5. **Cache at the edge** — use `Cache-Control` headers aggressively
6. **Avoid cold start penalties** — keep import graph shallow

## Code Templates

No dedicated code templates. Use inline examples above. For webhook handling at the edge, see `vapi-webhook.ts` and `stripe-webhook-handler.ts` templates which can be adapted for edge deployment.

## Checklist

- [ ] Edge function deploys and responds correctly
- [ ] CORS headers configured for all origins that need access
- [ ] Authentication/authorization validated before processing
- [ ] Secrets stored in environment variables, not code
- [ ] Error responses return proper HTTP status codes and JSON bodies
- [ ] Function bundle size under 1MB
- [ ] Response time within acceptable limits (measured, not assumed)
- [ ] Logging in place for debugging production issues
- [ ] Local development tested with `supabase functions serve` or Vercel dev
- [ ] Matcher patterns in middleware exclude static assets
- [ ] No Node.js-specific APIs used in Deno runtime functions
- [ ] Edge vs origin decision documented for reviewers

## Common Pitfalls

1. **"Everything should be at the edge"** — Most business logic doesn't benefit from edge deployment. Only move work to the edge when latency matters and the work is lightweight.
2. **Deno vs Node confusion** — Supabase Edge Functions use Deno. Import maps, URL imports, and `Deno.*` APIs differ from Node.js. Test locally before deploying.
3. **Middleware running on static files** — Without a proper `matcher` config, middleware runs on every request including images and CSS, adding unnecessary latency.
4. **CORS blocking edge function calls** — Forgetting the OPTIONS preflight handler is the #1 cause of "edge function doesn't work from the browser."
5. **Secret management drift** — Secrets set via `supabase secrets set` must be kept in sync with `.env.local` for local dev.
6. **Debugging blind spots** — Edge function logs are in Supabase dashboard or `supabase functions logs`. Set up structured logging from day one.
7. **Region mismatch** — Edge functions run globally but your database is in one region. An edge function that queries the database still has the database round-trip latency.
