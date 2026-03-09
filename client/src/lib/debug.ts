/**
 * Debug logging utility — the ONLY logging helper permitted in client code.
 * Logs are emitted only in development mode; they are silenced in production builds.
 */
export function debug(message: string, ...args: unknown[]): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log(`[debug] ${message}`, ...args);
  }
}
