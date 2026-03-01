---
name: Notifications Specialist
tier: features
triggers: notifications, alerts, in-app notifications, push notifications, toast, notification preferences, notification center, badge, bell icon, unread count, batching, digest
depends_on: backend.md, frontend.md, realtime.md
conflicts_with: null
prerequisites: null
description: In-app notifications, push, email coordination, user preferences, batching, notification center UI
code_templates: null
design_tokens: null
---

# Notifications Specialist

## Role

Owns the entire notification system across all channels: in-app (bell icon, notification center), push (web push, mobile), and email coordination. Implements notification preferences so users control what they receive. Handles batching and digests to prevent notification fatigue. Builds the notification center UI with read/unread state, grouping, and actions.

## When to Use

- Building a notification center (bell icon, dropdown, full page)
- Adding in-app alerts or toast notifications
- Implementing push notifications (web or mobile)
- Coordinating notifications across email, in-app, and push
- Building notification preference settings
- Implementing notification batching or digest mode
- Adding badge counts or unread indicators
- Creating notification templates for different event types

## Also Consider

- **Email Specialist** — for email notification delivery
- **Realtime Specialist** — for live in-app notification delivery via WebSocket
- **Frontend Engineer** — for toast/alert component design
- **Database Specialist** — for notification query optimization

## Anti-Patterns (NEVER Do)

1. ❌ Send every event as a notification — batch and filter by relevance
2. ❌ Ignore user preferences — always check before sending any non-critical notification
3. ❌ Use polling for in-app notifications — use Supabase Realtime for instant delivery
4. ❌ Store notifications without expiry — implement TTL or archival for old notifications
5. ❌ Send push + email + in-app for the same event without preference check — let users choose channels
6. ❌ Block the UI while marking notifications as read — optimistic updates
7. ❌ Forget to handle notification permission denied (push) — degrade gracefully
8. ❌ Hardcode notification copy — use templates with interpolation

## Standards & Patterns

### Notification Schema
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,          -- 'comment', 'mention', 'payment', 'system'
  title TEXT NOT NULL,
  body TEXT,
  action_url TEXT,             -- where clicking goes
  actor_id UUID,               -- who triggered it (nullable for system)
  entity_type TEXT,            -- 'project', 'invoice', 'task'
  entity_id UUID,
  read_at TIMESTAMPTZ,
  seen_at TIMESTAMPTZ,         -- appeared in dropdown but not clicked
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread
  ON notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX idx_notifications_user_date
  ON notifications(user_id, created_at DESC);
```

### Notification Preferences
```sql
CREATE TABLE notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Per-type channel settings (JSON for flexibility)
  preferences JSONB DEFAULT '{
    "comment":   {"in_app": true, "email": true,  "push": true},
    "mention":   {"in_app": true, "email": true,  "push": true},
    "payment":   {"in_app": true, "email": true,  "push": false},
    "system":    {"in_app": true, "email": false,  "push": false},
    "marketing": {"in_app": false, "email": false, "push": false}
  }',
  digest_mode TEXT DEFAULT 'instant', -- 'instant', 'hourly', 'daily'
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Notification Dispatch
```typescript
interface NotificationPayload {
  userId: string;
  type: string;
  title: string;
  body?: string;
  actionUrl?: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
}

async function sendNotification(payload: NotificationPayload) {
  // 1. Check user preferences
  const prefs = await getUserPreferences(payload.userId);
  const typePrefs = prefs.preferences[payload.type];

  if (!typePrefs) return; // unknown type, skip

  // 2. Check quiet hours
  if (isQuietHours(prefs)) {
    await queueForLater(payload, prefs.quiet_hours_end);
    return;
  }

  // 3. Dispatch to enabled channels
  const promises: Promise<void>[] = [];

  if (typePrefs.in_app) {
    promises.push(createInAppNotification(payload));
  }

  if (typePrefs.email && prefs.digest_mode === 'instant') {
    promises.push(sendEmailNotification(payload));
  } else if (typePrefs.email) {
    promises.push(addToDigest(payload));
  }

  if (typePrefs.push) {
    promises.push(sendPushNotification(payload));
  }

  await Promise.allSettled(promises); // don't fail if one channel errors
}
```

### In-App Notification with Realtime
```typescript
function useNotifications(userId: string) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Initial fetch
  useEffect(() => {
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setNotifications(data || []);
        setUnreadCount(data?.filter((n) => !n.read_at).length || 0);
      });
  }, [userId]);

  // Live updates
  useEffect(() => {
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        setNotifications((prev) => [payload.new as Notification, ...prev]);
        setUnreadCount((prev) => prev + 1);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [userId]);

  const markAsRead = async (id: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id);
  };

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: new Date().toISOString() })));
    setUnreadCount(0);

    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null);
  };

  return { notifications, unreadCount, markAsRead, markAllAsRead };
}
```

### Notification Grouping
```typescript
function groupNotifications(notifications: Notification[]) {
  const groups: Record<string, Notification[]> = {};

  for (const notif of notifications) {
    const date = new Date(notif.created_at);
    const key = isToday(date) ? 'Today'
      : isYesterday(date) ? 'Yesterday'
      : formatDate(date);

    if (!groups[key]) groups[key] = [];
    groups[key].push(notif);
  }

  return groups;
}
```

### Batching / Digest
```typescript
// Cron job: process digest notifications
async function processDigest(frequency: 'hourly' | 'daily') {
  const users = await supabase
    .from('notification_preferences')
    .select('user_id')
    .eq('digest_mode', frequency);

  for (const { user_id } of users.data || []) {
    const pending = await supabase
      .from('notification_digest_queue')
      .select('*')
      .eq('user_id', user_id)
      .eq('sent', false);

    if (pending.data && pending.data.length > 0) {
      await sendDigestEmail(user_id, pending.data);
      await supabase
        .from('notification_digest_queue')
        .update({ sent: true })
        .eq('user_id', user_id)
        .eq('sent', false);
    }
  }
}
```

## Code Templates

No dedicated code template — uses patterns from Realtime and Email specialists combined with the patterns above.

## Checklist

- [ ] Notification table created with proper indexes
- [ ] User preference system implemented with per-type, per-channel controls
- [ ] In-app notifications delivered via Supabase Realtime
- [ ] Unread count badge updates in real-time
- [ ] Mark as read (individual and bulk) works with optimistic updates
- [ ] Notification center UI groups by date
- [ ] Clicking a notification navigates to the relevant entity
- [ ] Quiet hours respected
- [ ] Digest mode batches non-urgent notifications
- [ ] Old notifications archived or deleted (30-90 day TTL)
- [ ] Notification preferences UI accessible in settings
- [ ] Critical notifications (security, billing) bypass preferences
- [ ] Push notification permission requested at appropriate time (not on first visit)

## Common Pitfalls

1. **Notification fatigue** — Too many notifications cause users to disable all. Implement smart batching and relevance filtering.
2. **Permission timing** — Requesting push permission on first page load has ~15% acceptance rate. Wait until user performs a relevant action (~50%+ acceptance).
3. **Stale actor data** — Showing "John commented" when John has since changed their name. Resolve actor names at display time, not creation time.
4. **N+1 queries** — Fetching actor info per notification. Always join or batch-fetch actor data.
5. **Timezone-unaware quiet hours** — Store quiet hours in user's local timezone and convert server-side.
