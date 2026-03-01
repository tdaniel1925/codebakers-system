/**
 * google-calendar-sync.ts
 * Full Google Calendar sync with event CRUD, push notifications,
 * and incremental sync using syncToken.
 *
 * Usage:
 *   import { CalendarSync } from '@/lib/google/calendar-sync';
 *   const sync = new CalendarSync(userId);
 *   await sync.fullSync();
 *   await sync.incrementalSync();
 */

import { google, calendar_v3 } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedClient } from './auth'; // From google-workspace agent

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Types ──────────────────────────────────────────────────────────────────

interface SyncState {
  user_id: string;
  calendar_id: string;
  sync_token: string | null;
  channel_id: string | null;
  channel_expiration: string | null;
  last_full_sync_at: string | null;
}

interface LocalEvent {
  id: string;
  user_id: string;
  google_event_id: string;
  calendar_id: string;
  summary: string;
  description: string | null;
  start_time: string;
  end_time: string;
  is_all_day: boolean;
  location: string | null;
  status: string; // confirmed | tentative | cancelled
  attendees: { email: string; status: string }[];
  meet_link: string | null;
  raw_data: any;
  synced_at: string;
}

// ─── Calendar Sync Class ────────────────────────────────────────────────────

export class CalendarSync {
  private userId: string;
  private calendarId: string;

  constructor(userId: string, calendarId: string = 'primary') {
    this.userId = userId;
    this.calendarId = calendarId;
  }

  /**
   * Full sync — fetches all events and stores syncToken for future incremental syncs.
   * Run this on first connection or when syncToken becomes invalid (410 Gone).
   */
  async fullSync(): Promise<{ eventsCount: number }> {
    const authClient = await getAuthenticatedClient(this.userId);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    const events: calendar_v3.Schema$Event[] = [];
    let pageToken: string | undefined;
    let syncToken: string | undefined;

    // Fetch events from 30 days ago to 365 days ahead
    const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    do {
      const res = await calendar.events.list({
        calendarId: this.calendarId,
        timeMin,
        timeMax,
        singleEvents: true,
        maxResults: 250,
        pageToken,
      });

      events.push(...(res.data.items ?? []));
      pageToken = res.data.nextPageToken ?? undefined;
      syncToken = res.data.nextSyncToken ?? undefined;
    } while (pageToken);

    // Store events
    const localEvents = events.map((e) => this.googleToLocal(e));
    if (localEvents.length > 0) {
      // Upsert in batches of 100
      for (let i = 0; i < localEvents.length; i += 100) {
        const batch = localEvents.slice(i, i + 100);
        await supabase
          .from('calendar_events')
          .upsert(batch, { onConflict: 'user_id,google_event_id' });
      }
    }

    // Store sync state
    await this.updateSyncState({ sync_token: syncToken ?? null, last_full_sync_at: new Date().toISOString() });

    console.log(`[calendar-sync] Full sync for user ${this.userId}: ${events.length} events`);
    return { eventsCount: events.length };
  }

  /**
   * Incremental sync — uses syncToken to fetch only changes since last sync.
   * Falls back to fullSync if syncToken is invalid.
   */
  async incrementalSync(): Promise<{ added: number; updated: number; deleted: number }> {
    const syncState = await this.getSyncState();
    if (!syncState?.sync_token) {
      console.log('[calendar-sync] No sync token, running full sync');
      await this.fullSync();
      return { added: 0, updated: 0, deleted: 0 };
    }

    const authClient = await getAuthenticatedClient(this.userId);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    let stats = { added: 0, updated: 0, deleted: 0 };

    try {
      const events: calendar_v3.Schema$Event[] = [];
      let pageToken: string | undefined;
      let newSyncToken: string | undefined;

      do {
        const res = await calendar.events.list({
          calendarId: this.calendarId,
          syncToken: syncState.sync_token,
          maxResults: 250,
          pageToken,
        });

        events.push(...(res.data.items ?? []));
        pageToken = res.data.nextPageToken ?? undefined;
        newSyncToken = res.data.nextSyncToken ?? undefined;
      } while (pageToken);

      // Process changes
      for (const event of events) {
        if (event.status === 'cancelled') {
          // Deleted event
          await supabase
            .from('calendar_events')
            .update({ status: 'cancelled', synced_at: new Date().toISOString() })
            .eq('user_id', this.userId)
            .eq('google_event_id', event.id);
          stats.deleted++;
        } else {
          // Created or updated
          const localEvent = this.googleToLocal(event);
          const { data: existing } = await supabase
            .from('calendar_events')
            .select('id')
            .eq('user_id', this.userId)
            .eq('google_event_id', event.id!)
            .single();

          await supabase
            .from('calendar_events')
            .upsert(localEvent, { onConflict: 'user_id,google_event_id' });

          if (existing) stats.updated++;
          else stats.added++;
        }
      }

      // Update sync token
      await this.updateSyncState({ sync_token: newSyncToken ?? null });

      console.log(`[calendar-sync] Incremental sync: +${stats.added} ~${stats.updated} -${stats.deleted}`);
    } catch (error: any) {
      if (error?.code === 410) {
        // Sync token expired — do full sync
        console.log('[calendar-sync] Sync token expired (410), running full sync');
        await this.fullSync();
        return { added: 0, updated: 0, deleted: 0 };
      }
      throw error;
    }

    return stats;
  }

  // ─── Push Notifications ─────────────────────────────────────────────────

  /**
   * Set up a push notification channel for real-time calendar changes.
   * Channel expires after 7 days — must be renewed.
   */
  async setupPushNotifications(webhookUrl: string): Promise<{ channelId: string; expiration: string }> {
    const authClient = await getAuthenticatedClient(this.userId);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    const channelId = crypto.randomUUID();
    const expiration = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    const res = await calendar.events.watch({
      calendarId: this.calendarId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: webhookUrl,
        expiration: String(expiration),
      },
    });

    // Store channel info
    await supabase.from('google_calendar_watches').upsert({
      user_id: this.userId,
      calendar_id: this.calendarId,
      channel_id: channelId,
      resource_id: res.data.resourceId,
      expiration: new Date(expiration).toISOString(),
    }, { onConflict: 'user_id,calendar_id' });

    await this.updateSyncState({
      channel_id: channelId,
      channel_expiration: new Date(expiration).toISOString(),
    });

    return { channelId, expiration: new Date(expiration).toISOString() };
  }

  /**
   * Stop push notifications for this calendar.
   */
  async stopPushNotifications(): Promise<void> {
    const { data: watch } = await supabase
      .from('google_calendar_watches')
      .select('*')
      .eq('user_id', this.userId)
      .eq('calendar_id', this.calendarId)
      .single();

    if (!watch) return;

    const authClient = await getAuthenticatedClient(this.userId);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    try {
      await calendar.channels.stop({
        requestBody: { id: watch.channel_id, resourceId: watch.resource_id },
      });
    } catch {
      // Channel may already be expired
    }

    await supabase
      .from('google_calendar_watches')
      .delete()
      .eq('user_id', this.userId)
      .eq('calendar_id', this.calendarId);
  }

  // ─── Event CRUD ─────────────────────────────────────────────────────────

  async createEvent(event: {
    summary: string;
    startTime: Date;
    endTime: Date;
    description?: string;
    attendees?: string[];
    location?: string;
    addMeetLink?: boolean;
  }): Promise<calendar_v3.Schema$Event> {
    const authClient = await getAuthenticatedClient(this.userId);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    const res = await calendar.events.insert({
      calendarId: this.calendarId,
      conferenceDataVersion: event.addMeetLink ? 1 : 0,
      requestBody: {
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.startTime.toISOString() },
        end: { dateTime: event.endTime.toISOString() },
        attendees: event.attendees?.map((email) => ({ email })),
        location: event.location,
        ...(event.addMeetLink && {
          conferenceData: {
            createRequest: {
              requestId: crypto.randomUUID(),
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        }),
      },
    });

    // Store locally
    const localEvent = this.googleToLocal(res.data);
    await supabase.from('calendar_events').upsert(localEvent, { onConflict: 'user_id,google_event_id' });

    return res.data;
  }

  async updateEvent(googleEventId: string, updates: Partial<{
    summary: string;
    startTime: Date;
    endTime: Date;
    description: string;
    location: string;
  }>): Promise<calendar_v3.Schema$Event> {
    const authClient = await getAuthenticatedClient(this.userId);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    const requestBody: any = {};
    if (updates.summary) requestBody.summary = updates.summary;
    if (updates.description) requestBody.description = updates.description;
    if (updates.location) requestBody.location = updates.location;
    if (updates.startTime) requestBody.start = { dateTime: updates.startTime.toISOString() };
    if (updates.endTime) requestBody.end = { dateTime: updates.endTime.toISOString() };

    const res = await calendar.events.patch({
      calendarId: this.calendarId,
      eventId: googleEventId,
      requestBody,
    });

    const localEvent = this.googleToLocal(res.data);
    await supabase.from('calendar_events').upsert(localEvent, { onConflict: 'user_id,google_event_id' });

    return res.data;
  }

  async deleteEvent(googleEventId: string): Promise<void> {
    const authClient = await getAuthenticatedClient(this.userId);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    await calendar.events.delete({ calendarId: this.calendarId, eventId: googleEventId });

    await supabase
      .from('calendar_events')
      .update({ status: 'cancelled', synced_at: new Date().toISOString() })
      .eq('user_id', this.userId)
      .eq('google_event_id', googleEventId);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private googleToLocal(event: calendar_v3.Schema$Event): Omit<LocalEvent, 'id'> {
    const isAllDay = !!event.start?.date;

    return {
      user_id: this.userId,
      google_event_id: event.id!,
      calendar_id: this.calendarId,
      summary: event.summary ?? '(No title)',
      description: event.description ?? null,
      start_time: isAllDay ? event.start!.date! : event.start!.dateTime!,
      end_time: isAllDay ? event.end!.date! : event.end!.dateTime!,
      is_all_day: isAllDay,
      location: event.location ?? null,
      status: event.status ?? 'confirmed',
      attendees: (event.attendees ?? []).map((a) => ({
        email: a.email!,
        status: a.responseStatus ?? 'needsAction',
      })),
      meet_link: event.hangoutLink ?? event.conferenceData?.entryPoints?.[0]?.uri ?? null,
      raw_data: event,
      synced_at: new Date().toISOString(),
    };
  }

  private async getSyncState(): Promise<SyncState | null> {
    const { data } = await supabase
      .from('calendar_sync_state')
      .select('*')
      .eq('user_id', this.userId)
      .eq('calendar_id', this.calendarId)
      .single();
    return data;
  }

  private async updateSyncState(updates: Partial<SyncState>): Promise<void> {
    await supabase.from('calendar_sync_state').upsert({
      user_id: this.userId,
      calendar_id: this.calendarId,
      ...updates,
    }, { onConflict: 'user_id,calendar_id' });
  }
}

// ─── Channel Renewal Cron ───────────────────────────────────────────────────

/**
 * Run daily to renew expiring push notification channels.
 */
export async function renewExpiringChannels(webhookUrl: string) {
  const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data: expiring } = await supabase
    .from('google_calendar_watches')
    .select('user_id, calendar_id')
    .lt('expiration', oneDayFromNow);

  for (const watch of expiring ?? []) {
    try {
      const sync = new CalendarSync(watch.user_id, watch.calendar_id);
      await sync.stopPushNotifications();
      await sync.setupPushNotifications(webhookUrl);
      console.log(`[calendar-sync] Renewed channel for user ${watch.user_id}`);
    } catch (error) {
      console.error(`[calendar-sync] Failed to renew channel for user ${watch.user_id}:`, error);
    }
  }
}

// ─── Database Schema ────────────────────────────────────────────────────────
/*
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_event_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  summary TEXT NOT NULL,
  description TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  is_all_day BOOLEAN NOT NULL DEFAULT false,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  attendees JSONB DEFAULT '[]',
  meet_link TEXT,
  raw_data JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, google_event_id)
);

CREATE INDEX idx_cal_events_user_time ON calendar_events(user_id, start_time);

CREATE TABLE calendar_sync_state (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  sync_token TEXT,
  channel_id TEXT,
  channel_expiration TIMESTAMPTZ,
  last_full_sync_at TIMESTAMPTZ,
  PRIMARY KEY(user_id, calendar_id)
);

CREATE TABLE google_calendar_watches (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  channel_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  expiration TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(user_id, calendar_id)
);
*/
