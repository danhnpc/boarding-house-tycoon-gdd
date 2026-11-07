// Local-only error log (GDD 14, ADR 0003): errors are kept on the device for
// debugging; nothing is transmitted. A small ring buffer in localStorage is
// enough for the MVP — richer diagnostics are a later phase problem.

const LOG_KEY = 'bht-error-log';
const MAX_ENTRIES = 50;

export interface LoggedError {
  at: number;
  message: string;
  source?: string;
}

export function readErrorLog(): LoggedError[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LoggedError[]) : [];
  } catch {
    return [];
  }
}

export function logError(entry: Partial<LoggedError> & { message: string }): void {
  const record: LoggedError = {
    at: Date.now(),
    message: String(entry.message).slice(0, 500),
    source: entry.source,
  };
  try {
    const next = [...readErrorLog(), record].slice(-MAX_ENTRIES);
    localStorage.setItem(LOG_KEY, JSON.stringify(next));
  } catch {
    // Storage full or unavailable: the log is best-effort by design.
  }
}

let installed = false;

export function installErrorLogging(win: Window): void {
  if (installed) {
    return;
  }
  installed = true;
  win.addEventListener('error', (event) => {
    logError({ message: event.message, source: `${event.filename}:${event.lineno}` });
  });
  win.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
    logError({ message: `unhandled rejection: ${reason}` });
  });
}
