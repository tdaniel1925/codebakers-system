---
name: Realtime Specialist
tier: features
triggers: realtime, live updates, websocket, presence, online status, live cursor, broadcast, channel, subscription, Supabase Realtime, collaborative, multiplayer, live feed, activity stream
depends_on: database.md, backend.md
conflicts_with: null
prerequisites: null
description: Supabase Realtime channels — presence, live updates, broadcast, connection recovery, collaborative features
code_templates: supabase-realtime-channel.ts
design_tokens: null
---

# Realtime Specialist

## Role

Owns all live data features using Supabase Realtime. Implements database change listeners, presence tracking (who's online), broadcast channels (ephemeral messages), and connection recovery. Ensures real-time features are performant, resilient to disconnects, and don't create excessive database load. Handles everything from simple live feeds to complex collaborative editing.

## When to Use

- Adding live data updates (new items appear without refresh)
- Building presence features (online/offline indicators, active user lists)
- Implementing collaborative features (live cursors, shared editing)
- Creating live activity feeds or notification streams
- Building chat or messaging features
- Adding real-time dashboards with live metrics
- Implementing live search results or filtering
- Any feature where users expect instant updates without polling

## Also Consider

- **Database Specialist** — for optimizing queries that power real-time subscriptions
- **Performance Engineer** — for managing connection overhead and client-side rendering
- **Auth Specialist** — for securing real-time channels with RLS
- **Frontend Engineer** — for UI patterns around live updates (animations, toast notifications)

## Anti-Patterns (NEVER Do)

1. ❌ Subscribe to entire tables — always filter with `.eq()`, `.in()`, or channel-based
2. ❌ Skip connection recovery logic — clients WILL disconnect; handle reconnection gracefully
3. ❌ Use Realtime for data that changes rarely — polling or SWR is better for low-frequency updates
4. ❌ Open unlimited channels — each channel is a WebSocket subscription; limit per client
5. ❌ Put heavy computation in Realtime callbacks — keep handlers fast, defer processing
6. ❌ Forget to unsubscribe on unmount — memory leaks and zombie subscriptions
7. ❌ Trust client-side presence as source of truth — use it for UX hints, not business logic
8. ❌ Send sensitive data via broadcast — broadcast bypasses RLS; use database changes for secure data
9. ❌ Subscribe to Realtime without RLS enabled — data will leak to unauthorized users

## Standards & Patterns

### Three Realtime Modes

```
1. DATABASE CHANGES (Postgres Changes)
   → Listen to INSERT, UPDATE, DELETE on tables
   → Respects RLS policies
   → Best for: live feeds, syncing state, notifications

2. PRESENCE
   → Track who's online, cursor positions, typing indicators
   → Ephemeral (not persisted)
   → Best for: online status, collaborative UX

3. BROADCAST
   → Send arbitrary messages to channel subscribers
   → Ephemeral (not persisted), bypasses RLS
   → Best for: typing indicators, cursor sync, quick signals
```

### Database Changes Pattern
```typescript
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

function useLiveMessages(channelId: string) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    // Initial fetch
    supabase
      .from('messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
      .then(({ data }) => setMessages(data || []));

    // Subscribe to changes
    const channel = supabase
      .channel(`messages:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId]);

  return messages;
}
```

### Presence Pattern
```typescript
function usePresence(roomId: string, currentUser: User) {
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    const channel = supabase.channel(`room:${roomId}`);

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users = Object.values(state).flat() as PresenceUser[];
        setOnlineUsers(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: currentUser.id,
            name: currentUser.name,
            avatar: currentUser.avatar,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [roomId, currentUser.id]);

  return onlineUsers;
}
```

### Broadcast Pattern
```typescript
// Typing indicator via broadcast
function useTypingIndicator(channelId: string, userId: string) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    channelRef.current = supabase
      .channel(`typing:${channelId}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        // Show typing indicator for payload.user_id
      })
      .subscribe();

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [channelId]);

  const sendTyping = useCallback(
    debounce(() => {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'typing',
        payload: { user_id: userId },
      });
    }, 500),
    [userId]
  );

  return sendTyping;
}
```

### Connection Recovery
```typescript
function useRealtimeWithRecovery(channelName: string, handlers: ChannelHandlers) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  useEffect(() => {
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', handlers.config, handlers.callback)
      .subscribe((status, err) => {
        switch (status) {
          case 'SUBSCRIBED':
            setStatus('connected');
            break;
          case 'CHANNEL_ERROR':
          case 'TIMED_OUT':
            setStatus('disconnected');
            // Supabase auto-retries, but show UI indicator
            break;
          case 'CLOSED':
            setStatus('disconnected');
            break;
        }
      });

    return () => supabase.removeChannel(channel);
  }, [channelName]);

  return status;
}
```

### Channel Management
```typescript
// Limit channels per client — max 10 active subscriptions
const MAX_CHANNELS = 10;
const activeChannels = new Map<string, RealtimeChannel>();

function getOrCreateChannel(name: string): RealtimeChannel {
  if (activeChannels.has(name)) return activeChannels.get(name)!;

  if (activeChannels.size >= MAX_CHANNELS) {
    // Remove oldest channel
    const [oldestKey] = activeChannels.keys();
    const oldest = activeChannels.get(oldestKey)!;
    supabase.removeChannel(oldest);
    activeChannels.delete(oldestKey);
  }

  const channel = supabase.channel(name);
  activeChannels.set(name, channel);
  return channel;
}
```

### RLS for Realtime
```sql
-- Realtime respects RLS. Enable it on any table used with Realtime.
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see messages in their channels"
  ON messages FOR SELECT
  USING (
    channel_id IN (
      SELECT channel_id FROM channel_members
      WHERE user_id = auth.uid()
    )
  );
```

## Code Templates

- **`supabase-realtime-channel.ts`** — Reusable hooks for database changes, presence, and broadcast with connection recovery

## Checklist

- [ ] RLS enabled and policies written for all real-time tables
- [ ] Subscriptions filtered (not subscribing to entire tables)
- [ ] Connection status tracked and displayed to user
- [ ] Auto-reconnection handled (Supabase built-in + UI indicator)
- [ ] Cleanup on unmount (`removeChannel` in useEffect return)
- [ ] Channel count limited per client (max 10)
- [ ] Optimistic UI updates paired with real-time confirmations
- [ ] Broadcast used only for ephemeral data (not secure/persistent data)
- [ ] Presence tracked and untracked properly on join/leave
- [ ] Initial data fetched before subscribing to changes (no missed events)
- [ ] Debouncing applied to high-frequency broadcasts (typing, cursors)

## Common Pitfalls

1. **Missing initial load** — Subscribing to changes doesn't give you existing data. Always fetch current state first, then subscribe for updates.
2. **Stale closures** — React hooks with stale state in Realtime callbacks. Use refs or functional state updates (`setItems(prev => [...prev, newItem])`).
3. **Subscription leaks** — Forgetting to call `removeChannel` in cleanup. Each leaked subscription is a persistent WebSocket.
4. **Over-subscribing** — Don't subscribe to every table change. Filter by the specific rows/conditions needed.
5. **Broadcast for sensitive data** — Broadcast doesn't go through RLS. Never send private data through broadcast channels.
6. **Race conditions** — Multiple rapid updates can arrive out of order. Use timestamps or sequence numbers to order events correctly.
