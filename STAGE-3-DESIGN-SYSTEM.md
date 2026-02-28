# STAGE 3 — DESIGN SYSTEM SPEC

> Complete specification for the design review agent and 4 industry token presets.
> After this stage: every app looks professional, unique, and industry-appropriate. No more AI slop.

---

## Overview

The design system ensures visual consistency and professional quality across all projects. It consists of one meta agent (design-review) that audits UI consistency, plus four industry-specific CSS token presets that override the base tokens in CODEBAKERS.md.

### Files in This Stage

| # | File | Purpose |
|---|---|---|
| 1 | `agents/meta/design-review.md` | UI consistency auditor — catches AI slop |
| 2 | `templates/design/tokens-saas.css` | SaaS/startup design tokens |
| 3 | `templates/design/tokens-legal.css` | Legal/professional design tokens |
| 4 | `templates/design/tokens-healthcare.css` | Healthcare design tokens |
| 5 | `templates/design/tokens-corporate.css` | Corporate/enterprise design tokens |

---

## Design Philosophy

### Core Principles
1. **Neutral-first** — 90% of the UI is grayscale. Color is used intentionally.
2. **One accent color** — per project/industry. Everything else derives from it.
3. **Quiet confidence** — professional software whispers, it doesn't shout.
4. **Reference sites** — Linear, Stripe, Vercel, Notion. Study them.
5. **8px grid** — all spacing is multiples of 8 (with 4px for tight spots).
6. **Semantic tokens** — names describe purpose, not value.

### What Makes UI Look "Real" vs "AI Generated"
Real: subtle shadows, restrained color, consistent spacing, quiet typography, intentional whitespace, micro-interactions.
AI slop: gradient overload, too many colors, inconsistent spacing, decorative icons everywhere, centered everything, card soup, excessive rounded corners, stock illustration style.

---

## Completion Criteria

Stage 3 is complete when:
1. ✅ Design review agent has valid YAML frontmatter and full body
2. ✅ All 4 token presets are valid CSS with complete variable overrides
3. ✅ Each preset covers: colors, typography, spacing, radii, shadows
4. ✅ Presets are distinct and appropriate for their industry
5. ✅ Project profile's `Token Preset` field maps to these files

---

## Next Stage
→ **Stage 4: Feature Specialists (Tier 2 Agents)** — 12 feature agents + code templates.
