---
name: Forms & Wizards Specialist
tier: features
triggers: form, wizard, multi-step, stepper, form validation, conditional logic, save draft, resume, form builder, input, field, zod, react-hook-form
depends_on: frontend.md, backend.md
conflicts_with: null
prerequisites: null
description: Multi-step forms, save/resume drafts, conditional logic, per-step validation, form wizards with progress
code_templates: multi-step-form.tsx
design_tokens: null
---

# Forms & Wizards Specialist

## Role

Owns all form implementations from simple contact forms to complex multi-step wizards. Implements form state management with react-hook-form, Zod validation (per-field and per-step), conditional logic (show/hide fields based on answers), draft save/resume, file uploads within forms, and accessible error handling. Builds forms that are fast, forgiving, and never lose user data.

## When to Use

- Building any form with more than 3 fields
- Creating multi-step wizards or onboarding flows
- Implementing conditional/dynamic forms (fields depend on other fields)
- Adding save-as-draft with resume later
- Building form validation (client + server)
- Creating form builders or configurable forms
- Implementing complex field types (phone, address, date range)
- Any flow where user input is critical and loss is unacceptable

## Also Consider

- **Frontend Engineer** — for component design and responsive layout
- **UX Engineer** — for error messaging, focus management, accessibility
- **Database Specialist** — for draft storage and form data schema
- **File & Media Specialist** — for file upload fields within forms
- **Backend Engineer** — for server-side validation and processing

## Anti-Patterns (NEVER Do)

1. ❌ Validate only on submit — validate on blur for instant feedback
2. ❌ Show all errors at once at the top — show inline, next to the field
3. ❌ Clear the entire form on validation error — preserve all input
4. ❌ Use uncontrolled forms for complex logic — use react-hook-form
5. ❌ Skip server-side validation — client validation is for UX, server validation is for security
6. ❌ Lose data on page refresh — auto-save drafts for multi-step forms
7. ❌ Use `alert()` for validation errors — inline errors only
8. ❌ Require all fields upfront — progressive disclosure, ask only what's needed per step
9. ❌ Forget focus management — move focus to first error on submit failure
10. ❌ Build custom form state management — use react-hook-form + zod, always

## Standards & Patterns

### Tech Stack
```
react-hook-form  → form state management
zod              → schema validation
@hookform/resolvers/zod → connects them
```

### Basic Form Pattern
```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().regex(/^\+?[\d\s-()]+$/, 'Invalid phone number').optional(),
  message: z.string().min(10, 'Message must be at least 10 characters').max(1000),
});

type FormData = z.infer<typeof schema>;

function ContactForm() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: 'onBlur', // validate on blur
  });

  const onSubmit = async (data: FormData) => {
    const result = await submitForm(data);
    if (result.error) {
      // Server-side validation errors
      setError('email', { message: result.error });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Field label="Name" error={errors.name?.message}>
        <input {...register('name')} />
      </Field>
      <Field label="Email" error={errors.email?.message}>
        <input type="email" {...register('email')} />
      </Field>
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Sending...' : 'Send'}
      </button>
    </form>
  );
}
```

### Multi-Step Wizard
```typescript
const STEPS = [
  { id: 'personal', title: 'Personal Info', schema: personalSchema },
  { id: 'business', title: 'Business Details', schema: businessSchema },
  { id: 'preferences', title: 'Preferences', schema: preferencesSchema },
  { id: 'review', title: 'Review & Submit', schema: z.object({}) },
] as const;

function MultiStepForm() {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Partial<FullFormData>>({});

  const step = STEPS[currentStep];

  const form = useForm({
    resolver: zodResolver(step.schema),
    defaultValues: formData, // restore data when navigating back
    mode: 'onBlur',
  });

  const handleNext = async (stepData: any) => {
    const merged = { ...formData, ...stepData };
    setFormData(merged);

    // Auto-save draft
    await saveDraft(merged, currentStep);

    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      await submitFinalForm(merged);
    }
  };

  const handleBack = () => {
    setFormData({ ...formData, ...form.getValues() });
    setCurrentStep((s) => Math.max(0, s - 1));
  };

  return (
    <div>
      <StepIndicator steps={STEPS} currentStep={currentStep} />
      <form onSubmit={form.handleSubmit(handleNext)}>
        {currentStep === 0 && <PersonalInfoFields form={form} />}
        {currentStep === 1 && <BusinessFields form={form} />}
        {currentStep === 2 && <PreferencesFields form={form} />}
        {currentStep === 3 && <ReviewStep data={formData} />}

        <div className="flex justify-between mt-6">
          {currentStep > 0 && (
            <button type="button" onClick={handleBack}>Back</button>
          )}
          <button type="submit">
            {currentStep === STEPS.length - 1 ? 'Submit' : 'Next'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

### Step Indicator Component
```tsx
function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <nav aria-label="Form progress">
      <ol className="flex items-center gap-2">
        {steps.map((step, index) => (
          <li key={step.id} className="flex items-center">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm
              ${index < currentStep ? 'bg-green-500 text-white' : ''}
              ${index === currentStep ? 'bg-accent text-white' : ''}
              ${index > currentStep ? 'bg-muted text-muted-foreground' : ''}`}
            >
              {index < currentStep ? '✓' : index + 1}
            </div>
            <span className="ml-2 text-sm hidden sm:inline">{step.title}</span>
            {index < steps.length - 1 && (
              <div className={`w-8 h-px mx-2 ${index < currentStep ? 'bg-green-500' : 'bg-border'}`} />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
```

### Conditional Logic
```typescript
// Watch fields to show/hide others
function DynamicForm() {
  const form = useForm({ resolver: zodResolver(schema) });
  const accountType = form.watch('accountType');
  const hasCompany = form.watch('hasCompany');

  return (
    <form>
      <SelectField {...form.register('accountType')} options={['personal', 'business']} />

      {accountType === 'business' && (
        <>
          <Field label="Company Name">
            <input {...form.register('companyName')} />
          </Field>
          <Field label="Tax ID">
            <input {...form.register('taxId')} />
          </Field>
        </>
      )}

      {accountType === 'personal' && (
        <CheckboxField {...form.register('hasCompany')} label="I also have a business" />
      )}

      {hasCompany && accountType === 'personal' && (
        <Field label="Company Name (optional)">
          <input {...form.register('companyName')} />
        </Field>
      )}
    </form>
  );
}
```

### Draft Save/Resume
```typescript
const DRAFT_KEY = (formId: string, userId: string) => `form_draft:${formId}:${userId}`;

async function saveDraft(formId: string, userId: string, data: any, step: number) {
  await supabase.from('form_drafts').upsert({
    form_id: formId,
    user_id: userId,
    data,
    current_step: step,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'form_id,user_id' });
}

async function loadDraft(formId: string, userId: string) {
  const { data } = await supabase
    .from('form_drafts')
    .select('data, current_step')
    .eq('form_id', formId)
    .eq('user_id', userId)
    .single();
  return data;
}

async function deleteDraft(formId: string, userId: string) {
  await supabase
    .from('form_drafts')
    .delete()
    .eq('form_id', formId)
    .eq('user_id', userId);
}
```

### Accessible Error Handling
```tsx
function Field({ label, error, children, required }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1" aria-hidden>*</span>}
      </label>
      {React.cloneElement(children, {
        id,
        'aria-invalid': !!error,
        'aria-describedby': error ? errorId : undefined,
        'aria-required': required,
        className: `${children.props.className || ''} ${error ? 'border-destructive' : ''}`,
      })}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
```

### Focus Management on Error
```typescript
// Move focus to first error on submit failure
const onSubmit = handleSubmit(
  (data) => { /* success */ },
  (errors) => {
    const firstErrorField = Object.keys(errors)[0];
    const el = document.querySelector(`[name="${firstErrorField}"]`);
    el?.focus();
  }
);
```

## Code Templates

- **`multi-step-form.tsx`** — Complete multi-step wizard with per-step validation, draft save/resume, step indicator, conditional fields, and review step

## Checklist

- [ ] react-hook-form + zod used for all forms
- [ ] Validation on blur (not just submit)
- [ ] Inline error messages next to each field
- [ ] Focus moves to first error on submit failure
- [ ] Server-side validation mirrors client-side schema
- [ ] Multi-step forms save drafts automatically
- [ ] "Resume where you left off" works after page refresh
- [ ] Conditional fields only validate when visible
- [ ] Step indicator shows progress and allows back-navigation
- [ ] Submit button shows loading state and prevents double-submit
- [ ] `aria-invalid`, `aria-describedby`, `aria-required` set on all fields
- [ ] `noValidate` on `<form>` to use custom validation UI
- [ ] Required fields marked visually and semantically
- [ ] Form data preserved on validation error (never cleared)

## Common Pitfalls

1. **Zod schema mismatch with conditional fields** — Use `.optional()` or `.refine()` for conditionally required fields. A field hidden by conditional logic shouldn't fail validation.
2. **Re-renders on every keystroke** — Use `mode: 'onBlur'` instead of `mode: 'onChange'` unless real-time validation is specifically needed.
3. **Lost data on back-navigation** — When going back in a wizard, restore form values from the merged data state, not defaults.
4. **Draft conflicts** — If a user has the same form open in two tabs, the last save wins. Show a warning if draft is newer than expected.
5. **Submit before form mounts** — Ensure the form's `handleSubmit` is ready. Disable the submit button until the form is fully mounted and validated.
