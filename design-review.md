---
name: Design Review
tier: meta
triggers: design review, UI audit, visual consistency, design tokens, look and feel, AI slop, ugly, polish, professional, branding, theme, visual, aesthetic, style guide
depends_on: frontend.md, ux.md
conflicts_with: null
prerequisites: null
description: Audits UI for visual consistency, design token compliance, anti-pattern detection, and professional quality — eliminates AI-generated aesthetic
code_templates: null
design_tokens: saas, legal, healthcare, corporate
---

# Design Review

## Role

Audits any UI for visual consistency, design token compliance, and professional quality. Detects "AI slop" patterns and enforces the design philosophy from CODEBAKERS.md. Ensures every app looks like it was designed by a human with taste, not auto-generated. Selects and enforces industry-appropriate token presets.

## When to Use

- Reviewing UI after a feature is built
- Before a client demo or production launch
- When something "looks off" but you can't pinpoint why
- Enforcing design token usage across components
- Selecting the right industry token preset for a project
- Auditing for visual consistency across pages
- Checking that dark mode works correctly
- Reviewing responsive design quality

## Also Consider

- **Frontend Engineer** — to implement fixes the review identifies
- **UX Engineer** — for accessibility and interaction pattern issues
- **Performance Engineer** — for image optimization and font loading

## Anti-Patterns (NEVER Do)

### The AI Slop Checklist — If You See These, Fix Them

**Color sins:**
1. ❌ More than 1 accent color (plus its hover/subtle variants)
2. ❌ Gradient backgrounds on cards or sections
3. ❌ Colored backgrounds on every section (alternating gray/white/blue)
4. ❌ Bright saturated colors for large surfaces
5. ❌ Using color where gray would work fine
6. ❌ Status colors (red/green/yellow) as decorative elements

**Typography sins:**
7. ❌ More than 2 font weights on a single view
8. ❌ Text larger than 48px outside of marketing hero sections
9. ❌ ALL CAPS for anything longer than 2 words
10. ❌ Centered body text (center headings sparingly, never paragraphs)
11. ❌ Line length over 75 characters (max-width the container)
12. ❌ Inconsistent font sizes across similar elements

**Layout sins:**
13. ❌ Everything centered on the page (left-align is the default)
14. ❌ Card soup — rows of 3-4 identical cards as the primary layout
15. ❌ Equal spacing everywhere (hierarchy needs varied spacing)
16. ❌ Decorative icons on every list item or card
17. ❌ Full-width everything (max-width creates breathing room)
18. ❌ No whitespace — cramming content edge-to-edge

**Component sins:**
19. ❌ Excessive border-radius (>16px on small elements, >24px on cards)
20. ❌ Drop shadows on everything
21. ❌ Borders AND shadows on the same element
22. ❌ Hover effects that change size/layout (use color/shadow only)
23. ❌ Skeleton loaders that don't match the actual content shape
24. ❌ Stock illustrations (undraw, storyset) as primary visual elements

**General sins:**
25. ❌ More than 3 visual "loudness levels" on one page
26. ❌ Inconsistent spacing between same-type elements
27. ❌ Different border-radius values on similar components
28. ❌ Mixing design patterns (some cards have borders, others have shadows)

## Standards & Patterns

### The Design Audit Process

Run this audit on every page/view:

**Step 1 — Token Compliance**
Scan for hardcoded values:
- Colors: any hex, rgb, or hsl that isn't a CSS variable → flag
- Spacing: any px value that isn't from the spacing scale → flag
- Typography: any font-size not from the type scale → flag
- Radii: any border-radius not from the radius scale → flag
- Shadows: any box-shadow not from the shadow scale → flag

**Step 2 — Color Audit**
- Count distinct colors used. Should be: 1 accent + neutrals + status colors only
- Check that accent color is used sparingly (CTAs, active states, links)
- Verify status colors are semantic (green=success, red=error, yellow=warning)
- Ensure sufficient contrast ratios (4.5:1 text, 3:1 large text)

**Step 3 — Typography Audit**
- Verify heading hierarchy (h1 > h2 > h3, no skipped levels)
- Check that body text is 14-16px
- Confirm line-height is 1.5 for body, 1.25 for headings
- Ensure max line-length is ~65-75 characters
- Verify no more than 2-3 font weights per page

**Step 4 — Spacing Audit**
- All spacing should be on the 8px grid (4px for tight spots)
- Vertical rhythm should be consistent within sections
- More space between sections than within sections (hierarchy)
- Padding inside cards/containers should be consistent

**Step 5 — Layout Audit**
- Content has appropriate max-width (not full-bleed everywhere)
- Left-aligned by default (centered only for short hero text)
- Visual hierarchy is clear (one focal point per section)
- Whitespace is generous, not cramped
- Responsive: check at 320px, 768px, 1024px, 1440px

**Step 6 — Component Consistency**
- Same-type elements look identical (all cards match, all buttons match)
- Consistent use of borders OR shadows (not mixed randomly)
- Interactive states are uniform (hover, focus, active, disabled)
- Icons are from one set and one style (not mixed outline + filled)

### Reference Quality Benchmarks

Study these for the right "feel":

| Site | What to Learn |
|---|---|
| **Linear** | Minimal color, strong typography, dark mode done right |
| **Stripe** | Information density without clutter, subtle gradients, clean docs |
| **Vercel** | Whitespace, monochrome confidence, sharp type |
| **Notion** | Quiet UI that disappears, content-first, gentle borders |
| **Raycast** | Tight spacing, command-palette UX, system-native feel |
| **Supabase** | Dashboard density, code-friendly, dark-first |

### Industry Token Selection

| Industry | Token Preset | Accent Tone | Feel |
|---|---|---|---|
| SaaS / Startup | `tokens-saas.css` | Blue / Indigo | Modern, clean, Linear-like |
| Legal / Professional | `tokens-legal.css` | Navy / Slate | Traditional, authoritative, trustworthy |
| Healthcare | `tokens-healthcare.css` | Teal / Green | Calm, clean, clinical |
| Corporate / Enterprise | `tokens-corporate.css` | Blue / Gray | Conservative, dense, data-heavy |

### Dark Mode Rules
- Don't just invert colors — dark mode needs its own token set
- Background: not pure black (#000), use dark grays (#0a0a0a to #1a1a1a)
- Reduce contrast slightly (text at 87% white, not 100%)
- Borders become more visible, shadows become less visible
- Accent color may need to be slightly lighter for contrast
- Test readability at night in a dark room

### Design Token Override Pattern
```css
/* In the project's tokens.css */
@import url('/path/to/tokens-saas.css');

/* Project-specific overrides */
:root {
  --color-accent: #6366f1;        /* Indigo instead of default blue */
  --color-accent-hover: #4f46e5;
  --color-accent-subtle: #eef2ff;
}
```

## Code Templates

Token preset files live in `templates/design/`:
- `tokens-saas.css`
- `tokens-legal.css`
- `tokens-healthcare.css`
- `tokens-corporate.css`

## Checklist

Before declaring a design review complete:
- [ ] Zero hardcoded colors — all via CSS custom properties
- [ ] Zero hardcoded spacing — all on 8px grid via tokens
- [ ] Typography scale followed consistently
- [ ] Single accent color (plus neutrals + status)
- [ ] No AI slop patterns detected (checked against anti-pattern list)
- [ ] Consistent component styling (borders, shadows, radii uniform)
- [ ] Responsive at 320px, 768px, 1024px, 1440px
- [ ] Dark mode works correctly (if applicable)
- [ ] Color contrast passes WCAG AA
- [ ] Industry-appropriate token preset applied
- [ ] Whitespace is generous and intentional
- [ ] Overall impression: "a designer made this, not an AI"

## Common Pitfalls

1. **Death by decoration** — every icon, gradient, and illustration competes for attention. When in doubt, remove it.
2. **Inconsistency across pages** — page A uses shadows on cards, page B uses borders. Pick one and commit.
3. **Over-designing the empty state** — a nice illustration is fine, but don't make empty states more visually interesting than the actual content.
4. **Color as crutch** — if you need color to make a section "stand out," the layout is wrong. Fix hierarchy with spacing and typography first.
5. **Forgetting the data** — designs look great with 3 items. What about 300? 0? Test with realistic data volumes.
