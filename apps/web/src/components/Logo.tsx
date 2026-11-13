interface LogoProps {
  showName?: boolean;
}

export function Logo({ showName = true }: LogoProps) {
  return (
    <span className="logo">
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <rect width="32" height="32" rx="9" fill="var(--brand)" />
        <path d="M9 21.5 14 16l4 3.5 6-8" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="24" cy="11.5" r="2.2" fill="var(--accent)" />
      </svg>
      {showName && <span className="logo-name">Expenses Manager</span>}
    </span>
  );
}