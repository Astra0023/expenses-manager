import { Logo } from '../components/Logo';
import { CategoryChart } from '../components/CategoryChart';

interface LandingPageProps {
  onGetStarted: () => void;
  onSignIn: () => void;
  onTryDemo: () => void;
}

const FEATURES = [
  { title: 'Track every expense', text: 'Add, edit and filter expenses by month and category in seconds.' },
  { title: 'Budgets that warn you', text: 'Set a monthly spending limit and per-category budgets, with alerts as you approach them.' },
  { title: 'Never miss a bill', text: 'Schedule one-time, monthly or yearly payments with in-app reminders and optional browser notifications.' },
  { title: 'Clear reports', text: 'Monthly, quarterly and yearly reports with charts and Excel export.' },
  { title: 'Tax & savings planner', text: 'Enter income, tax and savings rate to see how much you can comfortably spend.' },
  { title: 'Encrypted backups', text: 'Download a password-protected backup file and restore it when you need to.' },
];

const PREVIEW = [
  { id: 'a', label: 'Housing', amount: 1200 },
  { id: 'b', label: 'Food', amount: 257 },
  { id: 'c', label: 'Utilities', amount: 65 },
  { id: 'd', label: 'Transport', amount: 42 },
];

export function LandingPage({ onGetStarted, onSignIn, onTryDemo }: LandingPageProps) {
  return (
    <div className="landing">
      <a className="skip-link" href="#landing-main">Skip to content</a>
      <header className="landing-header">
        <Logo />
        <div className="row">
          <button type="button" className="link" onClick={onSignIn}>Sign in</button>
          <button type="button" onClick={onGetStarted}>Get started</button>
        </div>
      </header>

      <main id="landing-main" tabIndex={-1}>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Personal finance, kept on your device</p>
            <h1>Know where your money goes &mdash; and what&rsquo;s due next.</h1>
            <p className="lead">
              Expenses Manager helps you track spending, stay inside your budgets and keep on top of bills,
              without connecting a bank or sending your data to a server.
            </p>
            <div className="row cta-row">
              <button type="button" className="lg" onClick={onGetStarted}>Create your free account</button>
              <button type="button" className="secondary lg" onClick={onTryDemo}>Try the demo</button>
            </div>
            <p className="muted">The demo uses made-up sample data and saves nothing.</p>
          </div>
          <div className="hero-preview card" aria-label="Example dashboard with sample figures" role="group">
            <p className="muted">Example &middot; this month</p>
            <p className="stat">1,564.00 <span className="muted">of 2,856.00 spent</span></p>
            <div className="bar" aria-hidden="true"><div style={{ width: '55%' }} /></div>
            <CategoryChart slices={PREVIEW} />
          </div>
        </section>

        <section className="features" aria-labelledby="features-title">
          <h2 id="features-title">Everything you need to stay on budget</h2>
          <div className="feature-grid">
            {FEATURES.map((f) => (
              <article key={f.title} className="card feature">
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="steps card" aria-labelledby="steps-title">
          <h2 id="steps-title">Up and running in three steps</h2>
          <ol>
            <li><strong>Set your budget.</strong> Enter monthly income, tax and savings goal.</li>
            <li><strong>Pick your categories.</strong> Keep the defaults or add your own, with optional limits.</li>
            <li><strong>Add your first expense.</strong> Your dashboard updates instantly.</li>
          </ol>
        </section>

        <section className="privacy card" aria-labelledby="privacy-title">
          <h2 id="privacy-title">Your data stays in this browser</h2>
          <ul>
            <li>There is no server: accounts and data are stored only in this browser on this device.</li>
            <li>Your profile, expenses, categories, budgets and payments are encrypted with a key protected by your password.</li>
            <li>While you are signed in (up to 8 hours) the unlock key is kept in this browser so you stay signed in. Log out on shared devices.</li>
            <li>There is no password reset. If you forget your password, the data cannot be recovered &mdash; keep an encrypted backup.</li>
          </ul>
        </section>

        <section className="final-cta">
          <h2>Ready to take control of your spending?</h2>
          <div className="row cta-row">
            <button type="button" className="lg" onClick={onGetStarted}>Get started</button>
            <button type="button" className="secondary lg" onClick={onTryDemo}>Explore the demo</button>
          </div>
        </section>
      </main>

      <footer className="landing-footer muted">Expenses Manager &middot; works offline in your browser</footer>
    </div>
  );
}