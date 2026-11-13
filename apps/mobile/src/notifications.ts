import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import type { Payment } from '@manage-expenses/core';
import { buildReminderPlan } from './reminderPlan';

const TAG = 'manage-expenses-payment-v1';
let work: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const result = work.then(task, task);
  work = result.catch(() => undefined);
  return result;
}

async function cancelManaged() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notification of scheduled) {
    if (notification.content.data?.manager === TAG) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }
  }
}

export function clearPaymentReminders() {
  return serialized(cancelManaged);
}

export function usePaymentReminders(owner: string, payments: Payment[], loading: boolean) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [status, setStatus] = useState('Reminders are off. Payments are never automatically marked paid.');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const suspended = useRef(false);
  const key = `mobile:payment-reminders:${owner}`;

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(key).then((value) => { if (active) setEnabled(value === 'on'); })
      .catch((err) => { if (active) { setEnabled(false); setError(`Cannot load reminder preferences: ${String(err)}`); } });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setRevision((value) => value + 1);
    });
    return () => { active = false; subscription.remove(); };
  }, [key]);

  useEffect(() => {
    if (loading) {
      void clearPaymentReminders().catch((err) => setError(`Reminders could not be cancelled while financial data is unavailable: ${String(err)}`));
      return;
    }
    if (enabled === null || suspended.current) return;
    const version = ++generation.current;
    void serialized(async () => {
      if (version !== generation.current) return;
      try {
        await cancelManaged();
        if (version !== generation.current) return;
        if (!enabled) {
          setStatus('Reminders are off. Check Payments for upcoming and overdue items.');
          setError((previous) => previous.startsWith('Reminders could not') ? '' : previous);
          return;
        }
        const permission = await Notifications.getPermissionsAsync();
        if (!permission.granted) throw new Error('Notifications are not allowed. Enable them in device Settings, then retry.');
        // Native notification APIs may be unavailable; keep setup inside the surfaced error boundary.
        Notifications.setNotificationHandler({
          handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: false }),
        });
        const { scheduled, deferred } = buildReminderPlan(payments);
        // Stay below iOS's pending-notification limit, reserving room for the OS.
        for (const { payment, date } of scheduled) {
          if (version !== generation.current) { await cancelManaged(); return; }
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Payment reminder',
              body: 'Open Manage Expenses to review a planned payment.',
              data: { manager: TAG, owner, paymentId: payment.id },
              sound: 'default',
            },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: 'payments' },
          });
        }
        if (version !== generation.current) return;
        setError('');
        setStatus(`${scheduled.length} reminders scheduled for 9 AM local time (device delivery may be delayed). ${
          deferred > 0 ? 'Only the nearest 50 are scheduled; reopen the app as dates pass. ' : ''
        }Dates are converted using the device time zone when scheduled, not a saved account time zone. Open the app after changing time zones to rebuild the schedule; pending times may otherwise shift. Past reminder times are not sent retroactively.`);
      } catch (err) {
        let cleanup = '';
        try { await cancelManaged(); } catch { cleanup = ' Cleanup failed; pending reminders may remain. Retry before logging out.'; }
        setError(`Reminders could not be updated: ${err instanceof Error ? err.message : String(err)}${cleanup}`);
      }
    });
    return () => { generation.current++; };
  }, [enabled, loading, owner, payments, revision]);

  const configure = useCallback(async (on: boolean) => {
    setBusy(true);
    setError('');
    try {
      if (on) {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('payments', {
            name: 'Payment reminders', importance: Notifications.AndroidImportance.DEFAULT,
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
          });
        }
        const permission = await Notifications.requestPermissionsAsync();
        if (!permission.granted) throw new Error('Permission denied. You can still track payments here. Enable notifications in device Settings to receive reminders.');
      } else {
        await clearPaymentReminders();
      }
      await AsyncStorage.setItem(key, on ? 'on' : 'off');
      suspended.current = false;
      setEnabled(on);
      setRevision((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to configure notifications.');
    } finally { setBusy(false); }
  }, [key]);

  const prepareLogout = async () => {
    suspended.current = true;
    generation.current++;
    setEnabled(false);
    await clearPaymentReminders();
  };
  return { enabled: !!enabled, busy, status, error, configure, prepareLogout, retry: () => setRevision((value) => value + 1) };
}

export type ReminderControls = ReturnType<typeof usePaymentReminders>;
