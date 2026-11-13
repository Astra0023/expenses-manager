import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { filterExpenses, monthRange, shiftMonth, currentMonth, todayISO, useApp, useMoney, type Expense } from '@manage-expenses/core';
import { Button, Field, Select } from '../ui';
import { styles } from '../styles';

export function ExpensesScreen() {
  const { expenses, categories, activeCategories, categoryName, addExpense, updateExpense, removeExpense } = useApp();
  const money = useMoney();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const [month, setMonth] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');

  const selectedCategory = categoryId || activeCategories[0]?.id || '';
  // Keep the edited expense's category selectable even if it was deactivated.
  const formCategories = categories.filter((c) => c.status === 'active' || c.id === selectedCategory);

  const reset = () => {
    setEditingId(null);
    setAmount('');
    setNote('');
    setCategoryId('');
    setDate(todayISO());
    setError('');
  };

  const handleSubmit = async () => {
    setError('');
    const input = { amount: Number(amount), categoryId: selectedCategory, date, note: note.trim() };
    try {
      if (editingId) await updateExpense(editingId, input);
      else await addExpense(input);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const startEdit = (e: Expense) => {
    setEditingId(e.id);
    setAmount(String(e.amount));
    setCategoryId(e.categoryId);
    setDate(e.date);
    setNote(e.note);
  };

  const confirmDelete = (e: Expense) =>
    Alert.alert('Delete expense', `${money(e.amount)} on ${e.date}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await removeExpense(e.id);
          if (editingId === e.id) reset();
        },
      },
    ]);

  const visible = filterExpenses(expenses, { ...(month ? monthRange(month) : {}), categoryId: filterCategory });
  const total = visible.reduce((s, e) => s + e.amount, 0);

  return (
    <View>
      <Text style={styles.title}>Manage Expenses</Text>
      <View style={styles.card}>
        <Text style={styles.h2}>{editingId ? 'Edit expense' : 'Add expense'}</Text>
        <Field label="Amount" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        <Select
          label="Category"
          value={selectedCategory}
          options={formCategories.map((c) => ({ value: c.id, label: c.status === 'inactive' ? `${c.name} (inactive)` : c.name }))}
          onChange={setCategoryId}
        />
        <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
        <Field label="Note" maxLength={100} value={note} onChangeText={setNote} />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Button title={editingId ? 'Save changes' : 'Add expense'} disabled={!selectedCategory} onPress={handleSubmit} />
        {editingId && <Pressable onPress={reset}><Text style={styles.link}>Cancel</Text></Pressable>}
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Filter</Text>
        <View style={styles.row}>
          <Pressable onPress={() => setMonth(shiftMonth(month || currentMonth(), -1))}><Text style={styles.link}>◀</Text></Pressable>
          <Text>{month || 'All months'}</Text>
          <Pressable onPress={() => setMonth(shiftMonth(month || currentMonth(), 1))}><Text style={styles.link}>▶</Text></Pressable>
          <Pressable onPress={() => { setMonth(''); setFilterCategory('All'); }}><Text style={styles.link}>Clear</Text></Pressable>
        </View>
        <Select
          label="Category"
          value={filterCategory}
          options={[{ value: 'All', label: 'All' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
          onChange={setFilterCategory}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Expenses — total {money(total)}</Text>
        {visible.length === 0 && <Text>No expenses found.</Text>}
        {visible.map((e) => (
          <View key={e.id} style={styles.item}>
            <View style={styles.grow}>
              <Text>{e.date} · {categoryName(e.categoryId)}</Text>
              {!!e.note && <Text style={styles.muted}>{e.note}</Text>}
            </View>
            <Text>{money(e.amount)}</Text>
            <Pressable onPress={() => startEdit(e)}><Text style={styles.link}>Edit</Text></Pressable>
            <Pressable onPress={() => confirmDelete(e)}><Text style={styles.danger}>Delete</Text></Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}
