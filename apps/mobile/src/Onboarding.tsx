import { useState } from 'react';
import { Text, View } from 'react-native';
import { todayISO, useApp } from '@manage-expenses/core';
import { Button, Field, Select } from './ui';
import { styles } from './styles';

export function Onboarding() {
  const { user, expenses, activeCategories, updateProfile, addCategory, addExpense } = useApp();
  const [step, setStep] = useState(user.monthlyIncome > 0 ? 1 : 0);
  const [income, setIncome] = useState(user.monthlyIncome ? String(user.monthlyIncome) : '');
  const [categoryName, setCategoryName] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (expenses.length) return null;
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save your setup.'); }
    finally { setBusy(false); }
  };
  return <View style={[styles.card, { borderColor: '#9dcbb8', backgroundColor: '#f1faf5' }]}>
    <Text style={styles.h2}>Your fresh start · {step + 1} of 3</Text>
    <Text style={[styles.muted, { marginBottom: 12 }]}>A spending plan, your categories, then your first expense.</Text>
    {step === 0 && <>
      <Field label="Monthly income" value={income} onChangeText={setIncome} keyboardType="decimal-pad" />
      <Text style={[styles.muted, { marginBottom: 12 }]}>Your current tax ({user.taxRate}%) and savings ({user.savingsRate}%) settings determine your spending limit. Fine-tune them in Profile.</Text>
      <Button title="Save spending plan" disabled={busy} onPress={() => void run(async () => {
        if (!Number.isFinite(Number(income)) || Number(income) <= 0) throw new Error('Enter a positive monthly income.');
        await updateProfile({ firstName: user.firstName, lastName: user.lastName, currency: user.currency, monthlyIncome: Number(income), taxRate: user.taxRate, savingsRate: user.savingsRate });
        setStep(1);
      })} />
    </>}
    {step === 1 && <>
      <Text style={{ marginBottom: 12 }}>{activeCategories.map((item) => item.name).join(' · ') || 'Add a category to begin.'}</Text>
      <Field label="Add a personal category (optional)" value={categoryName} onChangeText={setCategoryName} maxLength={40} />
      <Button title="Add category" disabled={busy || !categoryName.trim()} onPress={() => void run(async () => { await addCategory(categoryName); setCategoryName(''); })} />
      <Button title="These categories work for me" disabled={busy || !activeCategories.length} onPress={() => setStep(2)} />
    </>}
    {step === 2 && <>
      <Text style={[styles.muted, { marginBottom: 12 }]}>Record a real purchase from today. You can edit it later in Expenses.</Text>
      <Field label="First expense amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      <Select label="Category" value={category || activeCategories[0]?.id || ''} options={activeCategories.map((item) => ({ value: item.id, label: item.name }))} onChange={setCategory} />
      <Button title="Save my first expense" disabled={busy || !activeCategories.length} onPress={() => void run(async () => {
        if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) throw new Error('Enter a positive expense amount.');
        await addExpense({ amount: Number(amount), categoryId: category || activeCategories[0]?.id || '', date: todayISO(), note: '' });
      })} />
    </>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
}
