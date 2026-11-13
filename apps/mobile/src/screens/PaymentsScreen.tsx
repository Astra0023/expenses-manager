import { useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { todayISO, useApp, useMoney, type Payment } from '@manage-expenses/core';
import { Button, Field, Select } from '../ui';
import { styles } from '../styles';
import type { ReminderControls } from '../notifications';

export function PaymentsScreen({ reminders }: { reminders: ReminderControls }) {
  const { payments, activeCategories, categoryName, addPayment, removePayment, markPaymentPaid } = useApp();
  const money = useMoney();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(todayISO());
  const [recurrence, setRecurrence] = useState<Payment['recurrence']>('none');
  const [days, setDays] = useState('3');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); setMessage(success); }
    catch (err) { setError(err instanceof Error ? err.message : 'Payment could not be saved.'); }
    finally { setBusy(false); }
  };
  const save = () => run(async () => {
    if (!title.trim() || !Number.isFinite(Number(amount)) || Number(amount) <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(Number(days)) || Number(days) < 0 || Number(days) > 365) {
      throw new Error('Enter a title, positive amount, valid due date, and reminder days from 0 to 365.');
    }
    const parsed = new Date(`${date}T12:00:00`);
    if (Number.isNaN(parsed.getTime()) || `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}` !== date) {
      throw new Error('Enter a real calendar date.');
    }
    await addPayment({ title: title.trim(), amount: Number(amount), categoryId: category || activeCategories[0]?.id || '', dueDate: date, recurrence, reminderDays: Number(days) });
    setTitle(''); setAmount('');
  }, 'Payment planned. Reminder scheduling status appears below.');
  const confirmPaid = (payment: Payment) => Alert.alert('Mark payment paid?', `${payment.title}: ${money(payment.amount)}. This records an expense${payment.recurrence !== 'none' ? ' and advances the next due date' : ' and removes the planned payment'}.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Mark paid', onPress: () => void run(() => markPaymentPaid(payment.id), 'Payment recorded.') },
  ]);
  return <View>
    <Text style={styles.title}>Planned payments</Text>
    <Text style={[styles.muted, { marginBottom: 16 }]}>Plan ahead, stay in control. Nothing is paid or charged automatically.</Text>
    <View style={styles.card}>
      <Text style={styles.h2}>Add a payment</Text>
      <Field label="Payment title" value={title} onChangeText={setTitle} maxLength={100} />
      <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      <Select label="Category" value={category || activeCategories[0]?.id || ''} options={activeCategories.map((c) => ({ value: c.id, label: c.name }))} onChange={setCategory} />
      <Field label="Due date (YYYY-MM-DD)" value={date} onChangeText={setDate} autoCapitalize="none" />
      <Select label="Repeat" value={recurrence} options={[{ value: 'none', label: 'One time' }, { value: 'monthly', label: 'Every month' }, { value: 'yearly', label: 'Every year' }]} onChange={(v) => setRecurrence(v as Payment['recurrence'])} />
      <Field label="Remind days before (0–365)" value={days} onChangeText={setDays} keyboardType="number-pad" />
      <Button title={busy ? 'Saving…' : 'Plan payment'} disabled={busy || !activeCategories.length} onPress={save} />
      {!activeCategories.length && <Text style={styles.muted}>Create an active category first.</Text>}
    </View>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!!message && <Text style={styles.success}>{message}</Text>}
    <View style={styles.card}>
      <Text style={styles.h2}>Private local reminders</Text>
      <Text style={styles.muted}>Notifications never show titles, amounts, or category names. Dates use the device time zone at scheduling, not a saved account time zone. Reopen after changing time zones to rebuild pending times; delivery may otherwise shift. Reminders do not repeat until you mark an occurrence paid.</Text>
      <Text style={{ marginVertical: 10 }}>{reminders.status}</Text>
      {!!reminders.error && <Text accessibilityRole="alert" style={styles.error}>{reminders.error}</Text>}
      <Button disabled={reminders.busy} title={reminders.enabled ? 'Turn reminders off' : 'Allow & enable reminders'} onPress={() => void reminders.configure(!reminders.enabled)} />
      <Button disabled={reminders.busy} title="Retry / refresh schedule" onPress={reminders.retry} />
      <Button title="Open device notification settings" onPress={() => { void Linking.openSettings().catch(() => Alert.alert('Settings unavailable', 'Open device Settings and find Manage Expenses notifications.')); }} />
    </View>
    <View style={styles.card}>
      <Text style={styles.h2}>Upcoming & overdue</Text>
      {!payments.length && <Text style={styles.muted}>No planned payments. Add a bill or annual subscription above.</Text>}
      {[...payments].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((payment) => <View key={payment.id} style={{ borderBottomWidth: 1, borderColor: '#e4ece8', paddingVertical: 14 }}>
        <Text style={styles.h2}>{payment.title} · {money(payment.amount)}</Text>
        <Text style={payment.dueDate < todayISO() ? styles.error : styles.muted}>{payment.dueDate < todayISO() ? 'Overdue · ' : ''}{payment.dueDate} · {categoryName(payment.categoryId)}</Text>
        <Text style={[styles.muted, { marginBottom: 10 }]}>{payment.recurrence === 'none' ? 'One time' : `Repeats ${payment.recurrence}`} · remind {payment.reminderDays} days before</Text>
        <Button title="Mark paid" disabled={busy} onPress={() => confirmPaid(payment)} />
        <Button title="Remove payment" disabled={busy} onPress={() => Alert.alert('Remove planned payment?', 'No expense will be recorded. Its reminder will be cancelled.', [
          { text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void run(() => removePayment(payment.id), 'Planned payment removed.') },
        ])} />
      </View>)}
    </View>
  </View>;
}
