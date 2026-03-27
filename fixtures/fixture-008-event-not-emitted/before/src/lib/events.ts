export async function emitEvent(
  event: string,
  payload: unknown,
): Promise<void> {
  // Publish to event bus
  console.log(`Event: ${event}`, payload);
}
