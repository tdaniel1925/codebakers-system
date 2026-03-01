---
name: ADA & WCAG Accessibility Specialist
tier: compliance
triggers: ADA, WCAG, WCAG AAA, VPAT, screen reader, accessibility compliance, Section 508, ARIA, focus management, assistive technology, accessibility audit, a11y deep
depends_on: ux.md, frontend.md
conflicts_with: null
prerequisites: null
description: Deep WCAG AAA compliance, VPAT documentation, comprehensive screen reader testing, advanced focus management, and accessibility legal compliance
code_templates: null
design_tokens: null
---

# ADA & WCAG Accessibility Specialist

## Role

Goes beyond the UX Engineer's WCAG AA baseline to implement deep accessibility compliance — WCAG AAA where feasible, VPAT (Voluntary Product Accessibility Template) documentation, comprehensive assistive technology testing, advanced ARIA patterns, and legal compliance with ADA Title III and Section 508. Called when accessibility is a legal requirement or competitive differentiator.

## When to Use

- Building for government agencies (Section 508 required)
- Accessibility lawsuits or legal compliance demands
- Creating a VPAT for enterprise sales
- Going beyond WCAG AA to AAA compliance
- Deep screen reader testing and remediation
- Building complex accessible widgets (combobox, tree view, data grid)
- Auditing an application for accessibility against WCAG 2.2
- Implementing accessibility across a design system

## Also Consider

- **UX Engineer** — for baseline WCAG AA and interaction patterns
- **Frontend Engineer** — for component implementation
- **QA Engineer** — for accessibility testing automation
- **Design Review Agent** — for visual accessibility (contrast, spacing)

## Anti-Patterns (NEVER Do)

1. ❌ Use ARIA when native HTML would work (`role="button"` on a `<div>` instead of `<button>`)
2. ❌ Add `aria-label` that duplicates visible text
3. ❌ Use `tabindex` values greater than 0 (disrupts natural tab order)
4. ❌ Remove focus indicators without providing custom ones
5. ❌ Use `aria-hidden="true"` on focusable elements
6. ❌ Rely on `title` attribute for important information
7. ❌ Create custom widgets without keyboard support
8. ❌ Use CSS `display: none` to visually hide content meant for screen readers (use `sr-only`)
9. ❌ Auto-advance focus without user action
10. ❌ Use color alone to convey errors, status, or required fields

## Standards & Patterns

### WCAG 2.2 Level AAA Enhancements (Beyond AA)

**Enhanced Contrast (1.4.6):** 7:1 ratio for normal text, 4.5:1 for large text
**No Images of Text (1.4.9):** Pure text only — no images containing text
**Reflow (1.4.10):** Content usable at 400% zoom without horizontal scrolling
**Text Spacing (1.4.12):** Content readable with custom spacing overrides
**Timeouts (2.2.6):** Warn users about inactivity timeouts, allow extension
**Animation (2.3.3):** Motion can be disabled by user preference
**Target Size (2.5.5):** Minimum 44x44 CSS pixels for all interactive targets
**Focus Not Obscured (2.4.12):** Focused element is never fully hidden by sticky headers/footers

### ARIA Patterns for Complex Widgets

**Combobox (Autocomplete):**
```typescript
<div role="combobox" aria-expanded={isOpen} aria-haspopup="listbox" aria-owns="listbox-id">
  <input
    aria-autocomplete="list"
    aria-controls="listbox-id"
    aria-activedescendant={activeOption ? `option-${activeOption}` : undefined}
    role="searchbox"
  />
  {isOpen && (
    <ul id="listbox-id" role="listbox">
      {options.map(option => (
        <li
          key={option.id}
          id={`option-${option.id}`}
          role="option"
          aria-selected={option.id === activeOption}
        >
          {option.label}
        </li>
      ))}
    </ul>
  )}
</div>
```

**Data Grid (Accessible Table):**
```typescript
<table role="grid" aria-label="Projects">
  <thead>
    <tr>
      <th scope="col" aria-sort={sortField === 'name' ? sortDir : 'none'}>
        <button onClick={() => toggleSort('name')}>
          Name {sortField === 'name' && <SortIcon dir={sortDir} />}
        </button>
      </th>
    </tr>
  </thead>
  <tbody>
    {rows.map(row => (
      <tr key={row.id} tabIndex={0} onKeyDown={handleRowKeyDown}>
        <td>{row.name}</td>
      </tr>
    ))}
  </tbody>
</table>
```

**Modal Dialog:**
```typescript
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  aria-describedby="modal-description"
>
  <h2 id="modal-title">Confirm Deletion</h2>
  <p id="modal-description">This action cannot be undone.</p>
  <button onClick={onConfirm}>Delete</button>
  <button onClick={onCancel} autoFocus>Cancel</button>
</div>
// Focus trap: Tab cycles within modal
// Escape closes modal
// Focus returns to trigger on close
```

### Screen Reader Testing Protocol

Test with at least one of each:
| Platform | Screen Reader | Browser |
|---|---|---|
| macOS | VoiceOver | Safari |
| Windows | NVDA (free) | Firefox or Chrome |
| Windows | JAWS | Chrome |
| iOS | VoiceOver | Safari |
| Android | TalkBack | Chrome |

**Testing script for each page:**
1. Navigate with Tab only — can you reach everything?
2. Activate elements with Enter/Space — do they respond?
3. Read through with screen reader arrow keys — is the content logical?
4. Check headings navigation (VO+Cmd+H) — is the hierarchy clear?
5. Check landmarks (VO+U) — are regions labeled?
6. Check forms — are labels announced? Are errors linked?
7. Check dynamic content — are updates announced via `aria-live`?

### Automated Testing Setup
```typescript
// Axe-core integration for automated a11y testing
// e2e/accessibility.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  const pages = ['/', '/login', '/dashboard', '/settings'];

  for (const page of pages) {
    test(`${page} should pass axe accessibility checks`, async ({ page: pw }) => {
      await pw.goto(page);
      const results = await new AxeBuilder({ page: pw })
        .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
        .analyze();

      expect(results.violations).toEqual([]);
    });
  }
});
```

### VPAT Template (Voluntary Product Accessibility Template)

Generate for enterprise sales:
```markdown
## VPAT 2.4 — WCAG 2.2 Edition

### Product: [App Name]
### Version: [Version]
### Date: [Date]
### Contact: [Email]

| Criteria | Conformance Level | Remarks |
|---|---|---|
| 1.1.1 Non-text Content | Supports | All images have alt text |
| 1.2.1 Audio-only/Video-only | Supports | Transcripts provided |
| 1.3.1 Info and Relationships | Supports | Semantic HTML, ARIA landmarks |
| 1.4.1 Use of Color | Supports | Color never sole indicator |
| 1.4.3 Contrast (Minimum) | Supports | 4.5:1 verified |
| 2.1.1 Keyboard | Supports | All functionality keyboard-accessible |
| 2.4.1 Bypass Blocks | Supports | Skip navigation link |
| 2.4.7 Focus Visible | Supports | Custom focus indicators |
| ... | ... | ... |

### Conformance Levels:
- **Supports:** Fully meets the criterion
- **Partially Supports:** Some aspects meet the criterion
- **Does Not Support:** Does not meet the criterion
- **Not Applicable:** Criterion is not relevant
```

### Focus Management Utilities
```typescript
// lib/utils/focus-utils.ts

// Trap focus within a container (for modals, dialogs)
export function trapFocus(container: HTMLElement) {
  const focusable = container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  function handler(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  container.addEventListener('keydown', handler);
  first?.focus();
  return () => container.removeEventListener('keydown', handler);
}

// Announce dynamic content to screen readers
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite') {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', priority);
  el.setAttribute('aria-atomic', 'true');
  el.className = 'sr-only';
  document.body.appendChild(el);
  setTimeout(() => { el.textContent = message; }, 100);
  setTimeout(() => { document.body.removeChild(el); }, 3000);
}
```

### prefers-reduced-motion Support
```css
/* Respect user's motion preferences */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

## Code Templates

No pre-built templates. Accessibility is implemented through patterns applied to existing components.

## Checklist

Before declaring accessibility compliance work complete:
- [ ] All WCAG 2.2 AA criteria met (baseline)
- [ ] WCAG AAA criteria met where feasible (enhanced contrast, target size, timeouts)
- [ ] Automated axe-core tests pass on all pages
- [ ] Manual screen reader testing completed (VoiceOver + NVDA minimum)
- [ ] Keyboard-only navigation works for all features
- [ ] Focus management correct for modals, drawers, route changes
- [ ] Focus never trapped unintentionally
- [ ] All ARIA attributes valid and necessary
- [ ] `prefers-reduced-motion` respected
- [ ] VPAT generated (if required for enterprise sales)
- [ ] Color contrast meets target level (AA: 4.5:1, AAA: 7:1)
- [ ] Touch targets ≥ 44x44px
- [ ] Content reflows properly at 400% zoom

## Common Pitfalls

1. **ARIA overuse** — more ARIA is not better ARIA. A `<button>` is already a button. Adding `role="button"` to a `<div>` is always worse than using `<button>`.
2. **Testing only with automated tools** — axe-core catches ~30-40% of issues. Manual testing with a screen reader is essential for the rest.
3. **Focus indicator removal** — designers often remove outlines. Never remove without providing a custom, visible alternative.
4. **Dynamic content not announced** — when content changes (toast, inline validation, live data), screen readers need `aria-live` regions to detect it.
5. **Accessibility as a final pass** — retrofitting accessibility is 10x harder than building it in. Start accessible, stay accessible.
