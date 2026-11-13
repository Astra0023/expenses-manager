import { Text, View } from 'react-native';
import { styles } from '../styles';

const FEATURES = [
  ['Home', "this month's spending, budget progress and money-saving suggestions."],
  ['Expenses', 'add, edit and delete expenses; filter by month and category.'],
  ['Reports', 'monthly, quarterly and yearly totals, filterable by category and year.'],
  ['Categories', 'create and rename categories, set monthly limits and watch in-app alerts at 80% and 100%. Deactivation preserves history. Limits do not increase your overall spending plan.'],
  ['Payments', 'plan one-time, monthly or yearly payments, with configurable reminder days. Mark paid manually to record an expense; recurring due dates advance from the planned date. No bank account is charged.'],
  ['Profile', 'edit income, tax and savings settings; share a password-encrypted backup or restore a selected file after explicit replacement confirmation.'],
  ['Sample preview', 'open the account menu (or sign-in screen) for an isolated, read-only example. It never writes sample data into your account or changes your session.'],
];

export function AboutScreen() {
  return (
    <View>
      <Text style={styles.title}>About</Text>
      <View style={styles.card}>
        <Text style={{ marginBottom: 10 }}>
          Manage Expenses is a personal expense tracker that works offline. Financial records stay on this device; there is no app server. Files only leave through export or sharing actions you choose.
        </Text>
        <Text style={styles.h2}>What you can do</Text>
        {FEATURES.map(([name, text]) => (
          <Text key={name} style={{ marginBottom: 4 }}>• <Text style={{ fontWeight: '600' }}>{name}</Text> – {text}</Text>
        ))}
        <Text style={[styles.h2, { marginTop: 10 }]}>Privacy & security</Text>
        <Text>
          Keep your device locked. Clearing app data removes local records. Backups are encrypted before a file is created; use a dedicated backup password, not your account password, and keep it separately. The app cannot recover a lost backup password. Restore replaces financial data and backed-up profile settings, but keeps your sign-in identity.
        </Text>
        <Text style={[styles.h2, { marginTop: 16 }]}>Reminder delivery</Text>
        <Text>
          Enable local notifications in Payments. Permission denial and scheduling failures appear there and on Home; notifications contain only generic text, never payment titles or amounts. They target 9 AM local time, but device settings and power saving can delay delivery.
        </Text>
        <Text style={{ marginTop: 10 }}>
          The nearest 50 future reminders are scheduled. Past reminder times are not sent retroactively; check overdue payments in the app. A recurring payment gets its next reminder only after you manually mark the current occurrence paid. Dates use the device time zone at scheduling, not a saved account time zone. Reopen after changing time zones to rebuild pending times; delivery may otherwise shift. Logging out cancels pending reminders; you must retry if cancellation fails.
        </Text>
        <Text style={{ marginTop: 10 }}>
          If notification cleanup is unavailable at startup, you can still sign in and use financial features. A warning explains that previous-account reminders may remain. No new reminders are scheduled until cleanup succeeds. Retry cleanup or disable this app's notifications in device Settings. Explicit logout still requires successful cancellation.
        </Text>
        <Text style={{ marginTop: 10 }}>
          Use Expo Go or a native development/production build for local reminders, file picking and sharing. No remote push service is configured. Verify notification permissions and delivery on your own device.
        </Text>
      </View>
    </View>
  );
}
