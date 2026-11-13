import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { todayISO, useApp, useMoney, type Payment } from '@manage-expenses/core';
import { errorMessage } from '../utils/errors';
import { describeDue, needsAttention, sortByDueDate } from '../utils/payments';

export type NotificationState = NotificationPermission | 'unsupported';

interface ReminderContextValue {
  today: string;
  /** Unpaid payments inside their reminder window or overdue. */
  activeReminders: Payment[];
  permission: NotificationState;
  /** Permission granted and the user opted in for this account in this browser. */
  isEnabled: boolean;
  isRequesting: boolean;
  error: string;
  enable: () => Promise<void>;
  disable: () => void;
  clearError: () => void;
}

const ReminderContext = createContext<ReminderContextValue | null>(null);
const CHECK_INTERVAL_MS = 60_000;

const prefKey = (userId: string) => `me:web-notify:${userId}`;
const sentKey = (userId: string) => `me:web-reminded:${userId}`;

function readPermission(): NotificationState {
  return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/** Reminder keys already shown in this tab, so reloads and re-renders do not repeat them. */
function readSent(key: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeSent(key: string, sent: Set<string>): void {
  try {
    sessionStorage.setItem(key, JSON.stringify([...sent]));
  } catch {
    // Not critical: worst case a reminder is shown again after a reload.
  }
}

export function useReminders(): ReminderContextValue {
  const ctx = useContext(ReminderContext);
  if (!ctx) throw new Error('useReminders must be used inside ReminderProvider');
  return ctx;
}

/**
 * Browser notifications for scheduled payments. These only fire while a tab with this site is
 * open and signed in; nothing runs in the background and no push service is used.
 */
export function ReminderProvider({ children }: { children: ReactNode }) {
  const { user, payments } = useApp();
  const money = useMoney();
  const [today, setToday] = useState(todayISO);
  const [permission, setPermission] = useState<NotificationState>(readPermission);
  const [isOptedIn, setIsOptedIn] = useState(() => readFlag(prefKey(user.id)));
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState('');
  const sentRef = useRef<Set<string>>(readSent(sentKey(user.id)));
  const shownRef = useRef<Notification[]>([]);

  useEffect(() => {
    const tick = () => {
      setToday(todayISO());
      setPermission(readPermission());
    };
    const timer = window.setInterval(tick, CHECK_INTERVAL_MS);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
    };
  }, []);

  // Close anything we showed when the user signs out or the provider unmounts.
  useEffect(() => () => {
    shownRef.current.forEach((n) => n.close());
    shownRef.current = [];
  }, []);

  const activeReminders = useMemo(() => sortByDueDate(payments.filter((p) => needsAttention(p, today))), [payments, today]);
  const isEnabled = isOptedIn && permission === 'granted';

  useEffect(() => {
    if (!isEnabled) return;
    const sent = sentRef.current;
    let changed = false;
    for (const p of activeReminders) {
      const key = `${p.id}:${p.dueDate}`;
      if (sent.has(key)) continue;
      sent.add(key);
      changed = true;
      try {
        const notification = new Notification(`Payment reminder: ${p.title}`, {
          body: `${money(p.amount)} \u2014 ${describeDue(p, today)}. Mark it paid in Expenses Manager once settled.`,
          tag: `me-payment-${key}`,
        });
        notification.onclick = () => {
          window.focus();
          window.location.hash = '/payments';
          notification.close();
        };
        shownRef.current.push(notification);
      } catch (err) {
        setError(`Your browser could not show a notification (${errorMessage(err, 'unknown error')}). Reminders are still shown inside the app.`);
        break;
      }
    }
    if (changed) writeSent(sentKey(user.id), sent);
  }, [activeReminders, isEnabled, money, today, user.id]);

  const enable = useCallback(async () => {
    setError('');
    if (readPermission() === 'unsupported') {
      setError('This browser does not support notifications. Reminders are still shown inside the app.');
      return;
    }
    if (!window.isSecureContext) {
      setError('Notifications need a secure (https) connection. Reminders are still shown inside the app.');
      return;
    }
    setIsRequesting(true);
    try {
      const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        localStorage.setItem(prefKey(user.id), '1');
        setIsOptedIn(true);
      } else if (result === 'denied') {
        setError('Notifications are blocked for this site. Allow them in your browser\u2019s site settings, then try again.');
      } else {
        setError('Notification permission was not granted. You can try again at any time.');
      }
    } catch (err) {
      setError(`Could not enable notifications: ${errorMessage(err, 'unknown error')}`);
    } finally {
      setIsRequesting(false);
    }
  }, [user.id]);

  const disable = useCallback(() => {
    try {
      localStorage.removeItem(prefKey(user.id));
    } catch {
      // ignore: in-memory state below still turns notifications off for this tab
    }
    setIsOptedIn(false);
  }, [user.id]);

  const value: ReminderContextValue = {
    today,
    activeReminders,
    permission,
    isEnabled,
    isRequesting,
    error,
    enable,
    disable,
    clearError: () => setError(''),
  };

  return <ReminderContext.Provider value={value}>{children}</ReminderContext.Provider>;
}