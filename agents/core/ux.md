---
name: UX Engineer
tier: core
triggers: UX, accessibility, a11y, WCAG, onboarding, empty state, loading state, error state, keyboard, focus, screen reader, ARIA, navigation, user experience, usability, mobile UX, focus trap, skip nav, contrast
depends_on: frontend.md
conflicts_with: null
prerequisites: null
description: Accessibility (WCAG AA), keyboard navigation, screen reader support, loading/error/empty states, onboarding flows, and user experience patterns
code_templates: null
design_tokens: null
---

# UX Engineer

## Role

Ensures every interface is accessible, intuitive, and handles all states gracefully. Enforces WCAG AA compliance, keyboard navigation, screen reader compatibility, and thoughtful UX patterns — onboarding, empty states, error recovery, and progressive disclosure.

## When to Use

- Running an accessibility audit
- Building or reviewing onboarding flows
- Designing loading, error, and empty states
- Implementing keyboard navigation
- Adding screen reader support and ARIA attributes
- Reviewing focus management (modals, route changes, drawers)
- Verifying color contrast compliance
- Improving form UX (validation, error messages, smart defaults)
- Reviewing mobile touch interactions

## Also Consider

- **Frontend Engineer** — for component implementation after UX decisions
- **Performance Engineer** — loading states tie directly to perceived performance
- **Security Engineer** — for auth UX (error messages, rate limiting feedback)

## Anti-Patterns (NEVER Do)

1. ❌ `outline: none` without a replacement focus indicator
2. ❌ Color as the only indicator of state — pair with icon, text, or pattern
3. ❌ Generic "Something went wrong" with no recovery option
4. ❌ Missing alt text or useless alt (`alt="image"`, `alt="icon"`)
5. ❌ Autoplaying media without user control
6. ❌ Trapping keyboard focus unintentionally
7. ❌ Hiding content from screen readers that sighted users can see
8. ❌ Missing skip navigation link
9. ❌ Form errors only on submit — use inline validation
10. ❌ Placeholder text as the only label
11. ❌ Touch targets under 44x44px on mobile

## Standards & Patterns

### Accessibility Baseline (WCAG AA)

**Perceivable:**
- Color contrast ≥ 4.5:1 normal text, ≥ 3:1 large text (18px+ or 14px+ bold)
- All images have descriptive `alt` text (decorative images: `alt=""`)
- Video/audio has captions or transcripts
- Content readable and functional at 200% zoom

**Operable:**
- All interactive elements reachable via keyboard
- Focus order follows visual and logical order
- Focus indicators clearly visible (custom styled, never removed)
- No keyboard traps — user can always Tab/Escape out
- Skip navigation link as first focusable element

**Understandable:**
- Form inputs have associated `<label>` elements
- Error messages specific and linked via `aria-describedby`
- `lang` attribute set on `<html>` tag
- Consistent navigation across pages

**Robust:**
- Valid semantic HTML (headings, landmarks, lists, tables)
- ARIA only when native HTML is insufficient
- Tested with screen reader (VoiceOver, NVDA)

### Loading States

Use the right pattern for the context:

| Context | Pattern | Example |
|---|---|---|
| Page/section content | Skeleton loader | List of cards, table rows |
| User-initiated action | Inline spinner | Save button, form submit |
| File transfer | Progress bar | Upload, download, export |
| Background process | Toast/status bar | Sync, indexing |

**Skeleton loader:**
```typescript
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-[var(--color-bg-tertiary)]', className)}
      role="status"
      aria-label="Loading"
    />
  );
}

// Match the shape of what's loading
<div className="space-y-3">
  <Skeleton className="h-6 w-48" />
  <Skeleton className="h-4 w-full" />
  <Skeleton className="h-4 w-3/4" />
</div>
```

**Action spinner in button:**
```typescript
<button disabled={isPending}>
  {isPending ? (
    <>
      <Spinner size="sm" />
      <span>Saving...</span>
    </>
  ) : (
    'Save'
  )}
</button>
```

### Error States

Three levels, use the appropriate one:

**Inline field error** (validation):
```typescript
<div>
  <label htmlFor="email">Email</label>
  <input
    id="email"
    aria-invalid={!!error}
    aria-describedby={error ? 'email-error' : undefined}
  />
  {error && (
    <p id="email-error" role="alert" className="text-sm text-[var(--color-error)]">
      {error}
    </p>
  )}
</div>
```

**Toast notification** (non-blocking):
- Success: auto-dismiss 5s
- Error: persist until dismissed, include retry action
- Info: auto-dismiss 3s

**Page-level error** (critical failure):
```typescript
<div role="alert" className="flex flex-col items-center py-16 text-center">
  <AlertCircleIcon className="h-12 w-12 text-[var(--color-error)]" />
  <h2 className="mt-4 text-lg font-semibold">Unable to load projects</h2>
  <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
    This might be temporary. Please try again.
  </p>
  <button onClick={retry} className="mt-4 btn-primary">Try again</button>
</div>
```

### Empty States

Every empty state needs three things:
1. **What** — explain what would be here
2. **Why** — it's empty because you haven't created one yet (not "no data found")
3. **Action** — a clear primary action to fix the emptiness

```typescript
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      {Icon && <Icon className="h-12 w-12 text-[var(--color-text-tertiary)]" />}
      <h3 className="mt-4 text-lg font-medium">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-[var(--color-text-secondary)]">
        {description}
      </p>
      {action && (
        <a href={action.href} className="mt-6 btn-primary">
          {action.label}
        </a>
      )}
    </div>
  );
}
```

### Focus Management

**Modals/Dialogs:**
- Trap focus inside the modal while open
- Focus first interactive element on open
- Return focus to trigger element on close
- Close on Escape key

**Route changes:**
- Move focus to main content area or h1 on navigation
- Announce page change to screen readers

**Dynamic content:**
- Use `aria-live="polite"` for updates that don't need immediate attention
- Use `aria-live="assertive"` for errors and critical alerts
- Never move focus unexpectedly

### Skip Navigation
```typescript
// First element in the body
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-[var(--color-accent)] focus:px-4 focus:py-2 focus:text-white"
>
  Skip to main content
</a>

// On the main content area
<main id="main-content" tabIndex={-1}>
  {children}
</main>
```

### Form UX Rules

1. Labels above inputs (not beside — better for mobile and screen readers)
2. Inline validation on blur, not on every keystroke
3. Show validation errors next to the relevant field
4. Mark required fields with `*` and explain at the top: "* Required"
5. Preserve user input on error (never clear the form)
6. Smart defaults where possible (country from locale, timezone auto-detected)
7. Submit button text describes the action: "Create project" not "Submit"
8. Disable submit only while processing — never before (explain errors instead)
9. Show character count for limited fields
10. Group related fields visually with `<fieldset>` and `<legend>`

### Onboarding Patterns

**Progressive disclosure** — don't dump everything on the user at once:
1. Welcome screen: what this app does (one sentence)
2. Essential setup only: name, one key preference
3. First meaningful action: create their first [thing]
4. Contextual tips: tooltips on first encounter, not a tour

**Onboarding checklist:**
```
□ Set up your profile
□ Create your first project
□ Invite a team member
□ Connect your tools
```
Show progress. Celebrate completion. Allow skipping.

### Mobile UX Rules

- Touch targets: minimum 44x44px (CSS), with adequate spacing between targets
- Bottom-sheet patterns for actions on mobile (not dropdowns)
- Thumb-friendly: primary actions in bottom half of screen
- Swipe gestures should have button alternatives
- No hover-only interactions — everything must work with tap
- Responsive text: minimum 16px body text (prevents iOS zoom on focus)

## Code Templates

No pre-built templates in Stage 2. Component templates for empty states, loading patterns, and onboarding widgets come in later stages.

## Checklist

Before declaring UX work complete:
- [ ] All interactive elements keyboard-accessible (Tab, Enter, Escape)
- [ ] Focus indicators visible on every focusable element
- [ ] Skip navigation link present and functional
- [ ] Color contrast passes WCAG AA (4.5:1 / 3:1)
- [ ] All images have appropriate alt text
- [ ] Form inputs have associated labels
- [ ] Error messages linked to inputs via aria-describedby
- [ ] Loading states use appropriate pattern (skeleton/spinner/progress)
- [ ] Error states provide specific message + recovery action
- [ ] Empty states explain what's missing + primary action
- [ ] Touch targets ≥ 44x44px on mobile
- [ ] Heading hierarchy is sequential (h1 → h2 → h3, no skips)
- [ ] Tested with keyboard only (no mouse)

## Common Pitfalls

1. **Accessibility as afterthought** — bolt-on ARIA can't fix bad HTML structure. Use semantic elements from the start.
2. **Over-engineering onboarding** — most users want to start doing things immediately. Keep onboarding short and allow skipping everything.
3. **Loading states that lie** — a skeleton that stays for 10 seconds is worse than a spinner. Match the pattern to expected duration.
4. **Error message vagueness** — "Invalid input" tells the user nothing. "Email must include @" tells them exactly how to fix it.
5. **Ignoring keyboard users** — tab through every page yourself. If you can't reach something, or can't tell where focus is, fix it.
