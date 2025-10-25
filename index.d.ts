import { EventEmitter } from 'node:events';

export interface EppClientConfigOptions {
  host?: string;
  port?: number;
  rejectUnauthorized?: boolean;
  defaultTimeout?: number;
}

export class EppClientConfig {
  constructor(options?: EppClientConfigOptions);

  host: string;
  port: number;
  rejectUnauthorized: boolean;
  defaultTimeout: number;

  clone(overrides?: Partial<EppClientConfigOptions>): EppClientConfig;
  validate(): Error | null;
  toTlsOptions(): { host: string; port: number; rejectUnauthorized: boolean };
}

export interface SendCommandOptions {
  transactionId?: string;
  timeout?: number;
}

export interface CommandResult {
  type: 'response' | 'greeting';
  success: boolean;
  resultCode: number | null;
  resultMessage: string;
  resultMessages: string[];
  transactionId: string | null;
  serverTransactionId: string | null;
  data: any;
  queue: any;
  extension: any;
  raw: string;
  parsed: any;
}

export type EppCommandError = Error & { code?: number | null; response?: CommandResult };

export type CommandOutcome = CommandResult | EppCommandError;

export interface LoginOptions extends SendCommandOptions {
  username: string;
  password: string;
  services?: string[];
  extensions?: string[];
}

export interface LogoutOptions extends SendCommandOptions {}

export interface CheckDomainOptions extends SendCommandOptions {
  name: string;
}

export interface DomainCheckResult {
  success: boolean;
  availability: 'registered' | 'unregistered';
  reason: string;
}

export interface CreateDomainOptions extends SendCommandOptions {
  name: string;
  period?: number;
  registrant: string;
  nameservers?: string[];
  authPassword?: string;
}

export interface CreateContactOptions extends SendCommandOptions {
  id: string;
  name: string;
  organisation?: string;
  addressLines?: string[] | string;
  city: string;
  state?: string;
  postcode?: string;
  country: string;
  phone?: string;
  email: string;
  authInfo?: string;
}

export default class EppClient extends EventEmitter {
  constructor(options?: EppClientConfig | EppClientConfigOptions);

  readonly isConnected: boolean;
  readonly config: EppClientConfig;

  configure(overrides?: Partial<EppClientConfigOptions>): EppClientConfig;

  connect(): Promise<Error | null>;
  disconnect(): Promise<Error | null>;
  destroy(error?: Error): void;

  sendCommand(xml: string, options?: SendCommandOptions): Promise<CommandOutcome>;
  login(options: LoginOptions): Promise<CommandOutcome>;
  logout(options?: LogoutOptions): Promise<CommandOutcome>;
  checkDomain(options: CheckDomainOptions): Promise<DomainCheckResult | EppCommandError>;
  createDomain(options: CreateDomainOptions): Promise<CommandOutcome>;
  createContact(options: CreateContactOptions): Promise<CommandOutcome>;
}

export { EppClient };

export function normalizeEppResponse(parsed: any): CommandResult;
export function escapeXml(value: string | number | boolean | null | undefined): string;
