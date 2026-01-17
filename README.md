# EPP Client

[![Build](https://github.com/namewiz/epp-client/actions/workflows/build.yml/badge.svg)](https://github.com/namewiz/epp-client/actions/workflows/build.yml)
[![Test](https://github.com/namewiz/epp-client/actions/workflows/test.yml/badge.svg)](https://github.com/namewiz/epp-client/actions/workflows/test.yml)

A modern, event-driven Node.js client for interacting with Extensible Provisioning Protocol (EPP) services. The library focuses on
a pleasant developer experience while keeping direct control over XML payloads. It exposes a lightweight API that manages TLS
connectivity, request correlation and consistent message parsing.

## What is EPP?

Extensible Provisioning Protocol (EPP) is the IETF-standard, XML-based protocol used by domain name registrars to provision and
manage objects at registries, such as domains, hosts (nameservers) and contacts. It runs over TLS, defines a small set of
core commands (login, check, create, update, delete, renew, transfer) and is extensible, allowing each registry to publish
their own XML extensions for policy-specific features.

### Registries Using EPP

EPP is the de facto standard across most gTLD and many ccTLD registries. Examples include:

- Verisign — .com, .net
- Public Interest Registry (PIR) — .org
- Identity Digital (Donuts/Afilias) — .info, .mobi, and hundreds of new gTLDs
- NiRA - .ng, .com.ng, .org.ng
- GoDaddy Registry (formerly Neustar) — .us, .biz, .nyc, .co, and others

## Features

- Promise-based workflow with automatic transaction tracking.
- EventEmitter interface for greeting, response and low-level socket events.
- Built-in helpers for login, logout, domain checks/creates and contact creation.
- Typed configuration class and bundled TypeScript definitions.
- XML sanitisation and consistent response normalisation.
- Zero runtime dependencies beyond `xml2js`.

## Installation

```bash
npm install epp-client
```

> **Note:** This library is published as a pure ECMAScript module. Use `import` or dynamic `import()` when consuming it from
> CommonJS projects.

## Quick start

```js
import EppClient, { EppClientConfig } from 'epp-client';

async function main() {
  const client = new EppClient(new EppClientConfig({
    host: 'epp.registry.example',
    port: 700,
    rejectUnauthorized: true
  }));

  client.on('greeting', (message) => {
    console.log('Greeting from registry:', message.data?.svID);
  });

  client.on('response', (message) => {
    console.log('Unmatched response received:', message.resultMessage);
  });

  const connectError = await client.connect();
  if (connectError instanceof Error) {
    console.error('Failed to connect:', connectError.message);
    return;
  }

  const loginResult = await client.login({
    username: process.env.EPP_USERNAME,
    password: process.env.EPP_PASSWORD
  });

  if (loginResult instanceof Error) {
    console.error('Login failed:', loginResult.message);
    await client.disconnect();
    return;
  }

  const checkResult = await client.checkDomain({ name: 'example.test' });
  if (checkResult instanceof Error) {
    console.error('Domain check failed:', checkResult.message);
  } else {
    console.log('Result code:', checkResult.resultCode, 'success:', checkResult.success);
  }

  const logoutResult = await client.logout();
  if (logoutResult instanceof Error) {
    console.error('Logout failed:', logoutResult.message);
  }

  await client.disconnect();
}

main().catch((error) => {
  console.error('Unexpected failure:', error);
});
```

## API

### Configuration

```ts
new EppClientConfig(options)
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `host` | `string` | `''` | Fully qualified EPP server hostname. |
| `port` | `number` | `700` | TCP port to connect to. |
| `rejectUnauthorized` | `boolean` | `false` | Set to `true` to validate TLS certificates. |
| `defaultTimeout` | `number` | `10000` | Default timeout in milliseconds for commands. |

`EppClientConfig#validate()` returns `null` when the configuration is usable or an `Error` describing the first issue. Use
`EppClient#configure()` to produce a new configuration instance with updated values.

### Constructor

```ts
new EppClient(options?)
```

The constructor accepts either an `EppClientConfig` instance or an object matching the configuration options above.

### Methods

All command helpers resolve to either a `CommandResult` on success or an `Error` describing the failure. No method throws
synchronously.

- `connect()` – establish the TLS connection. Resolves with `null` on success or an `Error` if the handshake fails.
- `disconnect()` – gracefully close the underlying socket. Resolves with `null` once closed or an `Error` if a socket problem
  occurs during shutdown.
- `destroy(error?)` – forcefully close the socket and notify pending callers with the provided error.
- `sendCommand(xml, { transactionId, timeout }?)` – send raw EPP XML; automatically injects a `clTRID` if missing.
- `login({ username, password, services, extensions, transactionId, timeout })` – authenticate with the registry.
- `logout({ transactionId, timeout }?)` – end an authenticated session.
- `checkDomain({ name, transactionId, timeout })` – run a `<domain:check>` command.
- `createDomain({ name, period, registrant, nameservers, authPassword, transactionId, timeout })` – create a new domain.
- `createContact({ id, name, email, ... })` – create a contact object. See `CreateContactOptions` for full list.
- `infoDomain({ name, transactionId, timeout })` - retrieve detailed domain information including nameservers and status.
- `dumpDomains({ names, transactionId, timeout })` - fetch info payloads for domains under the authenticated user. If the registry does not support bulk `<domain:info>` queries, pass an explicit list of domain names via `names` (the demo also accepts `--domains=name1,name2` or `DUMP_DOMAIN_NAMES`/`DUMP_DOMAINS`). The demo script illustrates writing the results to `data/domains-YYMMDD-HHMM.json`.
- `updateDomain({ name, add, remove, change, transactionId, timeout })` - send a raw `<domain:update>` command.
- `updateNameservers({ name, nameservers, transactionId, timeout })` - helper to update nameservers.
- `updateAutoRenew({ name, autoRenew, transactionId, timeout })` - helper to enable or disable auto-renewal.

### CommandResult

Each successful command resolves to a normalised structure:

```ts
interface CommandResult {
  type: 'response' | 'greeting';
  success: boolean;
  resultCode: number | null;
  resultMessage: string;
  resultMessages: string[];
  transactionId: string | null;
  serverTransactionId: string | null;
  data: any;              // resData payload from the registry
  queue: any;             // msgQ block if present
  extension: any;         // extension data
  raw: string;            // raw XML string
  parsed: any;            // xml2js parsed output
}
```

### Events

The client extends `EventEmitter` and emits:

- `connect` – when the TLS session is established.
- `close` – when the connection closes. Receives an `Error` describing the reason.
- `error` – emitted for socket issues, XML parse failures and EPP error responses without a matching transaction.
- `greeting` – fired when the registry sends its greeting banner.
- `message` – emitted for every parsed message prior to specific handling.
- `response` – emitted when a response cannot be matched to a pending command.
- `received` – emits `{ xml }` for each raw message from the registry.
- `sent` – emits `{ transactionId, xml }` whenever a command is transmitted.

### Errors

Failed commands resolve to plain `Error` instances with an optional numeric `code` property and the normalised `response`
attached for additional inspection. Handle them by checking whether the resolved value is an `Error`.

```js
const outcome = await client.createDomain({
  name: 'taken-domain.test',
  registrant: 'CONTACT-123'
});

if (outcome instanceof Error) {
  console.error('EPP failure:', outcome.code, outcome.response?.resultMessage);
}
```

## TypeScript

Type definitions are bundled and loaded automatically when using `import`/`require` in TypeScript projects.

## License

MIT © 2025
