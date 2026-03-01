# CodeBakers Agent Template

> Use this template to create new agents. Fill in every section, validate against the quality checklist, then register in `ROUTER.md` and `MANIFEST.md`.

---

## Frontmatter

```yaml
---
name: ""                  # Human-readable agent name
tier: ""                  # 1-foundation | 2-features | 3-ui | 4-integrations | 5-industries
triggers: []              # 6-12 unique keyword phrases that activate this agent
depends_on: []            # File paths of required agents (e.g., ["foundation/auth.md"])
conflicts_with: []        # File paths of incompatible agents
prerequisites: []         # Environment/infrastructure prerequisites (e.g., ["Supabase project", "Stripe account"])
description: ""           # One-sentence summary of what this agent delivers
code_templates: []        # File paths of code templates provided (e.g., ["templates/code/webhook-receiver.ts"])
design_tokens: ""         # Recommended token theme (e.g., "tokens-saas.css")
---
```

---

## Role

_One paragraph describing this agent's responsibility. What does it own? What decisions does it make? What does it defer to other agents?_

---

## When to Use

_List 6-10 concrete scenarios where this agent should be activated._

1. **Scenario name** — Description of when this applies and what the agent contributes.
2. **Scenario name** — ...
3. **Scenario name** — ...
4. **Scenario name** — ...
5. **Scenario name** — ...
6. **Scenario name** — ...
7. _(optional)_ **Scenario name** — ...
8. _(optional)_ **Scenario name** — ...
9. _(optional)_ **Scenario name** — ...
10. _(optional)_ **Scenario name** — ...

---

## Also Consider

_3-5 related agents the user might also need._

| Agent | Path | Why |
|-------|------|-----|
| | | |
| | | |
| | | |

---

## Anti-Patterns

_8 rules for what NOT to do. Prevent common implementation mistakes._

1. **❌ Anti-pattern name** — What goes wrong and why. _Do this instead: ..._
2. **❌ Anti-pattern name** — ...
3. **❌ Anti-pattern name** — ...
4. **❌ Anti-pattern name** — ...
5. **❌ Anti-pattern name** — ...
6. **❌ Anti-pattern name** — ...
7. **❌ Anti-pattern name** — ...
8. **❌ Anti-pattern name** — ...

---

## Standards & Patterns

### Database Schema

_Core SQL tables this agent requires. Use Supabase-compatible PostgreSQL._

```sql
-- Table: <table_name>
-- Purpose: <what it stores>
CREATE TABLE <table_name> (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- columns here
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_<table>_<column> ON <table_name>(<column>);

-- RLS
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<policy_name>" ON <table_name>
  FOR SELECT USING (auth.uid() = user_id);
```

### TypeScript Interfaces

_Core types this agent defines._

```typescript
export interface <EntityName> {
  id: string;
  // fields here
  createdAt: string;
  updatedAt: string;
}

export type <EntityName>Status = 'active' | 'inactive' | 'archived';
```

### API Routes

_Key endpoints this agent exposes._

| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| GET | `/api/<resource>` | List all | Required |
| POST | `/api/<resource>` | Create new | Required |
| PATCH | `/api/<resource>/[id]` | Update | Required |
| DELETE | `/api/<resource>/[id]` | Soft delete | Required |

### Business Logic

_Core rules and validations._

```typescript
// Validation example
const schema = z.object({
  // fields with Zod validation
});

// Business rule example
function enforce<RuleName>(input: <Type>): boolean {
  // implementation
}
```

---

## Code Templates

_List any code templates this agent provides. Link to files in `templates/code/`._

| Template | Path | Description |
|----------|------|-------------|
| | `templates/code/<filename>` | |

_If no code templates, write: "This agent does not provide standalone code templates."_

---

## Checklist

_15-20 items to verify the implementation is complete._

### Core Implementation
- [ ] Database tables created with all columns, indexes, and RLS policies
- [ ] TypeScript interfaces match database schema
- [ ] API routes implemented with proper auth checks
- [ ] Input validation on all user-facing endpoints (Zod)
- [ ] Error handling with appropriate HTTP status codes

### Security
- [ ] Row Level Security policies tested for all roles
- [ ] Input sanitization on all text fields
- [ ] Rate limiting applied to public-facing endpoints
- [ ] Sensitive data encrypted at rest

### Quality
- [ ] Unit tests for all business logic functions
- [ ] Integration tests for API routes
- [ ] Edge cases documented and handled
- [ ] Logging added for key operations

### UX
- [ ] Loading states for all async operations
- [ ] Error states with actionable messages
- [ ] Empty states with guidance
- [ ] Mobile-responsive layouts
- [ ] Accessibility (WCAG AA) compliance

---

## Common Pitfalls

_5-7 mistakes developers frequently make in this domain._

1. **Pitfall name** — What happens and how to avoid it.
2. **Pitfall name** — ...
3. **Pitfall name** — ...
4. **Pitfall name** — ...
5. **Pitfall name** — ...
6. _(optional)_ **Pitfall name** — ...
7. _(optional)_ **Pitfall name** — ...

---

## Quality Checklist for New Agent Submission

_Before submitting a new agent, verify all of the following:_

- [ ] **Frontmatter complete** — All 9 fields filled in, triggers are unique across all agents
- [ ] **Role** — Clear single-paragraph scope, explicit boundaries
- [ ] **When to Use** — 6-10 realistic scenarios (not abstract)
- [ ] **Also Consider** — 3-5 related agents with valid file paths
- [ ] **Anti-Patterns** — 8 concrete rules with alternatives
- [ ] **Standards & Patterns** — SQL schemas, TypeScript types, API routes, business logic all present
- [ ] **Code Templates** — Listed or explicitly marked as none
- [ ] **Checklist** — 15-20 actionable verification items
- [ ] **Common Pitfalls** — 5-7 real-world mistakes
- [ ] **File placed in correct tier directory** — `agents/<tier>/`
- [ ] **Registered in ROUTER.md** — Triggers added to routing table
- [ ] **Registered in MANIFEST.md** — Entry added to tier table with depends_on and triggers
- [ ] **No trigger conflicts** — `grep -r` across all agents confirms unique triggers
- [ ] **depends_on paths valid** — All referenced agent files exist
