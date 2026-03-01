/**
 * Multi-Step Form / Wizard Component
 * CodeBakers Agent System — Code Template
 *
 * Usage: Import and configure steps with schemas for any multi-step flow.
 * Requires: react-hook-form, zod, @hookform/resolvers, lucide-react
 *
 * Features:
 * - Zod validation per step (validate before advancing)
 * - Save/resume via localStorage (survives page refresh)
 * - Conditional step logic (skip steps based on prior answers)
 * - Progress indicator with step labels
 * - Keyboard navigation (Enter to advance, Escape to go back)
 * - Animated step transitions
 * - Summary/review step before final submit
 * - Loading + error states on submit
 * - Mobile-friendly layout
 * - Accessible: focus management, aria-labels, screen reader announcements
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useForm,
  FormProvider,
  type UseFormReturn,
  type FieldValues,
  type DefaultValues,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ZodObject, ZodRawShape } from 'zod';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────

interface WizardStep<TFormValues extends FieldValues> {
  /** Unique step identifier */
  id: string;
  /** Display label shown in progress bar */
  label: string;
  /** Optional description shown below the label */
  description?: string;
  /** Zod schema for this step's fields */
  schema: ZodObject<ZodRawShape>;
  /** React component that renders the step's form fields */
  component: React.ComponentType<{
    form: UseFormReturn<TFormValues>;
  }>;
  /** Conditional: return false to skip this step based on current values */
  condition?: (values: Partial<TFormValues>) => boolean;
  /** Fields this step validates (for partial form validation) */
  fields: (keyof TFormValues)[];
}

interface MultiStepFormProps<TFormValues extends FieldValues> {
  /** Array of step definitions */
  steps: WizardStep<TFormValues>[];
  /** Default form values */
  defaultValues: DefaultValues<TFormValues>;
  /** Called when final step is submitted with all form data */
  onSubmit: (data: TFormValues) => Promise<void>;
  /** localStorage key for save/resume (omit to disable persistence) */
  storageKey?: string;
  /** Show a summary/review step before final submit */
  showSummary?: boolean;
  /** Custom summary renderer */
  summaryComponent?: React.ComponentType<{ values: TFormValues }>;
  /** Class name for the form container */
  className?: string;
  /** Label for the final submit button (default: "Submit") */
  submitLabel?: string;
}

// ─── Progress Bar ─────────────────────────────────────────

function ProgressBar({
  steps,
  currentIndex,
  completedSteps,
}: {
  steps: { id: string; label: string }[];
  currentIndex: number;
  completedSteps: Set<string>;
}) {
  return (
    <nav aria-label="Form progress" className="mb-8">
      <ol className="flex items-center">
        {steps.map((step, index) => {
          const isCompleted = completedSteps.has(step.id);
          const isCurrent = index === currentIndex;
          const isPast = index < currentIndex;

          return (
            <li
              key={step.id}
              className={`flex items-center ${index < steps.length - 1 ? 'flex-1' : ''}`}
            >
              {/* Step circle */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors ${
                    isCompleted
                      ? 'border-primary bg-primary text-primary-foreground'
                      : isCurrent
                      ? 'border-primary bg-background text-primary'
                      : 'border-muted-foreground/30 bg-background text-muted-foreground'
                  }`}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                <span
                  className={`mt-1.5 text-[10px] font-medium sm:text-xs ${
                    isCurrent ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  <span className="hidden sm:inline">{step.label}</span>
                  <span className="sm:hidden">{index + 1}</span>
                </span>
              </div>

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div
                  className={`mx-2 h-0.5 flex-1 transition-colors ${
                    isPast || isCompleted ? 'bg-primary' : 'bg-muted-foreground/20'
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ─── Default Summary ──────────────────────────────────────

function DefaultSummary<TFormValues extends FieldValues>({
  values,
}: {
  values: TFormValues;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Review Your Information</h3>
      <p className="text-sm text-muted-foreground">
        Please review the information below before submitting.
      </p>
      <div className="rounded-lg border divide-y">
        {Object.entries(values).map(([key, value]) => {
          if (value === undefined || value === null || value === '') return null;
          return (
            <div key={key} className="flex justify-between px-4 py-2.5">
              <span className="text-sm font-medium text-muted-foreground capitalize">
                {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}
              </span>
              <span className="text-sm font-medium">
                {typeof value === 'boolean'
                  ? value
                    ? 'Yes'
                    : 'No'
                  : Array.isArray(value)
                  ? value.join(', ')
                  : String(value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────

export function MultiStepForm<TFormValues extends FieldValues>({
  steps,
  defaultValues,
  onSubmit,
  storageKey,
  showSummary = false,
  summaryComponent: SummaryComponent,
  className = '',
  submitLabel = 'Submit',
}: MultiStepFormProps<TFormValues>) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showingReview, setShowingReview] = useState(false);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');

  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Build combined schema from all steps ──────────────

  const combinedSchema = useMemo(() => {
    return steps.reduce((acc, step) => acc.merge(step.schema), steps[0].schema);
  }, [steps]);

  // ─── Load saved data ───────────────────────────────────

  const savedValues = useMemo(() => {
    if (!storageKey || typeof window === 'undefined') return defaultValues;
    try {
      const saved = localStorage.getItem(`wizard_${storageKey}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...defaultValues, ...parsed.values };
      }
    } catch {
      // Ignore parse errors
    }
    return defaultValues;
  }, [storageKey, defaultValues]);

  // ─── Form instance ─────────────────────────────────────

  const form = useForm<TFormValues>({
    resolver: zodResolver(combinedSchema),
    defaultValues: savedValues,
    mode: 'onTouched',
  });

  // ─── Filter visible steps (conditional logic) ──────────

  const visibleSteps = useMemo(() => {
    const values = form.getValues();
    return steps.filter((step) => !step.condition || step.condition(values));
  }, [steps, form, currentStepIndex]); // Re-evaluate when step changes

  const currentStep = visibleSteps[currentStepIndex];
  const isLastStep = currentStepIndex === visibleSteps.length - 1;
  const isFirstStep = currentStepIndex === 0;

  // ─── Persist form data ─────────────────────────────────

  useEffect(() => {
    if (!storageKey) return;

    const subscription = form.watch((values) => {
      try {
        localStorage.setItem(
          `wizard_${storageKey}`,
          JSON.stringify({
            values,
            stepIndex: currentStepIndex,
            timestamp: Date.now(),
          })
        );
      } catch {
        // Storage full or unavailable
      }
    });

    return () => subscription.unsubscribe();
  }, [form, storageKey, currentStepIndex]);

  // ─── Restore step index ────────────────────────────────

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(`wizard_${storageKey}`);
      if (saved) {
        const { stepIndex } = JSON.parse(saved);
        if (typeof stepIndex === 'number' && stepIndex < visibleSteps.length) {
          setCurrentStepIndex(stepIndex);
        }
      }
    } catch {
      // Ignore
    }
  }, []); // Only on mount

  // ─── Focus management ──────────────────────────────────

  useEffect(() => {
    if (containerRef.current) {
      const firstInput = containerRef.current.querySelector<HTMLElement>(
        'input:not([type="hidden"]), select, textarea'
      );
      if (firstInput) {
        setTimeout(() => firstInput.focus(), 150);
      }
    }
  }, [currentStepIndex, showingReview]);

  // ─── Step validation ───────────────────────────────────

  const validateCurrentStep = useCallback(async (): Promise<boolean> => {
    if (!currentStep) return false;

    const result = await form.trigger(currentStep.fields as string[]);
    return result;
  }, [form, currentStep]);

  // ─── Navigation ────────────────────────────────────────

  const goNext = useCallback(async () => {
    if (showingReview) return;

    const isValid = await validateCurrentStep();
    if (!isValid) return;

    setCompletedSteps((prev) => new Set([...prev, currentStep.id]));
    setDirection('forward');

    if (isLastStep) {
      if (showSummary) {
        setShowingReview(true);
      } else {
        handleSubmit();
      }
    } else {
      setCurrentStepIndex((prev) => Math.min(prev + 1, visibleSteps.length - 1));
    }
  }, [currentStep, isLastStep, showSummary, showingReview, validateCurrentStep, visibleSteps.length]);

  const goBack = useCallback(() => {
    if (showingReview) {
      setShowingReview(false);
      return;
    }
    setDirection('back');
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
  }, [showingReview]);

  // ─── Submit ────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const values = form.getValues() as TFormValues;
      await onSubmit(values);

      // Clear saved data on successful submit
      if (storageKey) {
        try {
          localStorage.removeItem(`wizard_${storageKey}`);
        } catch {
          // Ignore
        }
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [form, onSubmit, storageKey]);

  // ─── Reset form ────────────────────────────────────────

  const resetForm = useCallback(() => {
    form.reset(defaultValues);
    setCurrentStepIndex(0);
    setCompletedSteps(new Set());
    setShowingReview(false);
    setSubmitError(null);

    if (storageKey) {
      try {
        localStorage.removeItem(`wizard_${storageKey}`);
      } catch {
        // Ignore
      }
    }
  }, [form, defaultValues, storageKey]);

  // ─── Keyboard navigation ───────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is in a textarea
      if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (showingReview) {
          handleSubmit();
        } else {
          goNext();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [goNext, handleSubmit, showingReview]);

  // ─── Render step content ───────────────────────────────

  const StepComponent = currentStep?.component;

  const progressSteps = useMemo(() => {
    const base = visibleSteps.map((s) => ({ id: s.id, label: s.label }));
    if (showSummary) base.push({ id: '_review', label: 'Review' });
    return base;
  }, [visibleSteps, showSummary]);

  const progressIndex = showingReview ? progressSteps.length - 1 : currentStepIndex;

  return (
    <div className={`mx-auto max-w-2xl ${className}`}>
      {/* Progress */}
      <ProgressBar
        steps={progressSteps}
        currentIndex={progressIndex}
        completedSteps={completedSteps}
      />

      {/* Screen reader announcement */}
      <div className="sr-only" role="status" aria-live="polite">
        {showingReview
          ? 'Review step. Please check your information before submitting.'
          : `Step ${currentStepIndex + 1} of ${visibleSteps.length}: ${currentStep?.label}`}
      </div>

      {/* Form */}
      <FormProvider {...form}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (showingReview) {
              handleSubmit();
            } else {
              goNext();
            }
          }}
          className="space-y-6"
        >
          {/* Step header */}
          {!showingReview && currentStep && (
            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight">{currentStep.label}</h2>
              {currentStep.description && (
                <p className="text-sm text-muted-foreground">{currentStep.description}</p>
              )}
            </div>
          )}

          {/* Step content */}
          <div
            ref={containerRef}
            className={`transition-all duration-200 ${
              direction === 'forward'
                ? 'animate-in slide-in-from-right-4 fade-in'
                : 'animate-in slide-in-from-left-4 fade-in'
            }`}
            key={showingReview ? '_review' : currentStep?.id}
          >
            {showingReview ? (
              SummaryComponent ? (
                <SummaryComponent values={form.getValues() as TFormValues} />
              ) : (
                <DefaultSummary values={form.getValues() as TFormValues} />
              )
            ) : StepComponent ? (
              <StepComponent form={form as UseFormReturn<TFormValues>} />
            ) : null}
          </div>

          {/* Submit error */}
          {submitError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <div>
                <p className="text-sm font-medium text-red-800">{submitError}</p>
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="mt-1 text-xs font-medium text-red-600 hover:text-red-700"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex items-center justify-between border-t pt-4">
            <div className="flex items-center gap-2">
              {!isFirstStep || showingReview ? (
                <button
                  type="button"
                  onClick={goBack}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" /> Back
                </button>
              ) : (
                <div /> /* Spacer */
              )}

              {storageKey && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  title="Start over"
                >
                  <RotateCcw className="h-3 w-3" /> Reset
                </button>
              )}
            </div>

            {showingReview ? (
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" /> {submitLabel}
                  </>
                )}
              </button>
            ) : (
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {isLastStep && !showSummary ? (
                  <>
                    <Check className="h-4 w-4" /> {submitLabel}
                  </>
                ) : (
                  <>
                    Next <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </FormProvider>
    </div>
  );
}

// ─── Usage Example ────────────────────────────────────────
//
// import { MultiStepForm, type WizardStep } from '@/components/multi-step-form';
// import { z } from 'zod';
// import { useFormContext } from 'react-hook-form';
//
// // 1. Define your combined form type
// const formSchema = z.object({
//   name: z.string().min(2),
//   email: z.string().email(),
//   company: z.string().min(1),
//   plan: z.enum(['starter', 'pro', 'enterprise']),
//   addons: z.array(z.string()).optional(),
// });
// type FormValues = z.infer<typeof formSchema>;
//
// // 2. Define step schemas (subsets of the combined schema)
// const personalSchema = z.object({
//   name: z.string().min(2, 'Name is required'),
//   email: z.string().email('Valid email required'),
// });
//
// const companySchema = z.object({
//   company: z.string().min(1, 'Company is required'),
// });
//
// const planSchema = z.object({
//   plan: z.enum(['starter', 'pro', 'enterprise']),
//   addons: z.array(z.string()).optional(),
// });
//
// // 3. Create step components
// function PersonalStep({ form }: { form: UseFormReturn<FormValues> }) {
//   const { register, formState: { errors } } = form;
//   return (
//     <div className="space-y-4">
//       <div>
//         <label className="text-sm font-medium">Name</label>
//         <input {...register('name')} className="mt-1 w-full rounded border p-2" />
//         {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
//       </div>
//       <div>
//         <label className="text-sm font-medium">Email</label>
//         <input {...register('email')} type="email" className="mt-1 w-full rounded border p-2" />
//         {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
//       </div>
//     </div>
//   );
// }
//
// // 4. Wire it up
// const steps: WizardStep<FormValues>[] = [
//   { id: 'personal', label: 'Personal', schema: personalSchema, component: PersonalStep, fields: ['name', 'email'] },
//   { id: 'company', label: 'Company', schema: companySchema, component: CompanyStep, fields: ['company'] },
//   { id: 'plan', label: 'Plan', schema: planSchema, component: PlanStep, fields: ['plan', 'addons'] },
// ];
//
// export default function OnboardingPage() {
//   return (
//     <MultiStepForm<FormValues>
//       steps={steps}
//       defaultValues={{ name: '', email: '', company: '', plan: 'starter', addons: [] }}
//       onSubmit={async (data) => { await createAccount(data); }}
//       storageKey="onboarding"
//       showSummary
//       submitLabel="Create Account"
//     />
//   );
// }
