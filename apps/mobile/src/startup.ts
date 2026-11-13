export async function inspectReminderCleanup(cleanup: () => Promise<void>): Promise<string> {
  try {
    await cleanup();
    return '';
  } catch (error) {
    return `Notification cleanup is unavailable: ${error instanceof Error ? error.message : String(error)}. Previous-account reminders may still be pending. You can sign in and use financial features, but no new reminders will be scheduled unless cleanup succeeds. Existing notifications use generic content. Retry cleanup or disable this app's notifications in device Settings.`;
  }
}

export async function loadMobileSession<T>(cleanup: () => Promise<void>, currentUser: () => Promise<T>) {
  const notificationWarning = await inspectReminderCleanup(cleanup);
  const user = await currentUser();
  return { user, notificationWarning };
}
