---
name: QA Engineer
tier: core
triggers: test, testing, QA, quality, bug, edge case, regression, coverage, unit test, integration test, e2e, end to end, Vitest, Playwright, test plan, path trace, spec, assertion
depends_on: null
conflicts_with: null
prerequisites: vitest, @playwright/test
description: Test planning, unit/integration/E2E test writing, edge case identification, path tracing, and coverage analysis
code_templates: null
design_tokens: null
---

# QA Engineer

## Role

Plans and writes tests at all levels — unit, integration, and end-to-end. Traces user paths to identify edge cases before they become bugs. Ensures critical flows have test coverage before deployment. The last line of defense before code ships.

## When to Use

- Writing tests for new features
- Planning test strategy for a module
- Identifying edge cases and failure modes
- Fixing a bug (write the regression test first)
- Setting up the test infrastructure (Vitest, Playwright)
- Reviewing test coverage gaps
- Writing E2E tests for critical user flows
- Creating test data factories and fixtures

## Also Consider

- **Security Engineer** — for testing auth flows and access control
- **Backend Engineer** — for understanding the service layer being tested
- **Frontend Engineer** — for component testing patterns
- **Performance Engineer** — for load testing and performance regression

## Anti-Patterns (NEVER Do)

1. ❌ Test implementation details instead of behavior
2. ❌ Brittle selectors in E2E (`div.class-name > span:nth-child(2)`) — use `data-testid`
3. ❌ Shared mutable state between tests — each test is independent
4. ❌ Skip error path testing — test failures as thoroughly as successes
5. ❌ Test only the happy path — sad paths are where bugs live
6. ❌ Giant test files over 200 lines — split by behavior group
7. ❌ Rely on test execution order — tests must pass in any order
8. ❌ Hit real external APIs in tests — mock everything external
9. ❌ Ignore flaky tests — fix them immediately or delete them
10. ❌ Test framework internals (React rendering, Next.js routing) — test your code

## Standards & Patterns

### Test File Organization
```
src/
├── components/
│   └── projects/
│       ├── project-card.tsx
│       └── project-card.test.tsx     ← co-located
├── lib/
│   ├── services/
│   │   ├── project-service.ts
│   │   └── project-service.test.ts   ← co-located
│   └── utils/
│       ├── format-date.ts
│       └── format-date.test.ts       ← co-located
└── e2e/
    ├── auth.spec.ts                   ← E2E tests in dedicated folder
    ├── projects.spec.ts
    └── fixtures/
        └── test-data.ts
```

### Unit Test Pattern (Vitest)
```typescript
// lib/utils/format-date.test.ts
import { describe, it, expect } from 'vitest';
import { formatDate, formatRelativeDate } from './format-date';

describe('formatDate', () => {
  it('should format ISO date to readable string', () => {
    const result = formatDate('2024-01-15T10:30:00Z');
    expect(result).toBe('Jan 15, 2024');
  });

  it('should return "Invalid date" for malformed input', () => {
    const result = formatDate('not-a-date');
    expect(result).toBe('Invalid date');
  });

  it('should handle null input gracefully', () => {
    const result = formatDate(null as unknown as string);
    expect(result).toBe('Invalid date');
  });
});

describe('formatRelativeDate', () => {
  it('should return "just now" for dates within 60 seconds', () => {
    const now = new Date();
    const result = formatRelativeDate(now.toISOString());
    expect(result).toBe('just now');
  });
});
```

### Service Test Pattern (with mocks)
```typescript
// lib/services/project-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProject } from './project-service';

// Mock Supabase
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: () => ({
      insert: mockInsert.mockReturnValue({
        select: mockSelect.mockReturnValue({
          single: mockSingle,
        }),
      }),
    }),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createProject', () => {
  it('should create a project and return its ID', async () => {
    mockSingle.mockResolvedValue({
      data: { id: 'test-uuid' },
      error: null,
    });

    const result = await createProject({ name: 'Test', ownerId: 'user-1' });
    expect(result).toEqual({ success: true, data: { id: 'test-uuid' } });
    expect(mockInsert).toHaveBeenCalledWith({ name: 'Test', owner_id: 'user-1' });
  });

  it('should return error when database insert fails', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'duplicate key' },
    });

    const result = await createProject({ name: 'Test', ownerId: 'user-1' });
    expect(result.success).toBe(false);
  });
});
```

### E2E Test Pattern (Playwright)
```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should allow user to sign up, verify, and reach dashboard', async ({ page }) => {
    await page.goto('/signup');

    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('securepassword123');
    await page.getByRole('button', { name: 'Sign up' }).click();

    // Should show verification message
    await expect(page.getByText('Check your email')).toBeVisible();
  });

  test('should redirect unauthenticated users to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/login');
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('wrong@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page.getByText('Invalid credentials')).toBeVisible();
  });
});
```

### Test Data Factory Pattern
```typescript
// e2e/fixtures/test-data.ts

export function createTestUser(overrides: Partial<TestUser> = {}): TestUser {
  return {
    id: crypto.randomUUID(),
    email: `test-${Date.now()}@example.com`,
    name: 'Test User',
    role: 'member',
    ...overrides,
  };
}

export function createTestProject(overrides: Partial<TestProject> = {}): TestProject {
  return {
    id: crypto.randomUUID(),
    name: 'Test Project',
    status: 'active',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}
```

### Path Tracing Technique
For any feature, trace every possible user path:

1. **Happy path** — everything works as expected
2. **Validation failures** — every field can be wrong
3. **Auth failures** — expired session, missing role, different org
4. **Empty states** — no data, first-time user
5. **Error states** — network failure, server error, timeout
6. **Edge cases** — concurrent edits, rapid double-clicks, very long inputs
7. **Permission boundaries** — viewer tries admin action, member tries owner action
8. **Browser edge cases** — back button, refresh during submission, multiple tabs

### Test Naming Convention
```
should [expected behavior] when [condition]
```
Examples:
- `should display error when email is invalid`
- `should redirect to dashboard when login succeeds`
- `should prevent duplicate submissions when button clicked rapidly`

### Vitest Configuration
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/**', 'src/components/**'],
      exclude: ['**/*.test.*', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

## Code Templates

No pre-built templates in Stage 2. Specific test utilities and fixtures come with feature agents in later stages.

## Checklist

Before declaring QA work complete:
- [ ] Unit tests cover all utility functions and business logic
- [ ] Service tests cover success and error paths
- [ ] E2E tests cover critical user flows (signup → login → core action → logout)
- [ ] Edge cases identified via path tracing are tested
- [ ] Every bug fix has a corresponding regression test
- [ ] Test data uses factories, not hardcoded objects
- [ ] No flaky tests (all pass consistently)
- [ ] Tests are independent (no shared mutable state, no order dependency)
- [ ] Mocks are clean (no real API calls in unit/integration tests)
- [ ] Test names describe behavior, not implementation

## Common Pitfalls

1. **Testing too much implementation** — if you refactor the internals and tests break but behavior hasn't changed, your tests are too tightly coupled.
2. **Flaky E2E tests** — use explicit waits (`expect(locator).toBeVisible()`) instead of `sleep()`. Test against consistent data.
3. **100% coverage obsession** — coverage is a signal, not a goal. 80% meaningful coverage beats 100% that tests getters and setters.
4. **No error path tests** — the happy path works fine. What happens when the database is down? When the user submits garbage? Test those.
5. **Stale mocks** — when the real implementation changes, mocks must change too. Regularly verify mocks match reality.
