/**
 * Supabase Realtime Channel
 * CodeBakers Agent System — Code Template
 *
 * Usage: Copy patterns to your realtime features
 * Requires: @supabase/supabase-js (already in project)
 *
 * Covers: Database changes, Broadcast messages, Presence tracking,
 * connection recovery, and React hooks.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient, RealtimeChannel } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Types ────────────────────────────────────────────────

interface PresenceState {
  userId: string;
  name: string;
  avatar?: string;
  status: 'online' | 'away' | 'busy';
  lastSeen: string;
}

interface BroadcastMessage<T = unknown> {
  type: string;
  payload: T;
  senderId: string;
  timestamp: string;
}

// ─── Database Change Listener Hook ────────────────────────
// Listen to INSERT, UPDATE, DELETE on any table

export function useRealtimeTable<T extends Record<string, unknown>>(
  table: string,
  options?: {
    event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
    filter?: string; // e.g. 'org_id=eq.abc123'
    schema?: string;
  }
) {
  const [records, setRecords] = useState<T[]>([]);
  const [lastEvent, setLastEvent] = useState<{
    type: string;
    record: T;
    oldRecord?: T;
  } | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel(`table-${table}-${options?.filter || 'all'}`)
      .on(
        'postgres_changes',
        {
          event: options?.event || '*',
          schema: options?.schema || 'public',
          table,
          filter: options?.filter,
        },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;

          setLastEvent({
            type: eventType,
            record: newRecord as T,
            oldRecord: oldRecord as T,
          });

          setRecords((prev) => {
            switch (eventType) {
              case 'INSERT':
                return [...prev, newRecord as T];
              case 'UPDATE':
                return prev.map((r) =>
                  (r as any).id === (newRecord as any).id ? (newRecord as T) : r
                );
              case 'DELETE':
                return prev.filter(
                  (r) => (r as any).id !== (oldRecord as any).id
                );
              default:
                return prev;
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, options?.event, options?.filter, options?.schema]);

  return { records, setRecords, lastEvent };
}

// ─── Broadcast Hook (Ephemeral Messages) ──────────────────
// For cursor positions, typing indicators, live reactions, etc.

export function useRealtimeBroadcast<T = unknown>(channelName: string) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [messages, setMessages] = useState<BroadcastMessage<T>[]>([]);

  useEffect(() => {
    const channel = supabase
      .channel(channelName, {
        config: {
          broadcast: {
            self: false, // Don't receive own messages
          },
        },
      })
      .on('broadcast', { event: '*' }, (payload) => {
        setMessages((prev) => [...prev.slice(-99), payload.payload as BroadcastMessage<T>]);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName]);

  const broadcast = useCallback(
    async (type: string, payload: T, senderId: string) => {
      if (!channelRef.current) return;
      await channelRef.current.send({
        type: 'broadcast',
        event: type,
        payload: {
          type,
          payload,
          senderId,
          timestamp: new Date().toISOString(),
        },
      });
    },
    []
  );

  return { messages, broadcast };
}

// ─── Presence Hook (Who's Online) ─────────────────────────
// Tracks online users with automatic heartbeat and cleanup

export function useRealtimePresence(
  channelName: string,
  currentUser: PresenceState
) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<PresenceState[]>([]);

  useEffect(() => {
    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: currentUser.userId,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceState>();
        const users = Object.values(state)
          .flat()
          .map((p) => p as unknown as PresenceState);
        setOnlineUsers(users);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        console.log('[presence] Joined:', newPresences);
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        console.log('[presence] Left:', leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            userId: currentUser.userId,
            name: currentUser.name,
            avatar: currentUser.avatar,
            status: currentUser.status,
            lastSeen: new Date().toISOString(),
          });
        }
      });

    channelRef.current = channel;

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [channelName, currentUser.userId]);

  // Update own presence (e.g., status change)
  const updatePresence = useCallback(
    async (update: Partial<PresenceState>) => {
      if (!channelRef.current) return;
      await channelRef.current.track({
        ...currentUser,
        ...update,
        lastSeen: new Date().toISOString(),
      });
    },
    [currentUser]
  );

  return { onlineUsers, updatePresence };
}

// ─── Connection Recovery Hook ─────────────────────────────
// Monitors connection status and reconnects automatically

export function useRealtimeConnection() {
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('connected');
  const [lastConnected, setLastConnected] = useState<Date>(new Date());

  useEffect(() => {
    // Monitor connection via a heartbeat channel
    const channel = supabase
      .channel('connection-monitor')
      .subscribe((status) => {
        switch (status) {
          case 'SUBSCRIBED':
            setStatus('connected');
            setLastConnected(new Date());
            break;
          case 'CHANNEL_ERROR':
          case 'TIMED_OUT':
            setStatus('reconnecting');
            break;
          case 'CLOSED':
            setStatus('disconnected');
            break;
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { status, lastConnected };
}

// ─── Typing Indicator Hook ────────────────────────────────
// Broadcasts typing status with automatic timeout

export function useTypingIndicator(
  channelName: string,
  userId: string,
  userName: string
) {
  const [typingUsers, setTypingUsers] = useState<Map<string, { name: string; expiresAt: number }>>(
    new Map()
  );
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel(`typing-${channelName}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId === userId) return; // Skip self

        setTypingUsers((prev) => {
          const next = new Map(prev);
          if (payload.isTyping) {
            next.set(payload.userId, {
              name: payload.userName,
              expiresAt: Date.now() + 3000,
            });
          } else {
            next.delete(payload.userId);
          }
          return next;
        });
      })
      .subscribe();

    channelRef.current = channel;

    // Cleanup expired typing indicators every second
    const cleanupInterval = setInterval(() => {
      setTypingUsers((prev) => {
        const next = new Map(prev);
        const now = Date.now();
        for (const [key, value] of next) {
          if (value.expiresAt < now) next.delete(key);
        }
        return next.size !== prev.size ? next : prev;
      });
    }, 1000);

    return () => {
      clearInterval(cleanupInterval);
      supabase.removeChannel(channel);
    };
  }, [channelName, userId]);

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!channelRef.current) return;

      // Debounce: don't send more than once per second
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId, userName, isTyping },
      });

      // Auto-stop typing after 3 seconds
      if (isTyping) {
        timeoutRef.current = setTimeout(() => {
          channelRef.current?.send({
            type: 'broadcast',
            event: 'typing',
            payload: { userId, userName, isTyping: false },
          });
        }, 3000);
      }
    },
    [userId, userName]
  );

  const typingList = Array.from(typingUsers.values()).map((t) => t.name);

  return { typingUsers: typingList, sendTyping };
}

// ─── Usage Examples ───────────────────────────────────────
/*
// 1. Live comments on a post
function PostComments({ postId }: { postId: string }) {
  const { records: comments, setRecords } = useRealtimeTable('comments', {
    event: 'INSERT',
    filter: `post_id=eq.${postId}`,
  });

  // Fetch initial comments, then realtime takes over
  useEffect(() => {
    supabase
      .from('comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .then(({ data }) => setRecords(data || []));
  }, [postId]);

  return (
    <div>
      {comments.map((c) => <Comment key={c.id} comment={c} />)}
    </div>
  );
}

// 2. Who's online indicator
function OnlineUsers({ roomId }: { roomId: string }) {
  const { onlineUsers } = useRealtimePresence(`room-${roomId}`, {
    userId: currentUser.id,
    name: currentUser.name,
    status: 'online',
    lastSeen: new Date().toISOString(),
  });

  return (
    <div className="flex -space-x-2">
      {onlineUsers.map((u) => (
        <Avatar key={u.userId} src={u.avatar} alt={u.name} />
      ))}
      <span>{onlineUsers.length} online</span>
    </div>
  );
}

// 3. Chat with typing indicators
function ChatRoom({ roomId }: { roomId: string }) {
  const { typingUsers, sendTyping } = useTypingIndicator(
    roomId, currentUser.id, currentUser.name
  );

  return (
    <div>
      <input
        onChange={(e) => {
          sendTyping(e.target.value.length > 0);
        }}
        onBlur={() => sendTyping(false)}
      />
      {typingUsers.length > 0 && (
        <p>{typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...</p>
      )}
    </div>
  );
}
*/
