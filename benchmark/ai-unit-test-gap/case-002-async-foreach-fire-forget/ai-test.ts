// Demonstrates: AI-generated test that PASSES despite the fire-and-forget bug
// The AI mocks service.send() to resolve immediately (synchronous mock).
// Because the mock resolves instantly, the fire-and-forget timing bug is invisible:
// all callbacks appear to complete before the assertion runs. The test passes.
// In production with real async I/O, the function returns before sends complete.

import { dispatchNotifications } from "./ai-code";
import type { NotificationService } from "./ai-code";

describe("dispatchNotifications", () => {
  it("calls send for each notification", async () => {
    const mockSend = jest.fn().mockResolvedValue(undefined);
    const service: NotificationService = { send: mockSend };

    const notifications = [
      { userId: "user-1", message: "Hello" },
      { userId: "user-2", message: "World" },
    ];

    await dispatchNotifications(notifications, service);

    // This assertion PASSES because mockResolvedValue resolves synchronously
    // within the microtask queue before Jest's assertion runs.
    // The test cannot distinguish "awaited properly" from "fire-and-forget with fast mock".
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend).toHaveBeenCalledWith({
      userId: "user-1",
      message: "Hello",
    });
    expect(mockSend).toHaveBeenCalledWith({
      userId: "user-2",
      message: "World",
    });
  });

  it("does not throw when service resolves", async () => {
    const service: NotificationService = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    // Does not throw — but only because the rejection from send() is swallowed by forEach
    await expect(
      dispatchNotifications([{ userId: "user-3", message: "Test" }], service),
    ).resolves.toBeUndefined();
  });
});
// Both tests PASS — green suite — bug ships undetected
