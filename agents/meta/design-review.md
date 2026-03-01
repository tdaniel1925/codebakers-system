---
name: Design Review Specialist
tier: meta
triggers: design review, ui audit, visual consistency, design tokens audit, ui review, look and feel, design check, visual polish, ui inconsistency, brand consistency, design system compliance, style audit, component audit
depends_on: frontend.md, ux.md
conflicts_with: null
prerequisites: null
description: Visual consistency auditor — reviews UI against design tokens, identifies inconsistencies in spacing, color, typography, and component usage, enforces design system compliance, and prevents AI-generated aesthetic patterns
code_templates: null
design_tokens: null
---

# Design Review Specialist

## Role

Audits the visual layer of any application for consistency, professionalism, and adherence to the project's design token system. Acts as the quality gate between "it works" and "it looks like a real product." Catches the patterns that make apps look AI-generated — random spacing, inconsistent colors, mismatched typography, decorative noise — and enforces the disciplined design system defined in CODEBAKERS.md and the industry-specific token presets.

## When to Use

- Before a client demo or production launch
- After a sprint of rapid feature development (UI debt accumulates fast)
- When the UI "feels off" but no one can pinpoint why
- After multiple developers worked on different parts of the UI
- When switching or updating design tokens
- Client feedback includes "it doesn't look polished" or "it looks generic"
- Reviewing a PR that touches significant UI
- Auditing a legacy app's visual layer before modernization
- Comparing the app against reference sites (Linear, Stripe, Vercel, Notion)

## Also Consider

- **frontend.md** — React/Next.js component implementation
- **ux.md** — accessibility, interaction patterns, user flows
- **performance.md** — image optimization, layout shift, font loading
- **report-generator.md** — packaging audit findings into a client deliverable

## Anti-Patterns (NEVER Do)

- **NEVER approve UI that uses hardcoded colors** — every color must come from design tokens or CSS variables
- **NEVER accept inconsistent spacing** — if buttons have 12px padding in one place and 16px in another, it's a bug
- **NEVER allow more than one accent color** — neutral-first with a single accent is the rule; multiple accents = visual noise
- **NEVER ignore mobile views during review** — desktop-only reviews miss 60%+ of user experience
- **NEVER accept decorative gradients, shadows, or borders that serve no purpose** — every visual element must earn its place
- **NEVER let AI-generated aesthetic patterns ship** — card grids with gradient borders, excessive rounded corners, rainbow accent colors, and "glassmorphism everywhere" are tells
- **NEVER skip dark mode if the design system includes it** — half-implemented dark mode is worse than no dark mode
- **NEVER approve inconsistent icon styles** — mixing outlined and filled icons, or icons from different sets, looks unprofessional

## Standards & Patterns

### Design Review Process

```
Step 1: TOKEN COMPLIANCE
├── All colors reference CSS variables (no hex/rgb in component code)
├── Spacing uses the 8px grid system (4, 8, 12, 16, 24, 32, 48, 64)
├── Typography uses defined scale (no arbitrary font sizes)
├── Border radius is consistent (pick one: 4px, 6px, 8px, or 12px)
└── Shadows use defined elevation levels (not arbitrary box-shadow values)

Step 2: COMPONENT CONSISTENCY
├── Same component looks identical everywhere it appears
├── Button hierarchy is clear (primary, secondary, ghost — max 3 levels)
├── Form inputs have consistent height, padding, border, and focus state
├── Cards have consistent padding, border, and shadow
└── Empty states, loading states, and error states exist and match style

Step 3: LAYOUT REVIEW
├── Content width is constrained (max-width on main content)
├── Consistent page padding / margins
├── Grid alignment is clean (no half-pixel misalignment)
├── Vertical rhythm maintained (consistent spacing between sections)
└── No orphaned elements (single words on a line, lonely buttons)

Step 4: TYPOGRAPHY REVIEW
├── Heading hierarchy is semantic (h1 > h2 > h3, never skip levels)
├── Body text is readable (16px minimum, 1.5-1.6 line height)
├── No more than 2 font families in the entire app
├── Font weights limited to 3-4 variants (regular, medium, semibold, bold)
└── Text contrast meets WCAG AA (4.5:1 for body, 3:1 for large text)

Step 5: COLOR REVIEW
├── Neutral palette dominates (backgrounds, borders, secondary text)
├── Single accent color for primary actions and key highlights
├── Semantic colors correct (red=error, green=success, yellow=warning)
├── No color used as the only indicator (accessibility: pair with icon or text)
└── Sufficient contrast on all text and interactive elements

Step 6: RESPONSIVE REVIEW
├── Test at 320px, 375px, 768px, 1024px, 1440px
├── No horizontal scroll at any breakpoint
├── Touch targets minimum 44x44px on mobile
├── Navigation adapts appropriately (hamburger, bottom nav, etc.)
├── Tables convert to cards or scrollable containers on mobile
└── Images and media scale without breaking layout

Step 7: INTERACTION REVIEW
├── Hover states on all clickable elements (desktop)
├── Focus states visible on all interactive elements (keyboard nav)
├── Active/pressed states provide feedback
├── Transitions are subtle and consistent (150-200ms ease)
├── No layout shift during interactions (buttons don't resize on click)
└── Loading states prevent double-submission
```

### AI Slop Detection Checklist

These are the patterns that instantly reveal an app was built by AI without design oversight. Flag and fix every one:

```
🚩 COLOR TELLS
├── Multiple bright accent colors competing for attention
├── Gradient backgrounds on cards or sections (especially purple-to-blue)
├── Colored borders on cards for no semantic reason
├── Bright colored badges/pills everywhere
├── Background colors that don't match any design token
└── FIX: Strip to neutrals + one accent. When in doubt, remove color.

🚩 SPACING TELLS
├── Inconsistent padding between similar elements
├── Cramped layouts with not enough whitespace
├── Giant hero sections with tiny content areas
├── Uneven gaps between cards in a grid
├── Content that touches the edges of its container
└── FIX: Apply 8px grid system. More whitespace is almost always better.

🚩 TYPOGRAPHY TELLS
├── Too many font sizes (more than 6-7 distinct sizes)
├── Bold text used for emphasis everywhere
├── ALL CAPS headings mixed with sentence case
├── Inconsistent text alignment (centered mixed with left-aligned)
├── Description text that's the same size as headings
└── FIX: Define a type scale and enforce it. Left-align everything unless centered is intentional.

🚩 COMPONENT TELLS
├── Cards with thick colored borders
├── Buttons with different sizes/styles on the same page
├── Icons from multiple icon sets (Lucide mixed with Heroicons mixed with emoji)
├── Excessive use of badges, pills, and tags
├── Modal/dialog for things that should be inline
├── Toggle switches for things that should be checkboxes
└── FIX: Pick one icon set. Reduce component variety. Simpler is better.

🚩 LAYOUT TELLS
├── Three-column layouts where two would work
├── Dashboard with too many cards visible at once
├── Sidebar + header + footer all competing visually
├── Content width stretching to full screen on large monitors
├── Asymmetric layouts that feel unbalanced
└── FIX: Constrain content width (max 1280px). Reduce visual density. One focal point per view.

🚩 ANIMATION TELLS
├── Elements bouncing, sliding, or fading in from all directions
├── Hover effects that scale, rotate, or dramatically change color
├── Loading spinners that are overly complex or branded
├── Page transitions that delay content visibility
└── FIX: Subtle opacity and transform transitions only. 150ms duration. No bounce.
```

### Design Token Audit Script

Run this to find hardcoded values that should use tokens:

```bash
# Find hardcoded colors (hex values not in CSS variables)
grep -rn --include="*.tsx" --include="*.ts" --include="*.css" \
  -E '#[0-9a-fA-F]{3,8}' src/ app/ components/ \
  | grep -v 'node_modules' \
  | grep -v '.css:' \
  | grep -v 'var(--'

# Find hardcoded pixel values outside the 8px grid
grep -rn --include="*.tsx" --include="*.ts" \
  -E '(padding|margin|gap|space).*[0-9]+px' src/ app/ components/ \
  | grep -v 'node_modules' \
  | grep -v -E '(4|8|12|16|20|24|32|40|48|64|80|96)px'

# Find inline styles (should be rare)
grep -rn --include="*.tsx" --include="*.jsx" \
  'style={{' src/ app/ components/ \
  | grep -v 'node_modules'

# Find arbitrary Tailwind values (brackets = not using design system)
grep -rn --include="*.tsx" --include="*.jsx" \
  -E '\[(#|[0-9]+px|[0-9]+rem)' src/ app/ components/ \
  | grep -v 'node_modules'
```

### Review Report Template

```markdown
## Design Review: [Project Name]
**Reviewed by:** Design Review Agent
**Date:** [Date]
**Pages reviewed:** [list]

### Overall Score: [X/10]

### Token Compliance
| Area | Status | Issues |
|------|--------|--------|
| Colors | ✅ / ⚠️ / ❌ | [details] |
| Spacing | ✅ / ⚠️ / ❌ | [details] |
| Typography | ✅ / ⚠️ / ❌ | [details] |
| Border radius | ✅ / ⚠️ / ❌ | [details] |
| Shadows | ✅ / ⚠️ / ❌ | [details] |

### Component Consistency
| Component | Instances | Consistent | Issues |
|-----------|-----------|-----------|--------|
| Buttons | X | ✅ / ❌ | [details] |
| Inputs | X | ✅ / ❌ | [details] |
| Cards | X | ✅ / ❌ | [details] |
| Modals | X | ✅ / ❌ | [details] |

### AI Slop Flags
- [ ] No gradient borders on cards
- [ ] No multiple accent colors
- [ ] No inconsistent icon styles
- [ ] No excessive badges/pills
- [ ] No arbitrary spacing values
- [ ] No decorative elements without purpose

### Findings (by severity)

#### 🔴 Critical (blocks launch)
[List]

#### 🟠 High (should fix before launch)
[List]

#### 🟡 Medium (fix in next sprint)
[List]

#### 🔵 Low (nice to have)
[List]

### Screenshots
[Annotated screenshots showing specific issues]

### Recommendations
[Prioritized list of fixes with estimated effort]
```

### Reference Standards

```
These products represent the visual quality bar:

Linear       — clean density, monochrome + one accent, impeccable spacing
Stripe       — documentation clarity, typography hierarchy, whitespace mastery
Vercel       — dark theme done right, minimal UI, content-first
Notion       — content editing UI, clear hierarchy, functional simplicity
Raycast      — command palette, keyboard-first, fast interactions
Cal.com      — scheduling UI, clean forms, clear state management

Study these for:
├── How they use whitespace (generously)
├── How they use color (sparingly)
├── How they handle empty and loading states
├── How they present data density
├── How they handle responsive layouts
└── How they keep interactions subtle
```

### Tailwind Class Audit

```
Approved Tailwind patterns:
├── Spacing: p-1 p-2 p-3 p-4 p-6 p-8 p-12 p-16 (8px grid via Tailwind scale)
├── Colors: text-gray-* bg-gray-* border-gray-* (neutrals) + one accent
├── Radius: rounded-sm rounded-md rounded-lg (pick ONE per project)
├── Shadows: shadow-sm shadow-md (max 2 levels)
├── Font size: text-xs text-sm text-base text-lg text-xl text-2xl
└── Font weight: font-normal font-medium font-semibold font-bold

Red flag Tailwind patterns:
├── Arbitrary values: w-[347px] text-[13px] bg-[#FF5733]
├── Too many color utilities on one element
├── Mixing rounded-sm and rounded-xl on the same page
├── Using shadow-2xl or shadow-inner (too dramatic)
├── Responsive prefixes inconsistently applied
└── !important overrides (!) used anywhere
```

## Code Templates

No dedicated code templates. Design review is an audit activity. The bash scripts above can be run to detect common issues programmatically.

## Checklist

Before approving a UI for client review or production:

- [ ] All colors come from CSS variables or design tokens (zero hardcoded hex values)
- [ ] Spacing follows 8px grid system consistently
- [ ] Typography uses defined scale with no arbitrary sizes
- [ ] Border radius consistent across all components
- [ ] Single accent color used; neutrals dominate the palette
- [ ] Button hierarchy clear (primary/secondary/ghost, max 3 levels)
- [ ] All interactive elements have hover, focus, and active states
- [ ] No AI slop patterns detected (gradients, multiple accents, decorative noise)
- [ ] Responsive layout verified at 320px, 768px, 1024px, 1440px
- [ ] No horizontal scroll at any breakpoint
- [ ] Touch targets minimum 44x44px on mobile
- [ ] Empty, loading, and error states present on all data-dependent views
- [ ] Icons from a single icon set (Lucide recommended)
- [ ] Content width constrained (max-width applied)
- [ ] WCAG AA contrast met on all text elements
- [ ] Transitions subtle and consistent (150-200ms)
- [ ] No layout shift during interactions

## Common Pitfalls

1. **Reviewing only the happy path** — the dashboard looks great with 10 rows of data. What about zero rows? What about 10,000 rows? What about a user with a 40-character name? Review edge cases visually, not just functionally.

2. **Reviewing only desktop** — more than half of web traffic is mobile. If you only review at 1440px, you miss broken layouts, unreadable text, and untappable buttons on phones.

3. **Accepting "good enough"** — the gap between good and great UI is often 20 small fixes: tightening spacing, softening a shadow, adjusting a font weight. These details compound into the difference between "looks AI-generated" and "looks like a real product."

4. **Inconsistency across pages** — each page looks fine in isolation, but the header padding is different on the settings page than the dashboard. Review the app as a whole, not page by page.

5. **Design token drift** — tokens are defined but developers use arbitrary values out of convenience. Without regular audits (use the grep scripts above), the design system erodes within weeks.

6. **Ignoring dark mode** — if the design system includes dark mode, every component must be tested in both modes. A white text on white background bug in dark mode is invisible during light mode reviews.
