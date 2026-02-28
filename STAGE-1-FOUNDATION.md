# STAGE 1 — FOUNDATION SPEC

> Complete specification for the 6 foundation files that make the CodeBakers Agent System operational.
> After this stage: infrastructure is live, agents can be added incrementally, any project can connect.

---

## File 1: `CLAUDE.md` — The Conductor

### Purpose
The ONE file that lives in every project. It is the entry point for Claude Code. When Claude opens a project and finds this file, it knows the CodeBakers system is active. CLAUDE.md never changes — it's identical in every project.

### Responsibilities
1. Detect user intent from natural language
2. Fetch the MANIFEST from GitHub (cached, refreshed on session start)
3. Match intent → agent(s) using trigger keywords from the manifest
4. Load the relevant agent file(s) from GitHub
5. Execute the agent's instructions
6. Handle fast-path detection (trivial tasks skip the full routing ceremony)
7. Auto-generate a project profile on first run if one doesn't exist

### Behavior Flow
```
User says something
  → Is this trivial? (typo fix, one-liner, simple question)
    → YES: Handle directly, no agent routing
    → NO: Continue
  → Parse intent keywords
  → Load MANIFEST.md (from GitHub, cached locally)
  → Match keywords → agent triggers
  → If 1 agent matched: load + execute
  → If 2+ agents matched: recommend team, ask for confirmation
  → If 0 agents matched: fall back to general coding assistant behavior
  → After work: run agent's checklist
  → Suggest git commit with conventional commit message
```

### Key Rules
- CLAUDE.md is READONLY in projects. Never modified per-project.
- Project-specific context lives in `project-profile.md` (auto-generated).
- All agent files are fetched from GitHub at runtime, never bundled locally.
- The manifest URL is hardcoded: `https://raw.githubusercontent.com/OWNER/codebakers-system/main/MANIFEST.md`
- CODEBAKERS.md (standards) is always loaded alongside any agent.
- If no `project-profile.md` exists, prompt the user for: project name, stack, industry, and key features — then generate one from the template.

### Fast Path Triggers
Skip agent routing for:
- Questions about the codebase (just answer)
- Single-file edits under 20 lines
- Typo/formatting fixes
- "What does X do?" queries
- Git operations (commit, push, branch)
- Installing a package

### Size Target
~150-200 lines of markdown. Concise but complete.

---

## File 2: `CODEBAKERS.md` — Code Standards & Design Tokens

### Purpose
The universal code quality and design standard. Loaded alongside every agent, every time. This ensures all generated code across all projects follows identical patterns.

### Sections

#### 1. Stack Defaults
- Framework: Next.js 14+ (App Router)
- Language: TypeScript (strict mode)
- Database: Supabase (Postgres + Auth + Storage + Realtime)
- Styling: Tailwind CSS + CSS custom properties for tokens
- Deployment: Vercel
- Email: Resend
- Payments: Stripe
- Voice AI: VAPI
- Package manager: pnpm

#### 2. TypeScript Rules
- `strict: true` always
- No `any` — use `unknown` + type guards
- Zod for all runtime validation (API inputs, form data, env vars)
- Prefer `interface` for object shapes, `type` for unions/intersections
- All API responses typed with discriminated unions: `{ success: true, data: T } | { success: false, error: string }`
- Server actions return `ActionResult<T>` pattern
- No default exports except pages/layouts

#### 3. File & Naming Conventions
- `kebab-case` for all files and folders
- Components: `PascalCase` (matching filename: `user-card.tsx` → `export function UserCard`)
- Hooks: `use-[name].ts`
- Utils: `[domain]-utils.ts`
- Types: `[domain]-types.ts`
- Server actions: `[domain]-actions.ts`
- API routes: `app/api/[domain]/route.ts`
- Co-locate: tests next to source (`user-card.test.tsx` beside `user-card.tsx`)

#### 4. Component Rules
- Functional components only (no classes)
- Props interface named `[Component]Props`
- Destructure props in signature
- Children via `React.ReactNode`
- Extract hooks to custom hooks when reused
- No inline styles — Tailwind only
- Loading, error, and empty states required for every data-fetching component

#### 5. Database Patterns (Supabase)
- All tables have: `id` (uuid), `created_at`, `updated_at`
- Soft delete via `deleted_at` (nullable timestamp)
- RLS on every table — no exceptions
- Service role key server-side only, never in client code
- Use `supabase.rpc()` for complex queries
- Migrations via Supabase CLI (`supabase db diff`)
- Foreign keys with `ON DELETE CASCADE` or `SET NULL` (explicit, never default)

#### 6. API & Server Action Patterns
- All inputs validated with Zod before processing
- All errors caught with typed error responses
- Rate limiting on public endpoints
- Auth check as first line of every protected action
- Use `revalidatePath()` / `revalidateTag()` after mutations

#### 7. Error Handling
- Never swallow errors silently
- User-facing: friendly message + error code
- Developer-facing: full stack trace + context in logs
- Use `Result<T, E>` pattern for expected failures
- Unexpected errors → Sentry (or equivalent) + generic user message

#### 8. Security Baseline
- Environment variables via `.env.local` (never committed)
- All secrets in Vercel env vars for production
- CSRF protection on all forms
- XSS prevention: never `dangerouslySetInnerHTML` without sanitization
- SQL injection: always parameterized (Supabase handles this)
- Auth tokens: httpOnly cookies, not localStorage
- Content Security Policy headers
- Rate limiting on auth endpoints

#### 9. Design Token System
- All visual values (colors, spacing, typography, radii, shadows) defined as CSS custom properties
- Tokens live in `:root` and are overridden per-theme or per-industry
- Component styles reference tokens, never hardcoded values
- Base grid: 8px
- Font scale: 12, 14, 16, 18, 20, 24, 30, 36, 48, 60
- Color philosophy: neutral-first palette, ONE accent color, semantic naming (--color-primary, --color-surface, --color-text-primary, etc.)
- Border radius scale: 4, 6, 8, 12, 16
- Shadow scale: sm, md, lg (subtle — no dramatic box shadows)
- Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96

#### 10. Git Standards
- Conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`
- Branch naming: `feat/[ticket-or-slug]`, `fix/[ticket-or-slug]`
- Always create a safety branch before agent work: `pre-agent/[timestamp]`
- PR template included in project profile
- Never force push to main

#### 11. Performance Baseline
- Lighthouse score target: >90 across all categories
- No layout shift (CLS < 0.1)
- First Contentful Paint < 1.8s
- Bundle size: monitor with `next/bundle-analyzer`
- Images: next/image with proper sizing, WebP/AVIF
- Fonts: next/font with `display: swap`
- Code splitting: dynamic imports for heavy components

### Size Target
~200-250 lines. Dense reference document.

---

## File 3: `MANIFEST.md` — Agent Index

### Purpose
Auto-generated index of all agents in the system. The conductor (CLAUDE.md) reads this to route user intent to the right agent(s). Updated automatically by GitHub Actions on every push.

### Format
The manifest is a structured markdown document with one entry per agent:

```
## Agents

### [Agent Name]
- **File:** agents/[tier]/[filename].md
- **Tier:** [core|features|ai|integrations|industries|compliance|infrastructure|migration|meta]
- **Triggers:** [comma-separated keywords]
- **Depends On:** [comma-separated agent files]
- **Description:** [one-line description]
```

### Initial State
Since no agents exist yet in Stage 1, the manifest starts with:
- The header explaining the format
- A placeholder entry showing the expected structure
- A `<!-- AGENT_INDEX_START -->` / `<!-- AGENT_INDEX_END -->` marker pair for the GitHub Action to replace content between
- A statistics section at the bottom: total agents, agents per tier, last updated timestamp

### Key Rules
- Never edit manually — always auto-generated
- Sorted by tier, then alphabetically within tier
- The conductor uses trigger keywords for fuzzy matching
- Manifest is fetched at session start and cached

### Size Target
~50 lines initially, grows with each stage.

---

## File 4: `setup.sh` — One-Liner Machine Setup

### Purpose
A single curl command installs everything needed to use the CodeBakers system. Run once per machine, ever.

### What It Does
1. Checks for and installs (if missing):
   - Node.js (via nvm if not present, LTS version)
   - pnpm (via corepack)
   - Supabase CLI
   - Vercel CLI
   - Stripe CLI (optional, prompts)
   - GitHub CLI (gh)
2. Authenticates (prompts for each):
   - `gh auth login`
   - `supabase login`
   - `vercel login`
3. Creates global config directory: `~/.codebakers/`
4. Saves config: `~/.codebakers/config.json` with paths + versions
5. Clones the codebakers-system repo to `~/.codebakers/repo/` for local cache
6. Prints success summary with versions

### Key Rules
- Idempotent: safe to run multiple times (skips what's already installed)
- Cross-platform: macOS + Linux (detect via `uname`)
- Colorized output with status indicators (✓, ✗, →)
- Asks before installing anything new
- Never overwrites existing global configs
- Exits with clear error message if something fails
- All auth steps are optional (user can skip and do later)

### Size Target
~150-200 lines of bash.

---

## File 5: `.github/workflows/build-manifest.yml` — Manifest Auto-Builder

### Purpose
GitHub Action that runs on every push to the repository. It scans all agent files, reads their YAML headers, and regenerates MANIFEST.md.

### Trigger
```yaml
on:
  push:
    paths:
      - 'agents/**/*.md'
    branches:
      - main
```

### Steps
1. Checkout the repo
2. Run a Node.js script (inline) that:
   a. Reads all `.md` files in `agents/` recursively
   b. Parses the YAML frontmatter from each
   c. Groups by tier
   d. Sorts alphabetically within each tier
   e. Generates the manifest markdown
   f. Writes to MANIFEST.md between the marker comments
3. Commit and push the updated MANIFEST.md (if changed)

### Key Rules
- Only runs when agent files change
- Uses `actions/checkout` and `stefanzweifel/git-auto-commit-action`
- Commit message: `chore: auto-rebuild MANIFEST.md`
- Doesn't trigger itself (skip ci on auto-commit)
- Handles malformed YAML headers gracefully (logs warning, skips file)

### Size Target
~80-100 lines of YAML + inline script.

---

## File 6: `project-profile.template.md` — Per-Project Context

### Purpose
Template that the conductor uses to generate a `project-profile.md` for each project on first run. This file lives in the project (not in the codebakers-system repo) and stores project-specific context.

### Sections
```markdown
# Project Profile

## Identity
- **Name:** [project name]
- **Description:** [one-line description]
- **Industry:** [legal | insurance | healthcare | accounting | saas | ecommerce | nonprofit | realestate | education | other]
- **Client:** [client name or internal]

## Stack
- **Framework:** [Next.js 14 / other]
- **Database:** [Supabase / other]
- **Auth:** [Supabase Auth / Clerk / other]
- **Hosting:** [Vercel / other]
- **Additional:** [any extra services]

## Design
- **Token Preset:** [saas | legal | healthcare | corporate | custom]
- **Primary Color:** [hex]
- **Font:** [font name]

## Features
[checklist of features this project uses — auto-detected or user-specified]
- [ ] Authentication
- [ ] Billing (Stripe)
- [ ] Email (Resend)
- [ ] Voice AI (VAPI)
- [ ] Realtime
- [ ] File uploads
- [ ] Search
- [ ] Dashboard
- [ ] CMS
- [ ] Notifications
- [ ] Scheduling
- [ ] Data tables
- [ ] Maps
- [ ] Multi-step forms

## Environments
- **Local:** http://localhost:3000
- **Staging:** [URL]
- **Production:** [URL]
- **Supabase Dashboard:** [URL]

## Team Notes
[Any project-specific conventions, decisions, or context the AI should remember]
```

### Key Rules
- The conductor auto-generates this from a brief Q&A on first run
- User can edit it manually anytime
- Agents read this for project context
- Checked into the project repo (not .gitignored)
- Features checklist helps the conductor pre-load relevant agents

### Size Target
~60-80 lines of template markdown.

---

## Completion Criteria

Stage 1 is complete when:
1. ✅ All 6 files exist in the repo
2. ✅ `CLAUDE.md` can be dropped into any project folder and Claude Code recognizes it
3. ✅ `CODEBAKERS.md` contains complete, opinionated code standards
4. ✅ `MANIFEST.md` has the correct auto-generation markers
5. ✅ `setup.sh` runs without errors on a clean macOS/Linux machine
6. ✅ GitHub Action triggers on agent file changes and rebuilds the manifest
7. ✅ `project-profile.template.md` covers all necessary project context
8. ✅ No agents exist yet — but the system is fully ready to accept them

---

## Next Stage
→ **Stage 2: Core Team (Tier 1 Agents)** — Build the 10 core agents that form the base development team.
