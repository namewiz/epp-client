/**
 * Configuration loader and validator
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_SERVICES = [
  "urn:ietf:params:xml:ns:domain-1.0",
  "urn:ietf:params:xml:ns:contact-1.0",
  "urn:ietf:params:xml:ns:host-1.0",
];

export interface CliFlags {
  config?: string;
  host?: string;
  port?: string;
  username?: string;
  password?: string;
  timeout?: string;
  verbose?: boolean;
  quiet?: boolean;
  json?: boolean;
}

export interface CliConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  timeout: number;
  rejectUnauthorized: boolean;
  services: string[];
  extensions: string[];
}

/**
 * Load configuration from environment, file, and CLI flags
 */
export function loadConfig(flags: CliFlags = {}): CliConfig {
  // If a config file is specified, load it
  if (flags.config) {
    loadEnvFile(flags.config);
  }

  // Build configuration object with precedence: CLI flags > ENV > defaults
  const config: CliConfig = {
    host: flags.host || process.env.EPP_HOST || "",
    port: parseInt(flags.port || process.env.EPP_PORT || "700", 10),
    username: flags.username || process.env.EPP_USERNAME || "",
    password: flags.password || process.env.EPP_PASSWORD || "",
    timeout: parseInt(flags.timeout || process.env.EPP_TIMEOUT || "30000", 10),
    rejectUnauthorized: parseBool(process.env.EPP_REJECT_UNAUTHORIZED, false),

    // EPP-specific settings
    services: parseArray(process.env.EPP_SERVICES, DEFAULT_SERVICES),
    extensions: parseArray(process.env.EPP_EXTENSIONS, []),
  };

  return config;
}

/**
 * Validate that required configuration is present
 */
export function validateRequiredEnv(config: CliConfig): Error | null {
  const required: (keyof CliConfig)[] = ["host", "username", "password"];
  const missing: string[] = [];

  for (const field of required) {
    if (!config[field]) {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    return new Error(
      `Missing required configuration: ${missing.join(", ")}.\n` +
        "Set via environment variables (EPP_HOST, EPP_USERNAME, EPP_PASSWORD) or CLI flags."
    );
  }

  return null;
}

/**
 * Load environment variables from a file
 */
function loadEnvFile(filepath: string): void {
  try {
    const fullPath = resolve(filepath);
    const content = readFileSync(fullPath, "utf8");

    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      // Parse KEY=VALUE
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (match) {
        const [, key, value] = match;
        // Remove quotes if present
        const cleanValue = value!.replace(/^["']|["']$/g, "");
        process.env[key!] = cleanValue;
      }
    }
  } catch (error) {
    const err = error as Error;
    throw new Error(`Failed to load config file ${filepath}: ${err.message}`);
  }
}

/**
 * Parse a boolean value from string
 */
function parseBool(
  value: string | undefined | null,
  defaultValue: boolean = false
): boolean {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const str = String(value).toLowerCase();
  return str === "true" || str === "1" || str === "yes";
}

/**
 * Parse an array from comma-separated string
 */
function parseArray(
  value: string | string[] | undefined | null,
  defaultValue: string[] = []
): string[] {
  if (!value) {
    return defaultValue;
  }

  if (Array.isArray(value)) {
    return value;
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export interface ConfigSummary {
  host: string;
  port: number;
  username: string;
  password: string;
  timeout: number;
  services: string[];
  extensions: string[];
}

/**
 * Get configuration summary (safe for logging)
 */
export function getConfigSummary(config: CliConfig): ConfigSummary {
  return {
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password ? "***" : "(not set)",
    timeout: config.timeout,
    services: config.services,
    extensions: config.extensions,
  };
}
