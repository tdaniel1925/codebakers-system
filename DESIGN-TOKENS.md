# CodeBakers Design Tokens

> Master design token system for all CodeBakers-generated applications. Tokens are CSS custom properties consumed by Tailwind via config mapping. Every generated app ships with one theme file.

---

## Token Architecture

All tokens follow the `--cb-{category}-{property}-{variant}` naming convention.

| Category | Examples | Purpose |
|----------|----------|---------|
| `color` | `--cb-color-primary-500` | Brand, semantic, and surface colors |
| `font` | `--cb-font-family-display` | Font families, sizes, weights, line heights |
| `space` | `--cb-space-4` | Spacing scale (margin, padding, gap) |
| `radius` | `--cb-radius-md` | Border radii |
| `shadow` | `--cb-shadow-md` | Box shadows and elevation |
| `motion` | `--cb-motion-duration-normal` | Transition durations and easings |
| `layout` | `--cb-layout-max-width` | Container widths, breakpoints |
| `z` | `--cb-z-modal` | Z-index layers |

---

## Default Theme: `tokens-saas.css`

The standard SaaS product theme. Blue primary, slate neutral, purple accent.

```css
/* tokens-saas.css — CodeBakers Default SaaS Theme */
:root {
  /* ── Primary (Blue) ── */
  --cb-color-primary-50: #eff6ff;
  --cb-color-primary-100: #dbeafe;
  --cb-color-primary-200: #bfdbfe;
  --cb-color-primary-300: #93c5fd;
  --cb-color-primary-400: #60a5fa;
  --cb-color-primary-500: #3b82f6;
  --cb-color-primary-600: #2563eb;
  --cb-color-primary-700: #1d4ed8;
  --cb-color-primary-800: #1e40af;
  --cb-color-primary-900: #1e3a8a;

  /* ── Secondary (Slate) ── */
  --cb-color-secondary-50: #f8fafc;
  --cb-color-secondary-100: #f1f5f9;
  --cb-color-secondary-200: #e2e8f0;
  --cb-color-secondary-300: #cbd5e1;
  --cb-color-secondary-400: #94a3b8;
  --cb-color-secondary-500: #64748b;
  --cb-color-secondary-600: #475569;
  --cb-color-secondary-700: #334155;
  --cb-color-secondary-800: #1e293b;
  --cb-color-secondary-900: #0f172a;

  /* ── Accent (Purple) ── */
  --cb-color-accent-50: #faf5ff;
  --cb-color-accent-100: #f3e8ff;
  --cb-color-accent-200: #e9d5ff;
  --cb-color-accent-300: #d8b4fe;
  --cb-color-accent-400: #c084fc;
  --cb-color-accent-500: #a855f7;
  --cb-color-accent-600: #9333ea;
  --cb-color-accent-700: #7e22ce;
  --cb-color-accent-800: #6b21a8;
  --cb-color-accent-900: #581c87;

  /* ── Semantic ── */
  --cb-color-success-500: #22c55e;
  --cb-color-success-600: #16a34a;
  --cb-color-warning-500: #eab308;
  --cb-color-warning-600: #ca8a04;
  --cb-color-error-500: #ef4444;
  --cb-color-error-600: #dc2626;
  --cb-color-info-500: #06b6d4;
  --cb-color-info-600: #0891b2;

  /* ── Surfaces ── */
  --cb-color-bg-primary: #ffffff;
  --cb-color-bg-secondary: #f8fafc;
  --cb-color-bg-tertiary: #f1f5f9;
  --cb-color-bg-inverse: #0f172a;
  --cb-color-border-default: #e2e8f0;
  --cb-color-border-strong: #cbd5e1;
  --cb-color-text-primary: #0f172a;
  --cb-color-text-secondary: #475569;
  --cb-color-text-muted: #94a3b8;
  --cb-color-text-inverse: #ffffff;

  /* ── Typography ── */
  --cb-font-family-display: 'Inter', system-ui, -apple-system, sans-serif;
  --cb-font-family-body: 'Inter', system-ui, -apple-system, sans-serif;
  --cb-font-family-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --cb-font-size-xs: 0.75rem;
  --cb-font-size-sm: 0.875rem;
  --cb-font-size-base: 1rem;
  --cb-font-size-lg: 1.125rem;
  --cb-font-size-xl: 1.25rem;
  --cb-font-size-2xl: 1.5rem;
  --cb-font-size-3xl: 1.875rem;
  --cb-font-size-4xl: 2.25rem;
  --cb-font-size-5xl: 3rem;
  --cb-font-weight-normal: 400;
  --cb-font-weight-medium: 500;
  --cb-font-weight-semibold: 600;
  --cb-font-weight-bold: 700;
  --cb-font-leading-tight: 1.25;
  --cb-font-leading-normal: 1.5;
  --cb-font-leading-relaxed: 1.625;

  /* ── Spacing Scale ── */
  --cb-space-0: 0;
  --cb-space-px: 1px;
  --cb-space-0-5: 0.125rem;
  --cb-space-1: 0.25rem;
  --cb-space-1-5: 0.375rem;
  --cb-space-2: 0.5rem;
  --cb-space-2-5: 0.625rem;
  --cb-space-3: 0.75rem;
  --cb-space-4: 1rem;
  --cb-space-5: 1.25rem;
  --cb-space-6: 1.5rem;
  --cb-space-8: 2rem;
  --cb-space-10: 2.5rem;
  --cb-space-12: 3rem;
  --cb-space-16: 4rem;
  --cb-space-20: 5rem;
  --cb-space-24: 6rem;
  --cb-space-32: 8rem;

  /* ── Border Radii ── */
  --cb-radius-none: 0;
  --cb-radius-sm: 0.25rem;
  --cb-radius-md: 0.375rem;
  --cb-radius-lg: 0.5rem;
  --cb-radius-xl: 0.75rem;
  --cb-radius-2xl: 1rem;
  --cb-radius-full: 9999px;

  /* ── Shadows ── */
  --cb-shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --cb-shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --cb-shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --cb-shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --cb-shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
  --cb-shadow-inner: inset 0 2px 4px 0 rgb(0 0 0 / 0.05);

  /* ── Motion ── */
  --cb-motion-duration-fast: 100ms;
  --cb-motion-duration-normal: 200ms;
  --cb-motion-duration-slow: 300ms;
  --cb-motion-duration-slower: 500ms;
  --cb-motion-easing-default: cubic-bezier(0.4, 0, 0.2, 1);
  --cb-motion-easing-in: cubic-bezier(0.4, 0, 1, 1);
  --cb-motion-easing-out: cubic-bezier(0, 0, 0.2, 1);
  --cb-motion-easing-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* ── Layout ── */
  --cb-layout-max-width: 1280px;
  --cb-layout-max-width-sm: 640px;
  --cb-layout-max-width-md: 768px;
  --cb-layout-max-width-lg: 1024px;
  --cb-layout-max-width-xl: 1280px;
  --cb-layout-max-width-2xl: 1536px;
  --cb-layout-sidebar-width: 256px;
  --cb-layout-sidebar-collapsed: 64px;
  --cb-layout-header-height: 64px;

  /* ── Z-Index ── */
  --cb-z-base: 0;
  --cb-z-dropdown: 10;
  --cb-z-sticky: 20;
  --cb-z-overlay: 30;
  --cb-z-modal: 40;
  --cb-z-popover: 50;
  --cb-z-toast: 60;
  --cb-z-tooltip: 70;
}
```

---

## Industry Theme: `tokens-corporate.css`

For legal, insurance, and accounting applications. Conservative, trustworthy, professional.

```css
/* tokens-corporate.css — Legal / Insurance / Accounting */
:root {
  /* ── Primary (Deep Blue) ── */
  --cb-color-primary-50: #eef2ff;
  --cb-color-primary-100: #e0e7ff;
  --cb-color-primary-200: #c7d2fe;
  --cb-color-primary-300: #a5b4fc;
  --cb-color-primary-400: #818cf8;
  --cb-color-primary-500: #1e3a5f;
  --cb-color-primary-600: #1a3353;
  --cb-color-primary-700: #152b47;
  --cb-color-primary-800: #11233b;
  --cb-color-primary-900: #0d1b2f;

  /* ── Accent (Teal) ── */
  --cb-color-accent-500: #0d9488;
  --cb-color-accent-600: #0f766e;
  --cb-color-accent-700: #115e59;

  /* ── Typography — Serif display font ── */
  --cb-font-family-display: 'Georgia', 'Times New Roman', serif;
  --cb-font-family-body: 'Inter', system-ui, -apple-system, sans-serif;

  /* ── Conservative radii ── */
  --cb-radius-sm: 0.125rem;
  --cb-radius-md: 0.25rem;
  --cb-radius-lg: 0.375rem;
  --cb-radius-xl: 0.5rem;
  --cb-radius-2xl: 0.625rem;

  /* ── Muted shadows ── */
  --cb-shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.06);
  --cb-shadow-md: 0 2px 4px -1px rgb(0 0 0 / 0.08);
}
```

---

## Industry Theme: `tokens-healthcare.css`

For healthcare and medical applications. Accessible, high-contrast, larger touch targets.

```css
/* tokens-healthcare.css — Healthcare / Medical */
:root {
  /* ── Primary (Cyan) ── */
  --cb-color-primary-50: #ecfeff;
  --cb-color-primary-100: #cffafe;
  --cb-color-primary-200: #a5f3fc;
  --cb-color-primary-300: #67e8f9;
  --cb-color-primary-400: #22d3ee;
  --cb-color-primary-500: #06b6d4;
  --cb-color-primary-600: #0891b2;
  --cb-color-primary-700: #0e7490;
  --cb-color-primary-800: #155e75;
  --cb-color-primary-900: #164e63;

  /* ── Accent (Indigo) ── */
  --cb-color-accent-500: #6366f1;
  --cb-color-accent-600: #4f46e5;
  --cb-color-accent-700: #4338ca;

  /* ── Higher contrast text ── */
  --cb-color-text-primary: #000000;
  --cb-color-text-secondary: #1e293b;

  /* ── Larger touch targets ── */
  --cb-space-touch-min: 44px;
  --cb-font-size-base: 1.0625rem;
  --cb-font-size-sm: 0.9375rem;

  /* ── Accessible focus ring ── */
  --cb-focus-ring: 0 0 0 3px rgba(6, 182, 212, 0.5);
}
```

---

## BotMakers Theme: `tokens-botmakers.css`

For BotMakers Inc. presentations and internal tools. Navy background, lime primary.

```css
/* tokens-botmakers.css — BotMakers Inc. Branding */
:root {
  /* ── Primary (Lime) ── */
  --cb-color-primary-50: #f0ffe0;
  --cb-color-primary-100: #d4ffaa;
  --cb-color-primary-200: #b8ff73;
  --cb-color-primary-300: #9cff3d;
  --cb-color-primary-400: #7fff00;
  --cb-color-primary-500: #7FFF00;
  --cb-color-primary-600: #66cc00;
  --cb-color-primary-700: #4c9900;
  --cb-color-primary-800: #336600;
  --cb-color-primary-900: #1a3300;

  /* ── Background (Navy) ── */
  --cb-color-bg-primary: #0D0B2B;
  --cb-color-bg-secondary: #151340;
  --cb-color-bg-tertiary: #1d1a55;
  --cb-color-bg-inverse: #ffffff;
  --cb-color-border-default: #2a2765;
  --cb-color-border-strong: #3d3980;

  /* ── Text on dark background ── */
  --cb-color-text-primary: #ffffff;
  --cb-color-text-secondary: #c4c0ff;
  --cb-color-text-muted: #8884cc;
  --cb-color-text-inverse: #0D0B2B;

  /* ── Typography — Arial per brand guidelines ── */
  --cb-font-family-display: 'Arial', 'Helvetica Neue', sans-serif;
  --cb-font-family-body: 'Arial', 'Helvetica Neue', sans-serif;

  /* ── Slide-optimized layout ── */
  --cb-layout-max-width: 1920px;
  --cb-layout-slide-height: 1080px;
}
```

---

## Ledger Theme: `tokens-ledger.css`

Daniel's preferred app style. Coral primary, mesh gradients, extra-rounded cards.

```css
/* tokens-ledger.css — Ledger-Style UI */
:root {
  /* ── Primary (Coral) ── */
  --cb-color-primary-50: #fff5f0;
  --cb-color-primary-100: #ffe8db;
  --cb-color-primary-200: #ffd0b8;
  --cb-color-primary-300: #ffb894;
  --cb-color-primary-400: #ff9f71;
  --cb-color-primary-500: #FF7F50;
  --cb-color-primary-600: #e06640;
  --cb-color-primary-700: #c04d30;
  --cb-color-primary-800: #a03420;
  --cb-color-primary-900: #801b10;

  /* ── Mesh gradient backgrounds ── */
  --cb-gradient-mesh-1: radial-gradient(at 20% 80%, #FF7F5033 0%, transparent 50%),
                        radial-gradient(at 80% 20%, #6366f133 0%, transparent 50%),
                        radial-gradient(at 50% 50%, #06b6d422 0%, transparent 70%);
  --cb-gradient-mesh-2: radial-gradient(at 0% 0%, #FF7F5022 0%, transparent 50%),
                        radial-gradient(at 100% 100%, #a855f722 0%, transparent 50%);
  --cb-gradient-card: linear-gradient(135deg, #ffffff 0%, #fff5f0 100%);

  /* ── Extra-rounded cards ── */
  --cb-radius-sm: 0.5rem;
  --cb-radius-md: 0.75rem;
  --cb-radius-lg: 1rem;
  --cb-radius-xl: 1.25rem;
  --cb-radius-2xl: 1.5rem;
  --cb-radius-card: 1.25rem;

  /* ── Elevated card shadows ── */
  --cb-shadow-card: 0 4px 24px -4px rgb(255 127 80 / 0.12), 0 2px 8px -2px rgb(0 0 0 / 0.06);
  --cb-shadow-card-hover: 0 8px 32px -4px rgb(255 127 80 / 0.18), 0 4px 12px -2px rgb(0 0 0 / 0.08);
}
```

---

## Tailwind Configuration Mapping

Map CSS custom properties to Tailwind classes in `tailwind.config.ts`:

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: 'var(--cb-color-primary-50)',
          100: 'var(--cb-color-primary-100)',
          200: 'var(--cb-color-primary-200)',
          300: 'var(--cb-color-primary-300)',
          400: 'var(--cb-color-primary-400)',
          500: 'var(--cb-color-primary-500)',
          600: 'var(--cb-color-primary-600)',
          700: 'var(--cb-color-primary-700)',
          800: 'var(--cb-color-primary-800)',
          900: 'var(--cb-color-primary-900)',
        },
        secondary: {
          50: 'var(--cb-color-secondary-50)',
          100: 'var(--cb-color-secondary-100)',
          200: 'var(--cb-color-secondary-200)',
          300: 'var(--cb-color-secondary-300)',
          400: 'var(--cb-color-secondary-400)',
          500: 'var(--cb-color-secondary-500)',
          600: 'var(--cb-color-secondary-600)',
          700: 'var(--cb-color-secondary-700)',
          800: 'var(--cb-color-secondary-800)',
          900: 'var(--cb-color-secondary-900)',
        },
        accent: {
          50: 'var(--cb-color-accent-50)',
          100: 'var(--cb-color-accent-100)',
          200: 'var(--cb-color-accent-200)',
          300: 'var(--cb-color-accent-300)',
          400: 'var(--cb-color-accent-400)',
          500: 'var(--cb-color-accent-500)',
          600: 'var(--cb-color-accent-600)',
          700: 'var(--cb-color-accent-700)',
          800: 'var(--cb-color-accent-800)',
          900: 'var(--cb-color-accent-900)',
        },
        success: { 500: 'var(--cb-color-success-500)', 600: 'var(--cb-color-success-600)' },
        warning: { 500: 'var(--cb-color-warning-500)', 600: 'var(--cb-color-warning-600)' },
        error: { 500: 'var(--cb-color-error-500)', 600: 'var(--cb-color-error-600)' },
        info: { 500: 'var(--cb-color-info-500)', 600: 'var(--cb-color-info-600)' },
        surface: {
          primary: 'var(--cb-color-bg-primary)',
          secondary: 'var(--cb-color-bg-secondary)',
          tertiary: 'var(--cb-color-bg-tertiary)',
          inverse: 'var(--cb-color-bg-inverse)',
        },
      },
      fontFamily: {
        display: 'var(--cb-font-family-display)',
        body: 'var(--cb-font-family-body)',
        mono: 'var(--cb-font-family-mono)',
      },
      borderRadius: {
        sm: 'var(--cb-radius-sm)',
        md: 'var(--cb-radius-md)',
        lg: 'var(--cb-radius-lg)',
        xl: 'var(--cb-radius-xl)',
        '2xl': 'var(--cb-radius-2xl)',
      },
      boxShadow: {
        xs: 'var(--cb-shadow-xs)',
        sm: 'var(--cb-shadow-sm)',
        md: 'var(--cb-shadow-md)',
        lg: 'var(--cb-shadow-lg)',
        xl: 'var(--cb-shadow-xl)',
      },
      transitionDuration: {
        fast: 'var(--cb-motion-duration-fast)',
        normal: 'var(--cb-motion-duration-normal)',
        slow: 'var(--cb-motion-duration-slow)',
      },
      zIndex: {
        dropdown: 'var(--cb-z-dropdown)',
        sticky: 'var(--cb-z-sticky)',
        overlay: 'var(--cb-z-overlay)',
        modal: 'var(--cb-z-modal)',
        popover: 'var(--cb-z-popover)',
        toast: 'var(--cb-z-toast)',
        tooltip: 'var(--cb-z-tooltip)',
      },
    },
  },
};

export default config;
```

---

## Dark Mode Pattern

Apply dark mode via `.dark` class on `<html>`. Override surface and text tokens:

```css
/* Append to any theme file */
.dark {
  --cb-color-bg-primary: #0f172a;
  --cb-color-bg-secondary: #1e293b;
  --cb-color-bg-tertiary: #334155;
  --cb-color-bg-inverse: #ffffff;
  --cb-color-border-default: #334155;
  --cb-color-border-strong: #475569;
  --cb-color-text-primary: #f8fafc;
  --cb-color-text-secondary: #cbd5e1;
  --cb-color-text-muted: #64748b;
  --cb-color-text-inverse: #0f172a;

  /* Adjust shadows for dark backgrounds */
  --cb-shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.3);
  --cb-shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.3);
  --cb-shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.3);
}
```

Toggle in app:

```typescript
// lib/theme.ts
export function toggleDarkMode() {
  document.documentElement.classList.toggle('dark');
  const isDark = document.documentElement.classList.contains('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

export function initTheme() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (saved === 'dark' || (!saved && prefersDark)) {
    document.documentElement.classList.add('dark');
  }
}
```

---

## Theme Selection Rules

Use this table to determine which theme to apply based on project context:

| Project Context | Theme File | Rationale |
|----------------|------------|-----------|
| Generic SaaS / Startup | `tokens-saas.css` | Neutral, modern default |
| Legal firm app | `tokens-corporate.css` | Conservative, trustworthy |
| Insurance platform | `tokens-corporate.css` | Professional, understated |
| Accounting software | `tokens-corporate.css` | Serif headings, muted palette |
| Healthcare / Medical | `tokens-healthcare.css` | High contrast, accessible targets |
| BotMakers internal / presentation | `tokens-botmakers.css` | Navy + lime brand |
| Daniel's personal app style | `tokens-ledger.css` | Coral, mesh gradients, rounded |
| E-commerce / Consumer | `tokens-saas.css` | Friendly, approachable |
| Nonprofit / Education | `tokens-saas.css` | Clean, accessible |
| Real estate | `tokens-corporate.css` | Professional imagery |
| CRM | `tokens-saas.css` | Data-dense, functional |

---

## Usage Examples

### ✅ Good — Token-based

```tsx
<button className="bg-primary-600 hover:bg-primary-700 text-surface-primary rounded-lg px-4 py-2 shadow-sm transition-all duration-normal">
  Save Changes
</button>

<div className="bg-surface-secondary border border-secondary-200 rounded-xl p-6 shadow-md">
  <h2 className="font-display text-2xl font-semibold text-secondary-900">Dashboard</h2>
</div>
```

### ❌ Bad — Hardcoded

```tsx
<!-- NEVER DO THIS -->
<button className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2">
  Save Changes
</button>

<div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
  <h2 className="font-sans text-2xl font-semibold text-gray-900">Dashboard</h2>
</div>
```

Hardcoded values bypass the theme system and break when switching themes. Always use token-mapped Tailwind classes.
