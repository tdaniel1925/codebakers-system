---
name: Workflow Automation Specialist
tier: ai
triggers: workflow, automation, trigger, action, cron, scheduler, queue, pipeline, chain, step, retry, webhook trigger, event-driven, background job, task queue, orchestration, zapier-like, n8n, automate
depends_on: backend.md, database.md
conflicts_with: null
prerequisites: Supabase Edge Functions or Vercel Cron, pg_cron extension (optional)
description: Workflow automation — trigger/action chains, event-driven pipelines, scheduled jobs, retry logic with exponential backoff, status tracking, dead letter queues, multi-step orchestration
code_templates: workflow-engine.ts
design_tokens: null
---

# Workflow Automation Specialist

## Role

Owns the design and implementation of automated workflows — event-driven chains of actions triggered by user activity, schedules, or external webhooks. Builds the workflow engine that defines triggers (when something happens), conditions (if criteria are met), and actions (do something). Handles job queuing, retry logic with exponential backoff, dead letter handling for permanently failed jobs, status tracking dashboards, and scheduled/recurring tasks via cron. Ensures workflows are idempotent, observable, and recoverable from failure at any step.

## When to Use

- Building multi-step automations (e.g., "when a form is submitted → validate → send email → create CRM record → notify Slack")
- Implementing event-driven pipelines triggered by database changes, webhooks, or user actions
- Setting up scheduled/recurring tasks (daily reports, weekly cleanup, monthly billing)
- Adding retry logic with backoff for unreliable external API calls
- Building a task queue for long-running background jobs
- Implementing a status tracking system for multi-step processes
- Creating approval workflows (submit → review → approve/reject → notify)
- Building webhook receivers that trigger internal automations

## Also Consider

- `backend.md` — for API routes that serve as webhook endpoints
- `database.md` — for database triggers that kick off workflows
- `email.md` — for sending emails as workflow actions
- `notifications.md` — for in-app notifications triggered by workflow steps
- `voice-ai.md` — for triggering outbound calls as workflow actions
- `document-ai.md` — for PDF generation steps in workflows

## Anti-Patterns (NEVER Do)

- **Never build workflows that aren't idempotent** — if a step runs twice (due to retry), the result must be the same. Use unique idempotency keys on every external call
- **Never retry indefinitely** — always set a max retry count (typically 3-5) with exponential backoff, then move to dead letter queue
- **Never lose failed jobs silently** — always log failures with full context (input, error, step number) and alert on dead letter queue growth
- **Never run long workflows synchronously in an API route** — always queue the work and return immediately. Use background jobs or edge functions
- **Never skip status tracking** — every workflow execution must have a trackable status (pending → running → completed / failed) with timestamps
- **Never hardcode workflow definitions** — store trigger/condition/action configs in the database so they can be modified without deployment
- **Never chain more than 10 steps without checkpointing** — long chains should save state between steps so they can resume from the last successful step on failure
- **Never ignore ordering** — if workflow steps must execute in sequence, enforce it. Parallel execution should be explicitly opted into

## Standards & Patterns

### Workflow Database Schema

```sql
-- Workflow definitions (the blueprint)
CREATE TABLE workflows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'webhook', 'schedule', 'database_event', 'manual', 'api'
  )),
  trigger_config JSONB NOT NULL DEFAULT '{}',
  -- e.g., { "cron": "0 9 * * 1", "table": "orders", "event": "INSERT" }
  steps JSONB NOT NULL DEFAULT '[]',
  -- Array of { id, type, config, on_failure, timeout_seconds }
  active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workflow executions (individual runs)
CREATE TABLE workflow_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'cancelled', 'paused'
  )),
  trigger_data JSONB DEFAULT '{}', -- Input that started this run
  current_step INTEGER DEFAULT 0,
  step_results JSONB DEFAULT '[]', -- Array of step outcomes
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dead letter queue for permanently failed jobs
CREATE TABLE workflow_dead_letters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_run_id UUID REFERENCES workflow_runs(id),
  step_index INTEGER,
  step_type TEXT,
  input JSONB,
  error TEXT,
  retry_count INTEGER,
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_runs_status ON workflow_runs (status, created_at DESC);
CREATE INDEX idx_runs_workflow ON workflow_runs (workflow_id, created_at DESC);
CREATE INDEX idx_dead_letters_unresolved ON workflow_dead_letters (resolved, created_at DESC);
```

### Workflow Engine Core

```typescript
interface WorkflowStep {
  id: string;
  type: 'api_call' | 'email' | 'database' | 'condition' | 'delay' | 'webhook' | 'transform' | 'ai';
  config: Record<string, unknown>;
  onFailure: 'retry' | 'skip' | 'abort' | 'dead_letter';
  maxRetries: number;
  timeoutSeconds: number;
}

interface WorkflowRun {
  id: string;
  workflowId: string;
  status: string;
  currentStep: number;
  stepResults: StepResult[];
  triggerData: Record<string, unknown>;
}

interface StepResult {
  stepId: string;
  status: 'success' | 'failed' | 'skipped';
  output: unknown;
  error?: string;
  duration_ms: number;
  retries: number;
}

async function executeWorkflow(
  workflow: { steps: WorkflowStep[] },
  run: WorkflowRun,
  triggerData: Record<string, unknown>
): Promise<void> {
  await updateRunStatus(run.id, 'running');

  let context = { ...triggerData }; // Accumulates outputs from each step

  for (let i = run.currentStep; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    const startTime = Date.now();

    try {
      // Update current step
      await updateRunStep(run.id, i);

      // Execute with timeout
      const output = await withTimeout(
        executeStep(step, context),
        step.timeoutSeconds * 1000
      );

      // Record success
      const result: StepResult = {
        stepId: step.id,
        status: 'success',
        output,
        duration_ms: Date.now() - startTime,
        retries: 0,
      };
      await appendStepResult(run.id, result);

      // Merge output into context for next step
      context = { ...context, [`step_${step.id}`]: output };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Retry logic
      if (step.onFailure === 'retry') {
        const retried = await retryWithBackoff(step, context, step.maxRetries);
        if (retried.success) {
          context = { ...context, [`step_${step.id}`]: retried.output };
          await appendStepResult(run.id, {
            stepId: step.id,
            status: 'success',
            output: retried.output,
            duration_ms: Date.now() - startTime,
            retries: retried.attempts,
          });
          continue;
        }
      }

      // Handle failure
      switch (step.onFailure) {
        case 'skip':
          await appendStepResult(run.id, {
            stepId: step.id,
            status: 'skipped',
            output: null,
            error: errorMsg,
            duration_ms: Date.now() - startTime,
            retries: 0,
          });
          continue;

        case 'dead_letter':
          await createDeadLetter(run.id, i, step, context, errorMsg);
          await appendStepResult(run.id, {
            stepId: step.id,
            status: 'failed',
            output: null,
            error: errorMsg,
            duration_ms: Date.now() - startTime,
            retries: step.maxRetries,
          });
          continue;

        case 'abort':
        default:
          await updateRunStatus(run.id, 'failed', errorMsg);
          return;
      }
    }
  }

  await updateRunStatus(run.id, 'completed');
}
```

### Step Executors

```typescript
async function executeStep(
  step: WorkflowStep,
  context: Record<string, unknown>
): Promise<unknown> {
  // Interpolate variables from context into step config
  const config = interpolateConfig(step.config, context);

  switch (step.type) {
    case 'api_call':
      return executeApiCall(config);
    case 'email':
      return executeSendEmail(config);
    case 'database':
      return executeDatabaseAction(config);
    case 'condition':
      return evaluateCondition(config, context);
    case 'delay':
      return executeDelay(config);
    case 'webhook':
      return executeWebhookCall(config);
    case 'transform':
      return executeTransform(config, context);
    case 'ai':
      return executeAiStep(config, context);
    default:
      throw new Error(`Unknown step type: ${step.type}`);
  }
}

async function executeApiCall(config: Record<string, unknown>) {
  const { url, method, headers, body } = config as {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: unknown;
  };

  const response = await fetch(url, {
    method: method || 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`API call failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function executeSendEmail(config: Record<string, unknown>) {
  const { to, subject, template, variables } = config as {
    to: string;
    subject: string;
    template: string;
    variables: Record<string, string>;
  };

  // Using Resend
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to,
      subject: interpolateString(subject, variables),
      html: renderTemplate(template, variables),
    }),
  });

  if (!response.ok) throw new Error(`Email failed: ${response.statusText}`);
  return response.json();
}

async function evaluateCondition(
  config: Record<string, unknown>,
  context: Record<string, unknown>
): Promise<{ passed: boolean }> {
  const { field, operator, value } = config as {
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'exists';
    value: unknown;
  };

  const actual = getNestedValue(context, field);

  switch (operator) {
    case 'eq': return { passed: actual === value };
    case 'neq': return { passed: actual !== value };
    case 'gt': return { passed: Number(actual) > Number(value) };
    case 'lt': return { passed: Number(actual) < Number(value) };
    case 'contains': return { passed: String(actual).includes(String(value)) };
    case 'exists': return { passed: actual !== undefined && actual !== null };
    default: return { passed: false };
  }
}
```

### Retry with Exponential Backoff

```typescript
async function retryWithBackoff(
  step: WorkflowStep,
  context: Record<string, unknown>,
  maxRetries: number
): Promise<{ success: boolean; output?: unknown; attempts: number }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s...
    const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
    await sleep(delayMs);

    try {
      const output = await executeStep(step, context);
      return { success: true, output, attempts: attempt };
    } catch {
      if (attempt === maxRetries) {
        return { success: false, attempts: attempt };
      }
    }
  }
  return { success: false, attempts: maxRetries };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### Scheduled Workflows (Cron)

```typescript
// Vercel Cron: vercel.json
// {
//   "crons": [
//     { "path": "/api/cron/daily-report", "schedule": "0 9 * * *" },
//     { "path": "/api/cron/weekly-cleanup", "schedule": "0 3 * * 0" }
//   ]
// }

// app/api/cron/daily-report/route.ts
export async function GET(req: Request) {
  // Verify cron secret (prevent unauthorized triggering)
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Find and execute scheduled workflows
  const { data: workflows } = await supabase
    .from('workflows')
    .select('*')
    .eq('trigger_type', 'schedule')
    .eq('active', true)
    .contains('trigger_config', { cron: '0 9 * * *' });

  for (const workflow of workflows || []) {
    // Create a run and execute
    const { data: run } = await supabase
      .from('workflow_runs')
      .insert({
        workflow_id: workflow.id,
        status: 'pending',
        trigger_data: { triggered_by: 'cron', timestamp: new Date().toISOString() },
      })
      .select('id')
      .single();

    // Execute async (don't block cron response)
    executeWorkflow(workflow, run, {}).catch((err) =>
      console.error(`Workflow ${workflow.id} failed:`, err)
    );
  }

  return new Response('OK');
}
```

### Database Event Triggers

```sql
-- Supabase database trigger → webhook workflow
CREATE OR REPLACE FUNCTION trigger_workflow()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := current_setting('app.workflow_webhook_url'),
    body := jsonb_build_object(
      'event', TG_OP,
      'table', TG_TABLE_NAME,
      'record', row_to_json(NEW),
      'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', current_setting('app.webhook_secret')
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Example: trigger workflow when an order is created
CREATE TRIGGER order_created_workflow
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_workflow();
```

### Variable Interpolation

```typescript
// Replace {{variable}} patterns in config with context values
function interpolateConfig(
  config: Record<string, unknown>,
  context: Record<string, unknown>
): Record<string, unknown> {
  const json = JSON.stringify(config);
  const interpolated = json.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
    const value = getNestedValue(context, path.trim());
    return value !== undefined ? String(value) : '';
  });
  return JSON.parse(interpolated);
}

function interpolateString(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => vars[key.trim()] || '');
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current: unknown, key) => {
    return current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined;
  }, obj);
}
```

## Code Templates

- `workflow-engine.ts` — Complete engine with step executors, retry logic, dead letter handling, variable interpolation, and status tracking

## Checklist

- [ ] All workflow steps are idempotent (safe to re-run)
- [ ] Idempotency keys used for external API calls
- [ ] Retry logic with exponential backoff implemented (max 3-5 retries)
- [ ] Dead letter queue captures permanently failed jobs with full context
- [ ] Status tracking on every workflow run (pending → running → completed/failed)
- [ ] Step results logged with duration, retries, and output/error
- [ ] Cron endpoints verify authorization secret
- [ ] Database event triggers use async webhooks (don't block transactions)
- [ ] Long workflows checkpoint between steps (resumable on failure)
- [ ] Variable interpolation sanitizes inputs (no injection)
- [ ] Timeout configured per step (don't let steps hang forever)
- [ ] Monitoring: alert on dead letter queue growth, high failure rates
- [ ] Workflow definitions stored in database (modifiable without deploy)
- [ ] Cancel mechanism exists for running workflows
- [ ] Test mode available (dry run without side effects)

## Common Pitfalls

1. **Non-idempotent steps cause duplicates** — A retry on "send email" sends two emails. A retry on "charge customer" double-charges. Every step that talks to an external system must use an idempotency key.

2. **Cron drift** — Vercel/Supabase cron isn't precise. A "run at 9:00 AM" job might execute at 9:01 or 9:02. Never depend on exact execution time for logic.

3. **Unbounded retries** — Without a max retry count, a permanently failing step retries forever, burning API credits and resources. Always cap retries and move to dead letter.

4. **Lost context on failure** — When a workflow fails at step 7 of 10, you need to know what steps 1-6 produced. Always store step outputs incrementally, not just at the end.

5. **Blocking database triggers** — A Postgres trigger that makes an HTTP call blocks the transaction until it completes. Use `pg_net` for async HTTP or queue the webhook call.

6. **Circular workflows** — Workflow A triggers Workflow B which triggers Workflow A. Always track execution lineage and cap nesting depth (max 3 levels).
