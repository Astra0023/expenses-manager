import { describe, expect, it, vi } from 'vitest';
import { inspectReminderCleanup, loadMobileSession } from './startup';

describe('mobile startup notification failures', () => {
  it.each(['Native notification API unavailable', 'Permission denied'])('allows session loading when cleanup fails: %s', async (message) => {
    const cleanup = vi.fn().mockRejectedValue(new Error(message));
    const currentUser = vi.fn().mockResolvedValue({ id: 'existing-account' });
    const result = await loadMobileSession(cleanup, currentUser);
    expect(currentUser).toHaveBeenCalledOnce();
    expect(result.user).toEqual({ id: 'existing-account' });
    expect(result.notificationWarning).toContain(message);
    expect(result.notificationWarning).toContain('Previous-account reminders may still be pending');
    expect(result.notificationWarning).toContain('no new reminders will be scheduled unless cleanup succeeds');
  });
  it('allows the sign-in screen when there is no session and cleanup fails', async () => {
    const result = await loadMobileSession(async () => { throw new Error('unavailable'); }, async () => null);
    expect(result.user).toBeNull();
    expect(result.notificationWarning).not.toBe('');
  });
  it('clears the warning after a successful cleanup retry', async () => {
    expect(await inspectReminderCleanup(async () => undefined)).toBe('');
  });
  it('does not swallow authentication or storage failures', async () => {
    await expect(loadMobileSession(async () => undefined, async () => { throw new Error('Account storage failed'); }))
      .rejects.toThrow('Account storage failed');
  });
});
