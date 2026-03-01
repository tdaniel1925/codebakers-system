---
name: Scheduling & Calendar Specialist
tier: features
triggers: scheduling, calendar, booking, appointment, availability, time slots, recurring, timezone, date picker, time picker, booking widget, schedule
depends_on: database.md, backend.md, frontend.md
conflicts_with: null
prerequisites: null
description: Date/time handling, availability calendars, booking systems, recurring events, timezone management
code_templates: booking-calendar.tsx
design_tokens: null
---

# Scheduling & Calendar Specialist

## Role

Owns all date/time logic, availability management, booking systems, and calendar features. Implements timezone-safe scheduling, recurring event patterns, availability windows, conflict detection, and booking flows with confirmation/cancellation. Handles the notoriously tricky aspects of time: DST transitions, cross-timezone coordination, and recurring event edge cases.

## When to Use

- Building booking/appointment scheduling systems
- Implementing availability calendars (set available hours)
- Creating recurring events (daily, weekly, monthly, custom)
- Adding date/time pickers to forms
- Building calendar views (day, week, month)
- Handling timezone conversion and display
- Implementing scheduling conflict detection
- Building "find available time" algorithms

## Also Consider

- **Frontend Engineer** — for calendar UI components
- **Database Specialist** — for date/time query optimization
- **Notifications Specialist** — for appointment reminders
- **Email Specialist** — for booking confirmation emails
- **Google Workspace Integration** — for Google Calendar sync

## Anti-Patterns (NEVER Do)

1. ❌ Store dates without timezone info — always use `TIMESTAMPTZ` in Postgres
2. ❌ Do timezone math in JavaScript alone — use `date-fns-tz` or `luxon`
3. ❌ Assume all months have 30 days — use proper date libraries
4. ❌ Store recurring events as individual rows — store the pattern, generate instances
5. ❌ Skip conflict detection on booking — always check availability before confirming
6. ❌ Display times without user's timezone — always convert to local time for display
7. ❌ Use `new Date()` string parsing — it's inconsistent across browsers; use `parseISO`
8. ❌ Ignore DST transitions — a "2am daily" event doesn't exist on spring-forward day
9. ❌ Allow double-booking without explicit override — default to conflict prevention

## Standards & Patterns

### Core Schema
```sql
-- Availability windows (business hours)
CREATE TABLE availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL, -- 0=Sunday, 6=Saturday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  is_active BOOLEAN DEFAULT TRUE,
  CONSTRAINT valid_time_range CHECK (start_time < end_time)
);

-- Bookings
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES auth.users(id) NOT NULL,
  client_id UUID REFERENCES auth.users(id),
  client_name TEXT,
  client_email TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'confirmed', -- confirmed, cancelled, completed, no_show
  type TEXT NOT NULL, -- 'consultation', 'follow-up', etc.
  notes TEXT,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_booking_range CHECK (starts_at < ends_at),
  CONSTRAINT no_zero_duration CHECK (ends_at - starts_at >= INTERVAL '15 minutes')
);

CREATE INDEX idx_bookings_provider_time ON bookings(provider_id, starts_at, ends_at);

-- Recurring events
CREATE TABLE recurring_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  rrule TEXT NOT NULL,           -- iCal RRULE format
  duration_minutes INTEGER NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL, -- first occurrence
  ends_at TIMESTAMPTZ,           -- recurrence end (null = forever)
  timezone TEXT NOT NULL,
  exceptions TIMESTAMPTZ[],      -- dates to skip
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Date overrides (block specific dates or change hours)
CREATE TABLE availability_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  is_available BOOLEAN DEFAULT FALSE, -- false = blocked
  start_time TIME,
  end_time TIME,
  reason TEXT
);
```

### Available Slots Algorithm
```typescript
import { eachMinuteOfInterval, isWithinInterval, areIntervalsOverlapping } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';

interface TimeSlot {
  start: Date;
  end: Date;
}

async function getAvailableSlots(
  providerId: string,
  date: Date,
  duration: number = 30, // minutes
  timezone: string = 'America/Chicago'
): Promise<TimeSlot[]> {
  const dayOfWeek = date.getDay();

  // 1. Get base availability for this day
  const { data: availability } = await supabase
    .from('availability')
    .select('*')
    .eq('user_id', providerId)
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true);

  if (!availability?.length) return [];

  // 2. Check for date overrides
  const { data: overrides } = await supabase
    .from('availability_overrides')
    .select('*')
    .eq('user_id', providerId)
    .eq('date', date.toISOString().split('T')[0]);

  if (overrides?.[0]?.is_available === false) return []; // blocked day

  // 3. Get existing bookings for the day
  const dayStart = zonedTimeToUtc(startOfDay(date), timezone);
  const dayEnd = zonedTimeToUtc(endOfDay(date), timezone);

  const { data: bookings } = await supabase
    .from('bookings')
    .select('starts_at, ends_at')
    .eq('provider_id', providerId)
    .neq('status', 'cancelled')
    .gte('starts_at', dayStart.toISOString())
    .lte('starts_at', dayEnd.toISOString());

  // 4. Generate slots from availability windows
  const slots: TimeSlot[] = [];

  for (const window of availability) {
    const windowStart = /* combine date + window.start_time in timezone */;
    const windowEnd = /* combine date + window.end_time in timezone */;

    let slotStart = windowStart;
    while (slotStart < windowEnd) {
      const slotEnd = addMinutes(slotStart, duration);
      if (slotEnd > windowEnd) break;

      // Check for conflicts with existing bookings
      const hasConflict = bookings?.some((b) =>
        areIntervalsOverlapping(
          { start: slotStart, end: slotEnd },
          { start: new Date(b.starts_at), end: new Date(b.ends_at) }
        )
      );

      if (!hasConflict) {
        slots.push({ start: slotStart, end: slotEnd });
      }

      slotStart = addMinutes(slotStart, duration); // or use buffer between slots
    }
  }

  return slots;
}
```

### Booking Flow
```typescript
async function createBooking(params: CreateBookingParams) {
  // 1. Validate slot is still available (race condition protection)
  const { data: conflicts } = await supabase
    .from('bookings')
    .select('id')
    .eq('provider_id', params.providerId)
    .neq('status', 'cancelled')
    .lt('starts_at', params.endsAt)
    .gt('ends_at', params.startsAt);

  if (conflicts && conflicts.length > 0) {
    throw new Error('This time slot is no longer available');
  }

  // 2. Create booking
  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      provider_id: params.providerId,
      client_id: params.clientId,
      client_email: params.clientEmail,
      starts_at: params.startsAt,
      ends_at: params.endsAt,
      type: params.type,
      status: 'confirmed',
    })
    .select()
    .single();

  if (error) throw error;

  // 3. Send confirmations
  await Promise.allSettled([
    sendBookingConfirmation(booking, 'client'),
    sendBookingConfirmation(booking, 'provider'),
    scheduleReminder(booking, 24 * 60), // 24hr before
    scheduleReminder(booking, 60),       // 1hr before
  ]);

  return booking;
}
```

### Timezone Display
```typescript
// Always store in UTC, display in user's timezone
function formatBookingTime(utcDate: string, timezone: string) {
  const zonedDate = utcToZonedTime(new Date(utcDate), timezone);
  return format(zonedDate, 'EEEE, MMMM d · h:mm a', { timeZone: timezone });
}

// Show timezone abbreviation when relevant
function formatWithTimezone(utcDate: string, timezone: string) {
  const zonedDate = utcToZonedTime(new Date(utcDate), timezone);
  return `${format(zonedDate, 'h:mm a')} ${formatInTimeZone(utcDate, timezone, 'zzz')}`;
}
```

### Recurring Event Generation (iCal RRULE)
```typescript
import { RRule } from 'rrule';

function generateOccurrences(event: RecurringEvent, rangeStart: Date, rangeEnd: Date) {
  const rule = RRule.fromString(event.rrule);
  const occurrences = rule.between(rangeStart, rangeEnd);

  return occurrences
    .filter((date) => !event.exceptions?.includes(date.toISOString()))
    .map((date) => ({
      start: date,
      end: addMinutes(date, event.duration_minutes),
      title: event.title,
      recurring_event_id: event.id,
    }));
}
```

## Code Templates

- **`booking-calendar.tsx`** — Interactive booking calendar with availability display, slot selection, and booking confirmation flow

## Checklist

- [ ] All dates stored as `TIMESTAMPTZ` in UTC
- [ ] Timezone stored per user/resource
- [ ] Availability windows configured per day of week
- [ ] Date override support (block days, custom hours)
- [ ] Conflict detection prevents double-booking
- [ ] Available slots algorithm considers bookings + overrides
- [ ] Booking confirmation sent to both parties
- [ ] Cancellation flow with reason and notification
- [ ] Reminders scheduled (24h, 1h before)
- [ ] Timezone displayed correctly for all users
- [ ] Recurring events use RRULE format with exception support
- [ ] Buffer time between appointments configurable
- [ ] Past dates not bookable

## Common Pitfalls

1. **Race condition on booking** — Two users can see the same slot available. Use database-level conflict detection (unique constraint or check before insert within a transaction).
2. **DST time shifts** — "9am every Monday" might shift by an hour during DST. Store recurring events with timezone and regenerate instances considering DST.
3. **Timezone confusion** — Server time ≠ user time. Always convert at the display layer, never store in local time.
4. **Recurring event exceptions** — Deleting one occurrence of a recurring event requires an exception list, not deleting the whole pattern.
5. **Calendar grid rendering** — Months start on different days. Use `startOfWeek` and `endOfWeek` to properly pad calendar grids.
