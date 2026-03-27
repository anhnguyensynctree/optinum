export class RetryExhaustedError extends Error {
  public readonly lastError: unknown;
  public readonly attempts: number;

  constructor(lastError: unknown, attempts: number) {
    super(`Retry exhausted after ${attempts} attempt(s)`);
    this.name = "RetryExhaustedError";
    this.lastError = lastError;
    this.attempts = attempts;
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
): Promise<T> {
  let lastError: unknown;
  const totalAttempts = maxRetries + 1;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
    }
  }

  throw new RetryExhaustedError(lastError, totalAttempts);
}
