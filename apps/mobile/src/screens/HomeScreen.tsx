import { Text, View } from 'react-native';
import { buildInsights, computeBudget, currentMonth, filterExpenses, formatMoney, monthRange, useApp } from '@manage-expenses/core';
import { INSIGHT_COLORS, styles } from '../styles';
import { Onboarding } from '../Onboarding';
import { Button } from '../ui';

export function HomeScreen({ onNavigate }: { onNavigate?: (screen: 'expenses' | 'payments' | 'categories') => void }) {
  const { user, expenses, categories, categoryName, payments, categoryBudgets } = useApp();
  const month = currentMonth();
  const { from, to } = monthRange(month);
  const monthExpenses = filterExpenses(expenses, { from, to });
  const spent = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const budget = computeBudget(user);
  const hasIncome = user.monthlyIncome > 0;
  const percent = budget.spendLimit > 0 ? (spent / budget.spendLimit) * 100 : spent > 0 ? 100 : 0;
  const barColor = percent > 100 ? '#dc2626' : percent >= 80 ? '#f59e0b' : '#8dd8b8';

  const totals = new Map<string, number>();
  monthExpenses.forEach((e) => totals.set(e.categoryId, (totals.get(e.categoryId) ?? 0) + e.amount));
  const byCategory = [...totals.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <View>
      <Text style={styles.muted}>YOUR MONEY, WITH INTENTION</Text>
      <Text style={styles.title}>Hello, {user.firstName}</Text>
      <Onboarding />
      <View style={[styles.card, { backgroundColor: '#143c35', borderColor: '#143c35' }]}>
        <Text style={{ color: '#b7decf' }}>{hasIncome ? 'Available to spend this month' : 'This month’s spending'}</Text>
        <Text style={[styles.stat, { color: '#fff', fontSize: 36, marginVertical: 8 }]}>{formatMoney(hasIncome ? budget.spendLimit - spent : spent)}</Text>
        <Text style={{ color: '#d3e9e1' }}>{formatMoney(spent)} spent · {monthExpenses.length} transactions</Text>
        {hasIncome ? (
          <>
            <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.min(percent, 100)}%`, backgroundColor: barColor }]} /></View>
            <Text style={{ color: '#d3e9e1' }}>
              {Math.round(percent)}% of your {formatMoney(budget.spendLimit)} spending plan
            </Text>
          </>
        ) : (
          <Text style={{ color: '#d3e9e1' }}>Set your monthly income in Profile to see your spending limit.</Text>
        )}
      </View>
      {onNavigate && <View style={styles.row}>
        <View style={styles.grow}><Button title="+ Expense" onPress={() => onNavigate('expenses')} /></View>
        <View style={styles.grow}><Button title="Plan payment" onPress={() => onNavigate('payments')} /></View>
      </View>}
      {!!Object.keys(categoryBudgets).length && <View style={styles.card}>
        <Text style={styles.h2}>Category budget pulse</Text>
        {Object.entries(categoryBudgets).filter(([, limit]) => limit > 0).map(([id, limit]) => {
          const used = totals.get(id) || 0;
          const ratio = used / limit;
          return <View key={id} style={{ marginBottom: 12 }}>
            <View style={styles.item}><Text style={styles.grow}>{categoryName(id)}</Text><Text>{formatMoney(used)} / {formatMoney(limit)}</Text></View>
            <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.min(ratio * 100, 100)}%`, backgroundColor: ratio >= 1 ? '#b91c1c' : ratio >= 0.8 ? '#b7791f' : '#176b53' }]} /></View>
            <Text style={ratio >= 1 ? styles.error : styles.muted}>{ratio >= 1 ? 'Budget reached or exceeded' : ratio >= 0.8 ? 'Heads up: 80% or more used' : `${formatMoney(limit - used)} remaining`}</Text>
          </View>;
        })}
        {onNavigate && <Button title="Manage category budgets" onPress={() => onNavigate('categories')} />}
      </View>}
      <View style={styles.card}>
        <Text style={styles.h2}>On the horizon</Text>
        {!payments.length && <Text style={styles.muted}>Plan your next bill so nothing catches you off guard.</Text>}
        {[...payments].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3).map((payment) => <View key={payment.id} style={styles.item}>
          <View style={styles.grow}><Text>{payment.title}</Text><Text style={styles.muted}>Due {payment.dueDate} · {payment.recurrence}</Text></View>
          <Text>{formatMoney(payment.amount)}</Text>
        </View>)}
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Suggestions</Text>
        {buildInsights(expenses, categories, user, month).map((i, idx) => (
          <View key={idx} style={[styles.insight, { backgroundColor: INSIGHT_COLORS[i.level] }]}><Text>{i.text}</Text></View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Top categories</Text>
        {byCategory.length === 0 && <Text>No expenses this month.</Text>}
        {byCategory.map(([id, amount]) => (
          <View key={id} style={styles.item}><Text>{categoryName(id)}</Text><Text>{formatMoney(amount)}</Text></View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Recent expenses</Text>
        {monthExpenses.length === 0 && <Text>Nothing yet.</Text>}
        {[...monthExpenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map((e) => (
          <View key={e.id} style={styles.item}>
            <Text>{e.date} · {categoryName(e.categoryId)}</Text><Text>{formatMoney(e.amount)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
