/** Non-sensitive UI flag so the setup guide is only offered until the user finishes or skips it. */
const keyFor = (userId: string) => `me:web-onboarded:${userId}`;

export function isOnboarded(userId: string): boolean {
  try {
    return localStorage.getItem(keyFor(userId)) === '1';
  } catch {
    return false;
  }
}

export function markOnboarded(userId: string): void {
  try {
    localStorage.setItem(keyFor(userId), '1');
  } catch {
    // Storage unavailable: the guide will simply be offered again next time.
  }
}