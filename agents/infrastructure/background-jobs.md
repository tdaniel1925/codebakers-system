---
name: Background Jobs Specialist
tier: infrastructure
triggers: background jobs, queues, cron, scheduled tasks, retry, dead letter, job queue, async processing, worker, task queue, pg_cron, inngest, trigger.dev
depends_on: backend.md, monitoring.md, database.md
conflicts_with: null
prerequisites: Supabase pg_cron extension or Inngest/Trigger.dev account
description: Job queues, cron scheduling, retry logic, dead letter queues, and monitoring for background processing — covers pg_cron, Inngest, Trigger.dev, and custom Postgres-based queues
code_templates: null
design_tokens: null
---

# Background Jobs Specialist

## Role

Designs and implements background processing systems including scheduled tasks, job queues with retry logic, dead letter handling, and monitoring. Ensures long-running or deferred work is processed reliably without blocking user requests. Covers the full spectrum from simple Postgres-based cron jobs to production queue systems using Inngest or Trigger.dev.

## When to Use

- Sending emails, notifications, or webhooks asynchronously
- Processing file uploads (resize, convert, scan) after upload completes
- Running scheduled reports, cleanups, or data syncs
- Implementing retry logic for unreliable external API calls
- Building multi-step workflows that must complete even if one step fails
- Handling billing cycle processing (invoice generation, subscription renewals)
- Syncing data between systems on a schedule
- Any operation that takes more than 2-3 seconds and shouldn't block the UI

## Also Consider

- **edge-computing.md** — for lightweight async work that can run at the edge
- **monitoring.md** — for alerting when jobs fail or queues back up
- **database-scaling.md** — for optimizing queries in batch-processing jobs
- **workflow-automation.md** — for complex multi-step business workflows built on top of job infrastructure

## Anti-Patterns (NEVER Do)

- **Processing long tasks in API routes** — Never make users wait for email sends, PDF generation, or external API calls. Enqueue and return immediately.
- **No retry logic** — Every job that calls an external service MUST have retry with exponential backoff. Network failures are guaranteed.
- **Infinite retries** — Always set a max retry count. After max retries, move to dead letter queue for manual review.
- **No idempotency** — Jobs may run more than once. Every job handler must be idempotent — running it twice with the same input must produce the same result.
- **Silent failures** — Never catch errors without logging or alerting. Failed jobs must be visible.
- **Polling loops in API routes** — Don't poll for job completion in a request. Use webhooks, realtime subscriptions, or let the client poll.
- **Storing job payloads as huge JSON blobs** — Keep job payloads small (IDs and references). Fetch full data inside the job handler.
- **Running cron jobs without distributed locking** — If you have multiple instances, cron jobs run on ALL of them. Use pg advisory locks or a leader election pattern.

## Standards & Patterns

### Pattern 1: Postgres-Based Job Queue (Simple)

Best for: Projects already on Supabase that need basic async processing without external services.

```sql
-- Create jobs table
CREATE TABLE job_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for picking up jobs
CREATE INDEX idx_job_queue_pending ON job_queue (scheduled_for)
  WHERE status = 'pending';

-- Pick up next job (atomic — safe for concurrent workers)
CREATE OR REPLACE FUNCTION pick_next_job(p_job_type TEXT DEFAULT NULL)
RETURNS SETOF job_queue AS $$
  UPDATE job_queue
  SET status = 'processing',
      started_at = NOW(),
      attempts = attempts + 1,
      updated_at = NOW()
  WHERE id = (
    SELECT id FROM job_queue
    WHERE status = 'pending'
      AND scheduled_for <= NOW()
      AND (p_job_type IS NULL OR job_type = p_job_type)
    ORDER BY scheduled_for ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING *;
$$ LANGUAGE sql;
```

#### Job Processing in Next.js API Route

```typescript
// app/api/jobs/process/route.ts
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: jobs } = await supabase.rpc("pick_next_job");

  if (!jobs?.length) {
    return Response.json({ message: "No jobs" });
  }

  const job = jobs[0];

  try {
    await processJob(job);

    await supabase
      .from("job_queue")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", job.id);

    return Response.json({ processed: job.id });
  } catch (error) {
    const isDead = job.attempts >= job.max_attempts;
    await supabase
      .from("job_queue")
      .update({
        status: isDead ? "dead" : "pending",
        error_message: error instanceof Error ? error.message : "Unknown error",
        scheduled_for: isDead
          ? undefined
          : new Date(Date.now() + Math.pow(2, job.attempts) * 1000).toISOString(),
      })
      .eq("id", job.id);

    return Response.json({ failed: job.id, dead: isDead });
  }
}

async function processJob(job: { job_type: string; payload: any }) {
  switch (job.job_type) {
    case "send_email":
      return await sendEmail(job.payload);
    case "generate_report":
      return await generateReport(job.payload);
    case "sync_crm":
      return await syncCRM(job.payload);
    default:
      throw new Error(`Unknown job type: ${job.job_type}`);
  }
}
```

### Pattern 2: pg_cron for Scheduled Tasks

```sql
-- Enable extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Process job queue every 5 minutes
SELECT cron.schedule(
  'process-job-queue',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://your-app.vercel.app/api/jobs/process',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'
  )$$
);

-- Daily cleanup at 2 AM UTC
SELECT cron.schedule(
  'cleanup-completed-jobs',
  '0 2 * * *',
  $$DELETE FROM job_queue
    WHERE status = 'completed'
    AND completed_at < NOW() - INTERVAL '30 days'$$
);

-- Hourly: unstick stale processing jobs
SELECT cron.schedule(
  'expire-stale-jobs',
  '0 * * * *',
  $$UPDATE job_queue
    SET status = 'pending',
        error_message = 'Timed out — returned to queue'
    WHERE status = 'processing'
    AND started_at < NOW() - INTERVAL '15 minutes'$$
);

-- Manage jobs
SELECT * FROM cron.job;
SELECT cron.unschedule('process-job-queue');
```

### Pattern 3: Inngest (Production Queue Service)

Best for: Complex workflows, fan-out/fan-in, step functions, production-grade reliability.

```typescript
// lib/inngest/client.ts
import { Inngest } from "inngest";
export const inngest = new Inngest({ id: "my-app" });

// lib/inngest/functions/send-welcome-email.ts
import { inngest } from "../client";

export const sendWelcomeEmail = inngest.createFunction(
  { id: "send-welcome-email", retries: 3 },
  { event: "user/signed-up" },
  async ({ event, step }) => {
    const user = await step.run("get-user", async () => {
      return await db.users.findById(event.data.userId);
    });

    await step.run("send-email", async () => {
      await resend.emails.send({
        to: user.email,
        subject: "Welcome!",
        react: WelcomeEmail({ name: user.name }),
      });
    });

    await step.sleep("wait-for-followup", "3 days");

    await step.run("send-followup", async () => {
      await resend.emails.send({
        to: user.email,
        subject: "How's it going?",
        react: FollowUpEmail({ name: user.name }),
      });
    });
  }
);

// app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { sendWelcomeEmail } from "@/lib/inngest/functions/send-welcome-email";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [sendWelcomeEmail],
});
```

### Pattern 4: Trigger.dev (Code-First Background Jobs)

```typescript
// trigger/send-report.ts
import { task } from "@trigger.dev/sdk/v3";

export const generateReport = task({
  id: "generate-report",
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: { reportId: string; userId: string }) => {
    const data = await fetchReportData(payload.reportId);
    const pdf = await generatePDF(data);
    await uploadToStorage(pdf, payload.reportId);
    await notifyUser(payload.userId, payload.reportId);
    return { success: true, reportId: payload.reportId };
  },
});

// Trigger from anywhere
await generateReport.trigger({ reportId: "abc", userId: "user-123" });
```

### Retry Strategy: Exponential Backoff with Jitter

```
Attempt 1: immediate
Attempt 2: ~2s + jitter
Attempt 3: ~4s + jitter
Attempt 4: ~8s + jitter
Attempt 5: ~16s + jitter → dead letter queue
```

```typescript
const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
```

### Idempotency Pattern

```typescript
async function processPayment(payload: { orderId: string; amount: number }) {
  // Check if already processed
  const existing = await db.payments.findByOrderId(payload.orderId);
  if (existing) return existing;

  const result = await stripe.charges.create({
    amount: payload.amount,
    idempotency_key: `order-${payload.orderId}`,
  });

  await db.payments.create({
    orderId: payload.orderId,
    stripeChargeId: result.id,
  });

  return result;
}
```

### Choosing the Right Tool

| Need | Postgres Queue | pg_cron | Inngest | Trigger.dev |
|---|---|---|---|---|
| Simple async tasks | ✅ | | ✅ | ✅ |
| Scheduled recurring | | ✅ | ✅ | ✅ |
| Multi-step workflows | | | ✅ | ✅ |
| Sleep/delay between steps | | | ✅ | ✅ |
| Fan-out / fan-in | | | ✅ | ✅ |
| No external services | ✅ | ✅ | | |
| Dashboard / observability | | | ✅ | ✅ |
| High volume (>10k/min) | | | ✅ | ✅ |

## Code Templates

No dedicated code templates. Inline patterns above cover primary use cases. Choose based on project complexity:
- Simple → Postgres queue + pg_cron
- Medium → Inngest
- Complex / high-volume → Trigger.dev or custom worker architecture

## Checklist

- [ ] All long-running operations moved to background jobs
- [ ] Retry logic with exponential backoff configured for every job type
- [ ] Max retry count set; dead letter queue captures exhausted jobs
- [ ] All job handlers are idempotent
- [ ] Job payloads are small (IDs/references, not full data)
- [ ] Scheduled jobs use distributed locking or single-instance guarantee
- [ ] Stale/stuck jobs detected and returned to queue automatically
- [ ] Old completed jobs cleaned up on a schedule
- [ ] Dead letter queue monitored with alerts
- [ ] Job processing latency and throughput tracked
- [ ] Cron secrets stored in environment variables
- [ ] Local development can trigger and test jobs

## Common Pitfalls

1. **Not handling duplicate execution** — Network issues can cause a job to run twice. Without idempotency, you get duplicate emails, double charges, or corrupted data.
2. **Queue table grows forever** — Without cleanup, the job_queue table becomes a performance liability. Schedule regular purges of completed jobs.
3. **Cron running on every instance** — In multi-instance deployments, a cron job fires on EVERY instance. Use pg_cron (runs once in the database) or distributed locking.
4. **No visibility into failures** — A job that fails silently is worse than a job that doesn't exist. Always log, alert, and make dead letters visible in an admin UI.
5. **Tight coupling between enqueue and process** — The code that enqueues a job shouldn't need to know how it's processed. Keep job types and payloads as a clean contract.
6. **Forgetting timezone handling in cron** — pg_cron uses UTC. If you need "9 AM Eastern every day," convert to UTC or use a scheduling library that handles timezones.
