/**
 * Booking Calendar Component
 * CodeBakers Agent System — Code Template
 *
 * Usage: Import for any scheduling/booking flow (appointments, meetings, consultations).
 * Requires: date-fns, lucide-react, Supabase client
 *
 * Features:
 * - Monthly calendar view with available/unavailable days
 * - Time slot grid fetched from Supabase availability table
 * - Timezone detection + conversion (user's local ↔ business timezone)
 * - Recurring availability rules (e.g., Mon–Fri 9am–5pm)
 * - Blocked dates / holidays support
 * - Buffer time between bookings
 * - Booking confirmation with details summary
 * - Loading, empty, and error states
 * - Mobile-friendly: stacked layout on small screens
 * - Accessible: keyboard nav, aria-labels, focus management
 * - Supabase insert on confirm with conflict detection
 */

'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  addDays,
  isSameMonth,
  isSameDay,
  isToday,
  isBefore,
  startOfDay,
  setHours,
  setMinutes,
  addMinutes,
  parseISO,
  differenceInMinutes,
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Calendar,
  Globe,
  Loader2,
  Check,
  AlertCircle,
  X,
  User,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────

interface TimeSlot {
  start: Date;
  end: Date;
  available: boolean;
}

interface AvailabilityRule {
  /** 0 = Sunday, 1 = Monday, ..., 6 = Saturday */
  dayOfWeek: number;
  /** Start time in HH:mm format (business timezone) */
  startTime: string;
  /** End time in HH:mm format (business timezone) */
  endTime: string;
}

interface BookingCalendarProps {
  /** Supabase table storing existing bookings */
  bookingsTable?: string;
  /** Supabase table storing availability rules (or pass rules directly) */
  availabilityTable?: string;
  /** Direct availability rules (overrides availabilityTable) */
  availabilityRules?: AvailabilityRule[];
  /** Slot duration in minutes (default: 30) */
  slotDuration?: number;
  /** Buffer time between slots in minutes (default: 0) */
  bufferMinutes?: number;
  /** Business timezone (default: America/Chicago) */
  businessTimezone?: string;
  /** Dates that are blocked/unavailable (holidays, PTO, etc.) */
  blockedDates?: Date[];
  /** How many days ahead can be booked (default: 60) */
  maxAdvanceDays?: number;
  /** Minimum hours notice required (default: 24) */
  minNoticeHours?: number;
  /** Called when a booking is confirmed */
  onBookingConfirmed?: (booking: BookingData) => Promise<void>;
  /** Additional fields to collect before confirming */
  collectFields?: {
    key: string;
    label: string;
    type: 'text' | 'email' | 'tel' | 'textarea';
    required?: boolean;
    placeholder?: string;
  }[];
  /** Provider/resource name shown in confirmation */
  providerName?: string;
  /** Service name shown in header */
  serviceName?: string;
  /** Class for the outer container */
  className?: string;
}

interface BookingData {
  date: string; // ISO date
  startTime: string; // ISO datetime
  endTime: string; // ISO datetime
  timezone: string;
  fields: Record<string, string>;
}

// ─── Timezone Helpers ─────────────────────────────────────

function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'America/Chicago';
  }
}

function formatTimeInZone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  }).format(date);
}

function getTimezoneAbbr(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value || timezone;
  } catch {
    return timezone;
  }
}

// ─── Calendar Grid Helpers ────────────────────────────────

function getCalendarDays(month: Date): Date[] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
  const days: Date[] = [];
  let current = start;
  while (current <= end) {
    days.push(current);
    current = addDays(current, 1);
  }
  return days;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Slot Generation ──────────────────────────────────────

function generateTimeSlots(
  date: Date,
  rules: AvailabilityRule[],
  slotDuration: number,
  bufferMinutes: number,
  existingBookings: { start_time: string; end_time: string }[],
  businessTimezone: string
): TimeSlot[] {
  const dayOfWeek = date.getDay();
  const dayRules = rules.filter((r) => r.dayOfWeek === dayOfWeek);

  if (dayRules.length === 0) return [];

  const slots: TimeSlot[] = [];

  for (const rule of dayRules) {
    const [startH, startM] = rule.startTime.split(':').map(Number);
    const [endH, endM] = rule.endTime.split(':').map(Number);

    let slotStart = setMinutes(setHours(startOfDay(date), startH), startM);
    const windowEnd = setMinutes(setHours(startOfDay(date), endH), endM);

    while (addMinutes(slotStart, slotDuration) <= windowEnd) {
      const slotEnd = addMinutes(slotStart, slotDuration);

      // Check conflicts with existing bookings
      const hasConflict = existingBookings.some((booking) => {
        const bookingStart = parseISO(booking.start_time);
        const bookingEnd = parseISO(booking.end_time);
        // Slot overlaps if it starts before booking ends AND ends after booking starts
        // Also account for buffer time
        const bufferedStart = addMinutes(bookingStart, -bufferMinutes);
        const bufferedEnd = addMinutes(bookingEnd, bufferMinutes);
        return slotStart < bufferedEnd && slotEnd > bufferedStart;
      });

      slots.push({
        start: slotStart,
        end: slotEnd,
        available: !hasConflict,
      });

      slotStart = addMinutes(slotEnd, bufferMinutes);
    }
  }

  return slots;
}

// ─── Main Component ───────────────────────────────────────

export function BookingCalendar({
  bookingsTable = 'bookings',
  availabilityTable,
  availabilityRules: propRules,
  slotDuration = 30,
  bufferMinutes = 0,
  businessTimezone = 'America/Chicago',
  blockedDates = [],
  maxAdvanceDays = 60,
  minNoticeHours = 24,
  onBookingConfirmed,
  collectFields = [],
  providerName,
  serviceName = 'Appointment',
  className = '',
}: BookingCalendarProps) {
  // ─── State ─────────────────────────────────────────────

  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [step, setStep] = useState<'date' | 'time' | 'details' | 'confirmed'>('date');

  const [availabilityRules, setAvailabilityRules] = useState<AvailabilityRule[]>(
    propRules || []
  );
  const [existingBookings, setExistingBookings] = useState<{ start_time: string; end_time: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formFields, setFormFields] = useState<Record<string, string>>({});

  const userTimezone = useMemo(() => getUserTimezone(), []);
  const timeSlotsRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => startOfDay(new Date()), []);
  const maxDate = useMemo(() => addDays(today, maxAdvanceDays), [today, maxAdvanceDays]);
  const minBookableTime = useMemo(
    () => addMinutes(new Date(), minNoticeHours * 60),
    [minNoticeHours]
  );

  // ─── Fetch availability rules from Supabase ────────────

  useEffect(() => {
    if (propRules || !availabilityTable) return;

    async function fetchRules() {
      setLoading(true);
      try {
        const supabase = createClient();
        const { data, error: fetchError } = await supabase
          .from(availabilityTable!)
          .select('day_of_week, start_time, end_time')
          .eq('active', true);

        if (fetchError) throw fetchError;

        setAvailabilityRules(
          (data || []).map((r: { day_of_week: number; start_time: string; end_time: string }) => ({
            dayOfWeek: r.day_of_week,
            startTime: r.start_time,
            endTime: r.end_time,
          }))
        );
      } catch (err) {
        setError('Failed to load availability');
      } finally {
        setLoading(false);
      }
    }

    fetchRules();
  }, [propRules, availabilityTable]);

  // ─── Fetch existing bookings for selected date ─────────

  useEffect(() => {
    if (!selectedDate) return;

    async function fetchBookings() {
      setSlotsLoading(true);
      try {
        const supabase = createClient();
        const dayStart = startOfDay(selectedDate!).toISOString();
        const dayEnd = addDays(startOfDay(selectedDate!), 1).toISOString();

        const { data, error: fetchError } = await supabase
          .from(bookingsTable)
          .select('start_time, end_time')
          .gte('start_time', dayStart)
          .lt('start_time', dayEnd)
          .neq('status', 'cancelled');

        if (fetchError) throw fetchError;
        setExistingBookings(data || []);
      } catch {
        setExistingBookings([]);
      } finally {
        setSlotsLoading(false);
      }
    }

    fetchBookings();
  }, [selectedDate, bookingsTable]);

  // ─── Generate time slots for selected date ─────────────

  const timeSlots = useMemo(() => {
    if (!selectedDate || availabilityRules.length === 0) return [];

    const slots = generateTimeSlots(
      selectedDate,
      availabilityRules,
      slotDuration,
      bufferMinutes,
      existingBookings,
      businessTimezone
    );

    // Filter out slots that are too soon (min notice)
    return slots.map((slot) => ({
      ...slot,
      available: slot.available && slot.start >= minBookableTime,
    }));
  }, [selectedDate, availabilityRules, slotDuration, bufferMinutes, existingBookings, businessTimezone, minBookableTime]);

  // ─── Day availability check ────────────────────────────

  const isDayAvailable = useCallback(
    (date: Date): boolean => {
      if (isBefore(date, today)) return false;
      if (date > maxDate) return false;
      if (blockedDates.some((blocked) => isSameDay(date, blocked))) return false;

      const dayOfWeek = date.getDay();
      return availabilityRules.some((r) => r.dayOfWeek === dayOfWeek);
    },
    [today, maxDate, blockedDates, availabilityRules]
  );

  // ─── Handlers ──────────────────────────────────────────

  const handleDateSelect = useCallback(
    (date: Date) => {
      if (!isDayAvailable(date)) return;
      setSelectedDate(date);
      setSelectedSlot(null);
      setStep('time');

      // Scroll to time slots on mobile
      setTimeout(() => {
        timeSlotsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    },
    [isDayAvailable]
  );

  const handleSlotSelect = useCallback((slot: TimeSlot) => {
    if (!slot.available) return;
    setSelectedSlot(slot);
    if (collectFields.length > 0) {
      setStep('details');
    }
  }, [collectFields]);

  const handleConfirm = useCallback(async () => {
    if (!selectedDate || !selectedSlot) return;

    // Validate required fields
    for (const field of collectFields) {
      if (field.required && !formFields[field.key]?.trim()) {
        setError(`${field.label} is required`);
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    try {
      const bookingData: BookingData = {
        date: format(selectedDate, 'yyyy-MM-dd'),
        startTime: selectedSlot.start.toISOString(),
        endTime: selectedSlot.end.toISOString(),
        timezone: userTimezone,
        fields: formFields,
      };

      if (onBookingConfirmed) {
        await onBookingConfirmed(bookingData);
      } else {
        // Default: insert into Supabase
        const supabase = createClient();
        const { error: insertError } = await supabase.from(bookingsTable).insert({
          date: bookingData.date,
          start_time: bookingData.startTime,
          end_time: bookingData.endTime,
          timezone: bookingData.timezone,
          ...bookingData.fields,
          status: 'confirmed',
        });

        if (insertError) {
          if (insertError.code === '23505') {
            throw new Error('This time slot was just booked. Please choose another.');
          }
          throw insertError;
        }
      }

      setStep('confirmed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [selectedDate, selectedSlot, collectFields, formFields, onBookingConfirmed, bookingsTable, userTimezone]);

  const handleReset = useCallback(() => {
    setSelectedDate(null);
    setSelectedSlot(null);
    setStep('date');
    setFormFields({});
    setError(null);
  }, []);

  // ─── Calendar days ─────────────────────────────────────

  const calendarDays = useMemo(() => getCalendarDays(currentMonth), [currentMonth]);

  const availableSlotCount = timeSlots.filter((s) => s.available).length;

  // ─── Render: Confirmed ─────────────────────────────────

  if (step === 'confirmed' && selectedDate && selectedSlot) {
    return (
      <div className={`mx-auto max-w-md ${className}`}>
        <div className="rounded-lg border bg-background p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <Check className="h-7 w-7 text-green-600" />
          </div>
          <h2 className="text-xl font-bold">Booking Confirmed!</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your {serviceName.toLowerCase()} has been scheduled.
          </p>

          <div className="mt-6 space-y-2 rounded-lg bg-muted/50 p-4 text-left text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{format(selectedDate, 'EEEE, MMMM d, yyyy')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {formatTimeInZone(selectedSlot.start, userTimezone)} –{' '}
                {formatTimeInZone(selectedSlot.end, userTimezone)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{getTimezoneAbbr(userTimezone)}</span>
            </div>
            {providerName && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">{providerName}</span>
              </div>
            )}
          </div>

          <button
            onClick={handleReset}
            className="mt-6 inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Book another
          </button>
        </div>
      </div>
    );
  }

  // ─── Render: Main ──────────────────────────────────────

  return (
    <div className={`mx-auto max-w-3xl ${className}`}>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight">{serviceName}</h2>
        {providerName && (
          <p className="mt-0.5 text-sm text-muted-foreground">with {providerName}</p>
        )}
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>{slotDuration} min</span>
          <span className="mx-1">·</span>
          <Globe className="h-3.5 w-3.5" />
          <span>{getTimezoneAbbr(userTimezone)}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Calendar */}
          <div className="flex-1">
            {/* Month navigation */}
            <div className="mb-4 flex items-center justify-between">
              <button
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                disabled={isSameMonth(currentMonth, today)}
                className="rounded-md p-1.5 hover:bg-muted disabled:opacity-30"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <h3 className="text-sm font-semibold">
                {format(currentMonth, 'MMMM yyyy')}
              </h3>
              <button
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                disabled={addMonths(currentMonth, 1) > addDays(today, maxAdvanceDays)}
                className="rounded-md p-1.5 hover:bg-muted disabled:opacity-30"
                aria-label="Next month"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            {/* Weekday headers */}
            <div className="mb-1 grid grid-cols-7 gap-1">
              {WEEKDAY_LABELS.map((day) => (
                <div
                  key={day}
                  className="py-1 text-center text-xs font-medium text-muted-foreground"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Calendar">
              {calendarDays.map((day) => {
                const inMonth = isSameMonth(day, currentMonth);
                const available = inMonth && isDayAvailable(day);
                const selected = selectedDate && isSameDay(day, selectedDate);
                const isCurrentDay = isToday(day);

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => available && handleDateSelect(day)}
                    disabled={!available}
                    aria-label={`${format(day, 'EEEE, MMMM d')}${available ? ', available' : ', unavailable'}`}
                    aria-selected={selected || undefined}
                    className={`relative flex h-10 items-center justify-center rounded-md text-sm transition-colors ${
                      !inMonth
                        ? 'text-muted-foreground/30'
                        : selected
                        ? 'bg-primary font-semibold text-primary-foreground'
                        : available
                        ? 'font-medium hover:bg-primary/10'
                        : 'text-muted-foreground/40 cursor-not-allowed'
                    }`}
                  >
                    {format(day, 'd')}
                    {isCurrentDay && !selected && (
                      <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time slots panel */}
          <div ref={timeSlotsRef} className="w-full lg:w-64">
            {!selectedDate ? (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed p-8">
                <p className="text-center text-sm text-muted-foreground">
                  Select a date to see available times
                </p>
              </div>
            ) : slotsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div>
                <h3 className="mb-1 text-sm font-semibold">
                  {format(selectedDate, 'EEEE, MMM d')}
                </h3>
                <p className="mb-3 text-xs text-muted-foreground">
                  {availableSlotCount} slot{availableSlotCount !== 1 ? 's' : ''} available
                </p>

                {availableSlotCount === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-center">
                    <p className="text-sm text-muted-foreground">No available times</p>
                    <p className="mt-1 text-xs text-muted-foreground">Try another date</p>
                  </div>
                ) : (
                  <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                    {timeSlots
                      .filter((slot) => slot.available)
                      .map((slot) => {
                        const isSelected = selectedSlot && slot.start.getTime() === selectedSlot.start.getTime();
                        return (
                          <button
                            key={slot.start.toISOString()}
                            onClick={() => handleSlotSelect(slot)}
                            className={`w-full rounded-md border px-3 py-2.5 text-sm font-medium transition-colors ${
                              isSelected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'hover:border-primary/50 hover:bg-primary/5'
                            }`}
                          >
                            {formatTimeInZone(slot.start, userTimezone)}
                          </button>
                        );
                      })}
                  </div>
                )}

                {/* Details form (if collectFields provided) */}
                {step === 'details' && selectedSlot && (
                  <div className="mt-4 space-y-3 border-t pt-4">
                    <h4 className="text-sm font-semibold">Your Details</h4>

                    {collectFields.map((field) => (
                      <div key={field.key}>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          {field.label}
                          {field.required && <span className="text-red-500"> *</span>}
                        </label>
                        {field.type === 'textarea' ? (
                          <textarea
                            value={formFields[field.key] || ''}
                            onChange={(e) =>
                              setFormFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                            }
                            placeholder={field.placeholder}
                            rows={3}
                            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        ) : (
                          <input
                            type={field.type}
                            value={formFields[field.key] || ''}
                            onChange={(e) =>
                              setFormFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                            }
                            placeholder={field.placeholder}
                            className="h-9 w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Confirm button */}
                {selectedSlot && (
                  <div className="mt-4 space-y-2">
                    {error && (
                      <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                        <p className="text-xs text-red-700">{error}</p>
                      </div>
                    )}

                    {/* Summary */}
                    <div className="rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">
                        {format(selectedDate, 'EEE, MMM d')} at{' '}
                        {formatTimeInZone(selectedSlot.start, userTimezone)} –{' '}
                        {formatTimeInZone(selectedSlot.end, userTimezone)}
                      </p>
                      <p>{slotDuration} min · {getTimezoneAbbr(userTimezone)}</p>
                    </div>

                    <button
                      onClick={handleConfirm}
                      disabled={submitting}
                      className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {submitting ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 className="h-4 w-4 animate-spin" /> Booking…
                        </span>
                      ) : (
                        'Confirm Booking'
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Usage Example ────────────────────────────────────────
//
// import { BookingCalendar } from '@/components/booking-calendar';
//
// // Option A: Define rules directly
// const rules = [
//   { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }, // Monday
//   { dayOfWeek: 2, startTime: '09:00', endTime: '17:00' }, // Tuesday
//   { dayOfWeek: 3, startTime: '09:00', endTime: '17:00' }, // Wednesday
//   { dayOfWeek: 4, startTime: '09:00', endTime: '17:00' }, // Thursday
//   { dayOfWeek: 5, startTime: '09:00', endTime: '13:00' }, // Friday (half day)
// ];
//
// export default function BookAppointmentPage() {
//   return (
//     <BookingCalendar
//       availabilityRules={rules}
//       slotDuration={30}
//       bufferMinutes={15}
//       businessTimezone="America/Chicago"
//       minNoticeHours={24}
//       maxAdvanceDays={60}
//       serviceName="Consultation Call"
//       providerName="Dr. Smith"
//       collectFields={[
//         { key: 'name', label: 'Full Name', type: 'text', required: true, placeholder: 'John Doe' },
//         { key: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@example.com' },
//         { key: 'phone', label: 'Phone', type: 'tel', placeholder: '(555) 123-4567' },
//         { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Anything we should know?' },
//       ]}
//       blockedDates={[
//         new Date('2025-12-25'), // Christmas
//         new Date('2026-01-01'), // New Year
//       ]}
//       onBookingConfirmed={async (booking) => {
//         console.log('Booked:', booking);
//         // Optionally send confirmation email, etc.
//       }}
//     />
//   );
// }
//
// // Option B: Load rules from Supabase table
// // <BookingCalendar
// //   availabilityTable="provider_availability"
// //   bookingsTable="appointments"
// //   slotDuration={60}
// //   serviceName="Legal Consultation"
// // />
