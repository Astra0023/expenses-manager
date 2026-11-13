# Expenses Manager

Monorepo (npm workspaces) with a React web app and a React Native (Expo) app. No backend or database: data stays on the device.

- `packages/core` – shared TypeScript logic and state (auth, profile, categories, expenses, budget/tax, reports, insights)
- `apps/web` – Vite + React + React Router; storage = browser `localStorage`
- `apps/mobile` – Expo React Native with tab navigation; storage = `AsyncStorage`

## Run
```
npm install
npm run web        # web app
npm run mobile     # Expo (scan QR with Expo Go)
npm test           # core unit tests
npm run typecheck
```

For free-tier website hosting and native mobile distribution, see the
[deployment guide](./DEPLOYMENT.md).

## Screens (web and mobile)
- **Home** – current-month spending, budget progress, top categories, recent expenses and suggestions (computed locally from your data plus rotating tips; no network).
- **Manage Expenses** – add, edit, delete; filter by month and category.
- **Reports** – defaults to a yearly spending chart with months below; monthly and quarterly reports are also available. Filter by category and year. Yearly comparisons show zero-spend months through the current month and omit future months.
- **Category** – add, edit, delete (sets status to inactive; can be reactivated). Active categories feed the expense form.
- **Profile** – first/last name, password change, monthly income, tax rate (%) and savings (% of net). The calculator shows net income and recommended monthly spending: `income − tax − savings`.
- **About** – description of the app and its features.

On the web app, use the menu icon to expand or collapse navigation on narrow screens.

## Reminders and data protection

- Upcoming payments are separate from recorded expenses. Mark a payment as paid to record it; recurring payments are not recorded automatically.
- Browser notifications require permission and the website to be open. Mobile reminders use local notifications and require device permission; delivery depends on operating-system settings.
- On mobile, up to 50 upcoming reminders are scheduled for 9 AM local time; missed reminder times are not sent retroactively. Open the app after changing time zones.
- Backups are protected by a password supplied when exporting. Store that password separately: a lost backup password cannot be recovered. Restoring replaces the current account's data, so keep a current backup before restoring.
- Web browsers supporting Web Locks coordinate writes across tabs. If your browser does not support Web Locks, the app warns you to use one tab at a time to avoid losing changes.

## Security notes
- Passwords are stored only as salted PBKDF2-SHA256 hashes (100k iterations).
- Expenses, categories, profile and photo are encrypted (XChaCha20-Poly1305) before being saved. A random data key is wrapped with a key derived from your password.
- On the web, signing in stores the unlocked data key in browser local storage for a fixed eight hours so refreshes and other tabs remain signed in. Same-origin scripts and anyone with access to the browser's storage can read that key and decrypt the data during the session; use logout on shared devices. Logging out or expiration locks all tabs. This is a local session, not a server-issued access or refresh token.
- The mobile app keeps the data key only in memory and requires sign-in after restarting. Forgetting the password means the data cannot be recovered.
- Data is per browser/device and not synced. Existing plain-text data is encrypted automatically on the next login.
