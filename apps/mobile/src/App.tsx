import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, createAuthService, useApp, type Account } from '@manage-expenses/core';
import { mobileStorage, randomBytes } from './platform';
import { AuthScreen } from './AuthScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ExpensesScreen } from './screens/ExpensesScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { CategoriesScreen } from './screens/CategoriesScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { AboutScreen } from './screens/AboutScreen';
import { styles } from './styles';
import { Avatar } from './ui';
import { Button } from './ui';
import { DemoScreen } from './DemoScreen';
import { PaymentsScreen } from './screens/PaymentsScreen';
import { clearPaymentReminders, usePaymentReminders } from './notifications';
import { inspectReminderCleanup, loadMobileSession } from './startup';

const TABS = [
  { key: 'home', label: 'Home', Screen: HomeScreen },
  { key: 'expenses', label: 'Expenses', Screen: ExpensesScreen },
  { key: 'reports', label: 'Reports', Screen: ReportsScreen },
  { key: 'payments', label: 'Payments', Screen: PaymentsScreen },
  { key: 'categories', label: 'Category', Screen: CategoriesScreen },
  { key: 'about', label: 'About', Screen: AboutScreen },
] as const;

type ScreenKey = (typeof TABS)[number]['key'] | 'profile';

function ProfileMenu({ onProfile, onDemo, beforeLogout }: { onProfile: () => void; onDemo: () => void; beforeLogout: () => Promise<void> }) {
  const { user, logout } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const handleLogout = async () => {
    setBusy(true); setError('');
    try { await beforeLogout(); await logout(); }
    catch (err) { setError(`Could not log out safely: ${err instanceof Error ? err.message : String(err)}. Retry to cancel pending reminders.`); }
    finally { setBusy(false); }
  };

  return (
    <View>
      <Pressable accessibilityLabel="Account menu" onPress={() => setIsOpen(true)}>
        <Avatar user={user} size={38} />
      </Pressable>
      <Modal transparent visible={isOpen} animationType="fade" onRequestClose={() => setIsOpen(false)}>
        <Pressable style={styles.menuBg} onPress={() => setIsOpen(false)}>
          <View style={styles.menu}>
            <View style={[styles.item, { flexDirection: 'column', alignItems: 'flex-start' }]}>
              <Text style={{ fontWeight: '700' }}>{user.firstName} {user.lastName}</Text>
              <Text style={styles.muted}>@{user.username}</Text>
            </View>
            <Pressable style={styles.menuItem} onPress={() => { setIsOpen(false); onProfile(); }}><Text>Profile</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={() => { setIsOpen(false); onDemo(); }}><Text>Explore sample preview</Text></Pressable>
            <Button title={busy ? 'Logging out…' : 'Logout'} disabled={busy} onPress={handleLogout} />
            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function Shell() {
  const { isLoading, user, payments, error: dataError } = useApp();
  const [tab, setTab] = useState<ScreenKey>('home');
  const [demo, setDemo] = useState(false);
  const reminders = usePaymentReminders(user.id, payments, isLoading || !!dataError);
  const Active = tab === 'profile' ? ProfileScreen : tab === 'expenses' ? ExpensesScreen : tab === 'reports' ? ReportsScreen : tab === 'categories' ? CategoriesScreen : AboutScreen;
  if (demo) return <ScrollView contentContainerStyle={styles.screen}><DemoScreen onClose={() => setDemo(false)} /></ScrollView>;

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.item, { paddingHorizontal: 16, backgroundColor: '#fff' }]}>
        <View><Text style={styles.h2}>Manage Expenses</Text><Text style={styles.muted}>Make room for what matters</Text></View>
        <ProfileMenu onProfile={() => setTab('profile')} onDemo={() => setDemo(true)} beforeLogout={reminders.prepareLogout} />
      </View>
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : dataError ? (
        <View style={styles.screen}><Text accessibilityRole="alert" style={styles.error}>{dataError}</Text>{!!reminders.error && <Text accessibilityRole="alert" style={styles.error}>{reminders.error}</Text>}<Text>Financial data could not be loaded safely. Log out using the account menu and sign in again before making changes.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
          {!!reminders.error && <Pressable accessibilityRole="button" onPress={() => setTab('payments')} style={[styles.insight, { backgroundColor: '#fef2f2' }]}><Text style={styles.error}>{reminders.error}</Text><Text>Open Payments to resolve reminders →</Text></Pressable>}
          {tab === 'home' ? <HomeScreen onNavigate={setTab} /> : tab === 'payments' ? <PaymentsScreen reminders={reminders} /> : Active ? <Active /> : null}
        </ScrollView>
      )}
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }} key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function App() {
  const auth = useMemo(() => createAuthService(mobileStorage, randomBytes), []);
  const [user, setUser] = useState<Account | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [startupError, setStartupError] = useState('');
  const [notificationWarning, setNotificationWarning] = useState('');
  const [retryingCleanup, setRetryingCleanup] = useState(false);
  const [demo, setDemo] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setStartupError('');
    // Notification availability must not block authentication or financial features.
    loadMobileSession(clearPaymentReminders, () => auth.currentUser()).then(({ user: current, notificationWarning: warning }) => {
      if (active) { setUser(current); setNotificationWarning(warning); setIsReady(true); }
    }).catch((err) => { if (active) setStartupError(`Startup failed: ${err instanceof Error ? err.message : String(err)}`); });
    return () => { active = false; };
  }, [auth, attempt]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f6f3', paddingTop: 28 }}>
      <StatusBar style="dark" />
      {!!notificationWarning && <View style={[styles.insight, { margin: 12, backgroundColor: '#fffbeb' }]}>
        <Text accessibilityRole="alert" style={styles.error}>{notificationWarning}</Text>
        <Button disabled={retryingCleanup} title={retryingCleanup ? 'Retrying cleanup…' : 'Retry notification cleanup'} onPress={async () => {
          setRetryingCleanup(true);
          try { setNotificationWarning(await inspectReminderCleanup(clearPaymentReminders)); }
          finally { setRetryingCleanup(false); }
        }} />
      </View>}
      {startupError ? <View style={styles.screen}><Text style={styles.error}>{startupError}</Text><Button title="Retry startup" onPress={() => setAttempt((value) => value + 1)} /></View> : !isReady ? (
        <ActivityIndicator style={{ marginTop: 80 }} />
      ) : !user ? (
        <ScrollView contentContainerStyle={styles.screen}>{demo ? <DemoScreen onClose={() => setDemo(false)} /> : <><AuthScreen auth={auth} onAuthenticated={setUser} /><Button title="Explore a safe, read-only demo" onPress={() => setDemo(true)} /></>}</ScrollView>
      ) : (
        <AppProvider key={user.id} auth={auth} storage={mobileStorage} randomBytes={randomBytes} user={user} onLogout={() => setUser(null)}>
          <Shell />
        </AppProvider>
      )}
    </SafeAreaView>
  );
}
