// Demonstrates: async-foreach-fire-forget (catalog ID: async-foreach-fire-forget)
// AI wrote a notification dispatch function using arr.forEach(async ...).
// forEach ignores the returned promise from each async callback — so all
// notifications fire without being awaited. The function returns before any
// notification completes. Errors are silently swallowed. The caller believes
// all notifications succeeded. This is among the most common AI-native bugs:
// the AI knows async/await syntax but doesn't model the forEach iterator contract.

export interface Notification {
  userId: string;
  message: string;
}

export interface NotificationService {
  send(notification: Notification): Promise<void>;
}

export async function dispatchNotifications(
  notifications: Notification[],
  service: NotificationService,
): Promise<void> {
  // BUG: forEach ignores returned promises. Each send() fires without being awaited.
  // If any send() rejects, the error is swallowed. The function resolves immediately.
  notifications.forEach(async (notification) => {
    await service.send(notification); // awaits inside callback, but forEach drops the promise
  });
  // Returns here — before any send() completes
}
