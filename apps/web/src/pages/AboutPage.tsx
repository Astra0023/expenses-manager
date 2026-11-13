export function AboutPage() {
  return (
    <>
      <h1>About</h1>
      <section className="card">
        <p>
          Expenses Manager is a personal expense tracker that runs entirely in your browser. There is no server or
          database: your account and data are stored in this browser&rsquo;s storage on this device, and the app does not
          send your data anywhere.
        </p>
        <h2>What you can do</h2>
        <ul>
          <li><strong>Home</strong> &ndash; this month&rsquo;s spending, a category chart, budget alerts, upcoming payments and suggestions.</li>
          <li><strong>Manage Expenses</strong> &ndash; add, edit and delete expenses; filter by month and category.</li>
          <li><strong>Payments</strong> &ndash; schedule one-time, monthly or yearly payments with a reminder a chosen number of days ahead, and mark them paid yourself (this records the expense).</li>
          <li><strong>Reports</strong> &ndash; monthly, quarterly and yearly totals, filterable by category and year, with Excel export.</li>
          <li><strong>Category</strong> &ndash; create, rename and set monthly limits. Deleting one sets it to inactive so history is preserved.</li>
          <li><strong>Profile</strong> &ndash; name, password, income, tax rate and savings goal, plus encrypted backup and restore.</li>
        </ul>

        <h2>Privacy &amp; security</h2>
        <ul>
          <li>Passwords are never stored in plain text; only a salted PBKDF2 hash is kept.</li>
          <li>
            Your profile and financial data are encrypted in browser storage with a random key, and that key is itself
            encrypted with a key derived from your password. Your username is stored unencrypted so you can sign in.
          </li>
          <li>
            To keep you signed in across reloads, the unlock key is kept in this browser&rsquo;s local storage for up to 8 hours
            or until you log out. During that time anyone (or any software) with access to this browser profile could read
            your data, so log out on shared computers.
          </li>
          <li>Encryption does not protect you from malware or browser extensions running on this device.</li>
          <li>There is no password reset. A forgotten password means the data cannot be decrypted; keep an encrypted backup.</li>
          <li>Clearing site data for this website deletes your accounts and data from this browser.</li>
        </ul>

        <h2>Reminders</h2>
        <p>
          Payment reminders appear inside the app. Optional browser notifications only work while this site is open in a tab
          and you are signed in; nothing is sent when the site is closed, and payments are never paid automatically.
        </p>

        <h2>Backups</h2>
        <p>
          A backup is a file encrypted with a separate backup password that you choose. Restoring replaces the profile details and all data in the
          signed-in account (not its username or sign-in password) and asks you to confirm first. Anyone with the file and its password can read it.
        </p>

        <h2>Demo</h2>
        <p>The public demo uses made-up sample data held only in memory. It does not create an account or save anything.</p>
      </section>
    </>
  );
}