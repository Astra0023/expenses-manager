import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { currentMonth, formatMoney, useApp } from '@manage-expenses/core';
import { Button, Field } from '../ui';
import { styles } from '../styles';

export function CategoriesScreen() {
  const { categories, expenses, categoryBudgets, setCategoryBudget, addCategory, renameCategory, setCategoryActive } = useApp();
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [budgetCategory, setBudgetCategory] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName('');
    setEditingId(null);
    setError('');
  };

  const handleSubmit = async () => {
    try {
      if (editingId) await renameCategory(editingId, name);
      else await addCategory(name);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const confirmDelete = (id: string, label: string) =>
    Alert.alert('Delete category', `"${label}" will be set to inactive. Past expenses keep it.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => setCategoryActive(id, false) },
    ]);

  return (
    <View>
      <Text style={styles.title}>Categories & budgets</Text>
      <View style={styles.card}>
        <Text style={styles.h2}>Monthly category limits</Text>
        <Text style={[styles.muted, { marginBottom: 12 }]}>These are planning limits, not extra spending money. Alerts appear here and on Home at 80% and 100%. Enter 0 to clear a limit.</Text>
        {categories.map((category) => {
          const limit = categoryBudgets[category.id] || 0;
          const spent = expenses.filter((expense) => expense.categoryId === category.id && expense.date.startsWith(currentMonth())).reduce((sum, expense) => sum + expense.amount, 0);
          return <View key={category.id} style={{ marginBottom: 12 }}>
            <Text>{category.name} · {formatMoney(spent)} spent{limit ? ` / ${formatMoney(limit)}` : ' · no limit'}</Text>
            {limit > 0 && spent >= limit * 0.8 && <Text style={spent >= limit ? styles.error : styles.muted}>{spent >= limit ? 'Budget reached or exceeded' : 'Heads up: 80% or more used'}</Text>}
            <Pressable onPress={() => { setBudgetCategory(category.id); setBudgetAmount(String(limit)); }}><Text style={styles.link}>Set limit</Text></Pressable>
            {budgetCategory === category.id && <>
              <Field label={`${category.name} monthly budget`} value={budgetAmount} onChangeText={setBudgetAmount} keyboardType="decimal-pad" />
              <Button title="Save category limit" disabled={busy} onPress={async () => {
                setBusy(true); setError('');
                try {
                  if (!budgetAmount.trim() || !Number.isFinite(Number(budgetAmount)) || Number(budgetAmount) < 0) throw new Error('Enter a nonnegative amount.');
                  await setCategoryBudget(category.id, Number(budgetAmount)); setBudgetCategory('');
                } catch (err) { setError(err instanceof Error ? err.message : 'Could not save budget.'); }
                finally { setBusy(false); }
              }} />
            </>}
          </View>;
        })}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </View>
      <View style={styles.card}>
        <Field label="Name" maxLength={40} value={name} onChangeText={setName} />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Button title={editingId ? 'Save changes' : 'Add category'} onPress={handleSubmit} />
        {editingId && <Pressable onPress={reset}><Text style={styles.link}>Cancel</Text></Pressable>}
      </View>
      <View style={styles.card}>
        {categories.map((c) => (
          <View key={c.id} style={styles.item}>
            <View style={styles.grow}>
              <Text style={c.status === 'inactive' ? styles.muted : undefined}>{c.name}</Text>
              <Text style={styles.muted}>{c.status}</Text>
            </View>
            <Pressable onPress={() => { setEditingId(c.id); setName(c.name); setError(''); }}><Text style={styles.link}>Edit</Text></Pressable>
            {c.status === 'active' ? (
              <Pressable onPress={() => confirmDelete(c.id, c.name)}><Text style={styles.danger}>Delete</Text></Pressable>
            ) : (
              <Pressable onPress={() => setCategoryActive(c.id, true)}><Text style={styles.link}>Reactivate</Text></Pressable>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}
