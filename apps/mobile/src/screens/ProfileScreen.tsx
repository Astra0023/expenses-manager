import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { computeBudget, CURRENCY_OPTIONS, isCurrencyCode, useApp, useMoney } from '@manage-expenses/core';
import { Avatar, Button, Field, Select } from '../ui';
import { pickAvatar } from '../image';
import { styles } from '../styles';
import { BackupPanel } from '../BackupPanel';

type Message = { ok: boolean; text: string } | null;

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const style = bold ? { fontWeight: '700' as const } : undefined;
  return (
    <View style={styles.item}>
      <Text style={style}>{label}</Text>
      <Text style={style}>{value}</Text>
    </View>
  );
}

export function ProfileScreen() {
  const { user, updateProfile, updateAvatar, changePassword } = useApp();
  const money = useMoney();
  const [avatarError, setAvatarError] = useState('');

  const handleAvatar = async () => {
    setAvatarError('');
    try {
      const picture = await pickAvatar();
      if (picture) await updateAvatar(picture);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Failed to upload picture');
    }
  };
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [currency, setCurrency] = useState(user.currency);
  const [income, setIncome] = useState(String(user.monthlyIncome));
  const [taxRate, setTaxRate] = useState(String(user.taxRate));
  const [savingsRate, setSavingsRate] = useState(String(user.savingsRate));
  const [profileMsg, setProfileMsg] = useState<Message>(null);
  useEffect(() => {
    setFirstName(user.firstName); setLastName(user.lastName); setCurrency(user.currency);
    setIncome(String(user.monthlyIncome)); setTaxRate(String(user.taxRate)); setSavingsRate(String(user.savingsRate));
  }, [user.firstName, user.lastName, user.currency, user.monthlyIncome, user.taxRate, user.savingsRate]);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState<Message>(null);

  const budget = computeBudget({
    monthlyIncome: Number(income) || 0,
    taxRate: Number(taxRate) || 0,
    savingsRate: Number(savingsRate) || 0,
  });

  const handleProfile = async () => {
    try {
      await updateProfile({ firstName, lastName, currency, monthlyIncome: Number(income), taxRate: Number(taxRate), savingsRate: Number(savingsRate) });
      setProfileMsg({ ok: true, text: 'Profile saved' });
    } catch (err) {
      setProfileMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed to save' });
    }
  };

  const handlePassword = async () => {
    try {
      await changePassword(currentPw, newPw);
      setCurrentPw('');
      setNewPw('');
      setPwMsg({ ok: true, text: 'Password changed' });
    } catch (err) {
      setPwMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed to change password' });
    }
  };

  return (
    <View>
      <Text style={styles.title}>Profile</Text>
      <View style={[styles.card, { alignItems: 'center' }]}>
        <Avatar size={96} user={user} />
        {!!avatarError && <Text style={styles.error}>{avatarError}</Text>}
        <Pressable onPress={handleAvatar}><Text style={styles.link}>Upload picture</Text></Pressable>
        {user.avatar && <Pressable onPress={() => updateAvatar(null)}><Text style={styles.danger}>Remove</Text></Pressable>}
      </View>
      <View style={styles.card}>
        <Text style={styles.h2}>Details & income</Text>
        <Field label="First name" value={firstName} onChangeText={setFirstName} />
        <Field label="Last name" value={lastName} onChangeText={setLastName} />
        <Select label="Currency" value={currency} options={CURRENCY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} onChange={(value) => { if (isCurrencyCode(value)) setCurrency(value); }} />
        <Text style={styles.muted}>Changing currency only changes how amounts are displayed; existing values are not converted.</Text>
        <Field label="Monthly income" keyboardType="decimal-pad" value={income} onChangeText={setIncome} />
        <Field label="Tax rate (%)" keyboardType="decimal-pad" value={taxRate} onChangeText={setTaxRate} />
        <Field label="Savings (% of net)" keyboardType="decimal-pad" value={savingsRate} onChangeText={setSavingsRate} />
        {profileMsg && <Text style={profileMsg.ok ? styles.success : styles.error}>{profileMsg.text}</Text>}
        <Button title="Save profile" onPress={handleProfile} />
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Tax & spending calculator</Text>
        <Line label="Gross income" value={money(budget.gross)} />
        <Line label={`Tax (${Number(taxRate) || 0}%)`} value={`− ${money(budget.tax)}`} />
        <Line label="Net income" value={money(budget.net)} />
        <Line label={`Savings (${Number(savingsRate) || 0}%)`} value={`− ${money(budget.savings)}`} />
        <Line label="Spend per month" value={money(budget.spendLimit)} bold />
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Change password</Text>
        <Field label="Current password" secureTextEntry value={currentPw} onChangeText={setCurrentPw} />
        <Field label="New password" secureTextEntry value={newPw} onChangeText={setNewPw} />
        {pwMsg && <Text style={pwMsg.ok ? styles.success : styles.error}>{pwMsg.text}</Text>}
        <Button title="Change password" onPress={handlePassword} />
      </View>
      <BackupPanel />
    </View>
  );
}
