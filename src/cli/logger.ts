type ColorName =
  | "reset"
  | "bright"
  | "dim"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "cyan"
  | "gray";

const COLORS: Record<ColorName, string> = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

type LogLevel = "error" | "warn" | "info" | "success" | "verbose";

const LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  success: 3,
  verbose: 4,
};

class Logger {
  private level: number = LEVELS.info;
  private useColors: boolean = process.stdout.isTTY ?? false;

  setLevel(level: LogLevel | number): void {
    if (typeof level === "string" && LEVELS[level] !== undefined) {
      this.level = LEVELS[level];
    } else if (typeof level === "number") {
      this.level = level;
    }
  }

  private _shouldLog(level: LogLevel): boolean {
    return LEVELS[level] <= this.level;
  }

  private _colorize(text: string, color: ColorName): string {
    if (!this.useColors || !COLORS[color]) {
      return text;
    }
    return `${COLORS[color]}${text}${COLORS.reset}`;
  }

  private _format(level: LogLevel): string {
    const timestamp = new Date().toISOString().substring(11, 19);
    const prefix = this._colorize(`[${timestamp}]`, "gray");

    let levelTag: string;
    switch (level) {
      case "error":
        levelTag = this._colorize("[ERROR]", "red");
        break;
      case "warn":
        levelTag = this._colorize("[WARN]", "yellow");
        break;
      case "success":
        levelTag = this._colorize("[SUCCESS]", "green");
        break;
      case "info":
        levelTag = this._colorize("[INFO]", "blue");
        break;
      case "verbose":
        levelTag = this._colorize("[VERBOSE]", "cyan");
        break;
      default:
        levelTag = `[${(level as string).toUpperCase()}]`;
    }

    return `${prefix} ${levelTag}`;
  }

  error(...args: unknown[]): void {
    if (this._shouldLog("error")) {
      console.error(this._format("error"), ...args);
    }
  }

  warn(...args: unknown[]): void {
    if (this._shouldLog("warn")) {
      console.warn(this._format("warn"), ...args);
    }
  }

  info(...args: unknown[]): void {
    if (this._shouldLog("info")) {
      console.log(this._format("info"), ...args);
    }
  }

  success(...args: unknown[]): void {
    if (this._shouldLog("success")) {
      console.log(this._format("success"), ...args);
    }
  }

  verbose(...args: unknown[]): void {
    if (this._shouldLog("verbose")) {
      console.log(this._format("verbose"), ...args);
    }
  }

  raw(...args: unknown[]): void {
    console.log(...args);
  }

  table(data: unknown): void {
    console.table(data);
  }
}

export const logger = new Logger();
