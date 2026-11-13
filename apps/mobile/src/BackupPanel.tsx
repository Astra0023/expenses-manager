import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useApp } from '@manage-expenses/core';
import { Button, Field } from './ui';
import { styles } from './styles';

export function BackupPanel() {
  const { createBackup, restoreBackup } = useApp();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [file, setFile] = useState<{ name: string; data: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Backup operation failed.'); }
    finally { setBusy(false); }
  };
  const exportBackup = () => run(async () => {
    if (password.length < 12) throw new Error('Use a separate backup password with at least 12 characters.');
    if (password !== confirmation) throw new Error('Backup passwords do not match.');
    if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is not available on this device.');
    if (!FileSystem.cacheDirectory) throw new Error('A private cache directory is unavailable.');
    // createBackup must finish encryption before any file is created.
    const encrypted = await createBackup(password);
    const uri = `${FileSystem.cacheDirectory}manage-expenses-${Date.now()}.encrypted.json`;
    try {
      await FileSystem.writeAsStringAsync(uri, encrypted, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Save encrypted backup', UTI: 'public.json' });
      setPassword(''); setConfirmation('');
    } finally { await FileSystem.deleteAsync(uri, { idempotent: true }); }
    setMessage('Encrypted backup shared. Keep its password separately; the app cannot recover it. The share sheet may also have been cancelled.');
  });
  const pick = () => run(async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return;
    const asset = result.assets[0];
    try {
      const info = await FileSystem.getInfoAsync(asset.uri);
      if (!info.exists || info.isDirectory || info.size > 10 * 1024 * 1024) throw new Error('Choose a backup file smaller than 10 MB.');
      const data = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      setFile({ name: asset.name, data }); setRestorePassword('');
    } finally {
      if (FileSystem.cacheDirectory && asset.uri.startsWith(FileSystem.cacheDirectory)) await FileSystem.deleteAsync(asset.uri, { idempotent: true });
    }
  });
  const confirmRestore = () => Alert.alert('Replace this account’s financial data?', `Restore "${file?.name}"? Existing expenses, categories, budgets, planned payments and backed-up profile settings will be replaced, not merged. This cannot be undone. Export a backup first. Your sign-in identity stays unchanged.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Replace data', style: 'destructive', onPress: () => void run(async () => {
      if (!file || !restorePassword) throw new Error('Choose a file and enter its backup password.');
      await restoreBackup(file.data, restorePassword);
      setFile(null); setRestorePassword('');
      setMessage('Backup validated and restored. Check Payments for reminder scheduling status.');
    }) },
  ]);
  return <View style={styles.card}>
    <Text style={styles.h2}>Encrypted backup & restore</Text>
    <Text style={[styles.muted, { marginBottom: 12 }]}>Choose a dedicated backup password, not your account password. Only encrypted data is written to the shared file. Anyone with the file and its password can read your financial data.</Text>
    <Field label="New backup password (12+ characters)" secureTextEntry autoCapitalize="none" autoCorrect={false} value={password} onChangeText={setPassword} />
    <Field label="Confirm backup password" secureTextEntry autoCapitalize="none" autoCorrect={false} value={confirmation} onChangeText={setConfirmation} />
    <Button title="Encrypt & share backup" disabled={busy} onPress={exportBackup} />
    <Text style={[styles.h2, { marginTop: 16 }]}>Restore from file</Text>
    <Button title="Choose encrypted backup file" disabled={busy} onPress={pick} />
    {file && <>
      <Text style={styles.muted}>Selected: {file.name}</Text>
      <Field label="Selected file’s backup password" secureTextEntry autoCapitalize="none" autoCorrect={false} value={restorePassword} onChangeText={setRestorePassword} />
      <Button title="Review destructive restore" disabled={busy || !restorePassword} onPress={confirmRestore} />
      <Button title="Discard selected file" disabled={busy} onPress={() => { setFile(null); setRestorePassword(''); }} />
    </>}
    {busy && <Text style={styles.muted}>Working… Please keep the app open.</Text>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!!message && <Text style={styles.success}>{message}</Text>}
  </View>;
}
