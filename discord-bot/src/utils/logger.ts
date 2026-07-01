type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

function timestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, tag: string, message: string, ...args: unknown[]): void {
  const prefix = `[${timestamp()}] [${level}] [${tag}]`;
  if (level === "ERROR") {
    console.error(prefix, message, ...args);
  } else if (level === "WARN") {
    console.warn(prefix, message, ...args);
  } else {
    console.log(prefix, message, ...args);
  }
}

export const logger = {
  info: (tag: string, message: string, ...args: unknown[]) =>
    log("INFO", tag, message, ...args),
  warn: (tag: string, message: string, ...args: unknown[]) =>
    log("WARN", tag, message, ...args),
  error: (tag: string, message: string, ...args: unknown[]) =>
    log("ERROR", tag, message, ...args),
  debug: (tag: string, message: string, ...args: unknown[]) => {
    if (process.env.DEBUG) log("DEBUG", tag, message, ...args);
  },
};
