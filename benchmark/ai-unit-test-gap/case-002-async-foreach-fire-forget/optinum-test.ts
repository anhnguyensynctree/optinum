// Optinum generates this from: changeType=[cascade-change], pattern=[async-foreach-fire-forget]
// Optinum detects arr.forEach(async ...) in the AST diff and generates two probes:
// (1) a delayed mock that proves the caller does NOT wait for completion, and
// (2) a rejecting mock that proves errors are swallowed without propagating.
// Both tests FAIL on the buggy forEach implementation.

import { dispatchNotifications } from "./ai-code";
import type { NotificationService } from "./ai-code";

describe("dispatchNotifications — Optinum async-completion probes", () => {
  it("FAILS: function should not return before all sends complete", async () => {
    const completionOrder: string[] = [];

    // Delayed mock — takes 10ms to resolve (simulates real I/O)
    const service: NotificationService = {
      send: jest.fn().mockImplementation(
        (n) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              completionOrder.push(n.userId);
              resolve();
            }, 10);
          }),
      ),
    };

    await dispatchNotifications(
      [
        { userId: "user-1", message: "A" },
        { userId: "user-2", message: "B" },
      ],
      service,
    );

    // If forEach fire-and-forget: completionOrder is [] here (sends haven't finished)
    // If properly awaited (Promise.all): completionOrder has both entries
    expect(completionOrder).toHaveLength(2); // FAILS with forEach — completionOrder is []
  });

  it("FAILS: rejection from send() should propagate to caller", async () => {
    const service: NotificationService = {
      send: jest.fn().mockRejectedValue(new Error("network error")),
    };

    // forEach swallows the rejection — function resolves without throwing
    // Correct implementation (Promise.all) would reject
    await expect(
      dispatchNotifications([{ userId: "user-1", message: "A" }], service),
    ).rejects.toThrow("network error"); // FAILS with forEach — resolves instead of rejecting
  });
});
