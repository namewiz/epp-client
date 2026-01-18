# EPP Client

[![Build](https://github.com/namewiz/epp-client/actions/workflows/build.yml/badge.svg)](https://github.com/namewiz/epp-client/actions/workflows/build.yml)
[![Test](https://github.com/namewiz/epp-client/actions/workflows/test.yml/badge.svg)](https://github.com/namewiz/epp-client/actions/workflows/test.yml)

A modern, event-driven Node.js library and CLI for interacting with Extensible Provisioning Protocol (EPP) services. The library focuses on a pleasant developer experience while keeping direct control over XML payloads. It exposes a lightweight API that manages TLS connectivity, request correlation and consistent message parsing.

## What is EPP?

Extensible Provisioning Protocol (EPP) is the IETF-standard, XML-based protocol used by domain name registrars to provision and manage objects at registries, such as domains, hosts (nameservers) and contacts. It runs over TLS, defines a small set of core commands (login, check, create, update, delete, renew, transfer) and is extensible, allowing each registry to publish their own XML extensions for policy-specific features.

### Registries Using EPP

EPP is the de facto standard across most gTLD and many ccTLD registries. Examples include:

- Verisign — .com, .net
- Public Interest Registry (PIR) — .org
- Identity Digital (Donuts/Afilias) — .info, .mobi, and hundreds of new gTLDs
- NiRA - .ng, .com.ng, .org.ng
- GoDaddy Registry (formerly Neustar) — .us, .biz, .nyc, .co, and others

## Features

- Promise-based workflow with automatic transaction tracking
- EventEmitter interface for greeting, response and low-level socket events
- Built-in helpers for login, logout, domain checks/creates and contact creation
- Typed configuration class and bundled TypeScript definitions
- XML sanitisation and consistent response normalisation
- Full-featured CLI for standalone use (powered by Commander.js)
- Minimal runtime dependencies (`xml2js`, `dotenv`, `commander`)

## Installation

```bash
npm install epp-client
```

> **Note:** This library is published as a pure ECMAScript module. Use `import` or dynamic `import()` when consuming it from CommonJS projects.

## Project Structure

```
epp-client/
├── src/
│   ├── index.js          # Main export (re-exports from lib)
│   ├── lib/
│   │   └── index.js      # Core EPP library
│   └── cli/
│       ├── index.js      # CLI (Commander-based, uses lib directly)
│       ├── config.js     # Configuration loader
│       ├── logger.js     # Logging utility
│       └── utils.js      # Helper functions
├── test/                 # Test files
├── index.d.ts            # TypeScript definitions
└── package.json
```

---

# Library API

## Quick Start

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

## Configuration

```ts
new EppClientConfig(options)
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `host` | `string` | `''` | Fully qualified EPP server hostname. |
| `port` | `number` | `700` | TCP port to connect to. |
| `rejectUnauthorized` | `boolean` | `false` | Set to `true` to validate TLS certificates. |
| `defaultTimeout` | `number` | `10000` | Default timeout in milliseconds for commands. |

`EppClientConfig#validate()` returns `null` when the configuration is usable or an `Error` describing the first issue. Use `EppClient#configure()` to produce a new configuration instance with updated values.

## Constructor

```ts
new EppClient(options?)
```

The constructor accepts either an `EppClientConfig` instance or an object matching the configuration options above.

## Methods

All command helpers resolve to either a `CommandResult` on success or an `Error` describing the failure. No method throws synchronously.

- `connect()` – establish the TLS connection. Resolves with `null` on success or an `Error` if the handshake fails.
- `disconnect()` – gracefully close the underlying socket. Resolves with `null` once closed or an `Error` if a socket problem occurs during shutdown.
- `destroy(error?)` – forcefully close the socket and notify pending callers with the provided error.
- `sendCommand(xml, { transactionId, timeout }?)` – send raw EPP XML; automatically injects a `clTRID` if missing.
- `login({ username, password, services, extensions, transactionId, timeout })` – authenticate with the registry.
- `logout({ transactionId, timeout }?)` – end an authenticated session.
- `checkDomain({ name, transactionId, timeout })` – run a `<domain:check>` command.
- `createDomain({ name, period, registrant, nameservers, authPassword, transactionId, timeout })` – create a new domain.
- `createContact({ id, name, email, ... })` – create a contact object. See `CreateContactOptions` for full list.
- `infoDomain({ name, transactionId, timeout })` - retrieve detailed domain information including nameservers and status.
- `dumpDomains({ names, transactionId, timeout })` - fetch info payloads for domains under the authenticated user.
- `updateDomain({ name, add, remove, change, transactionId, timeout })` - send a raw `<domain:update>` command.
- `updateNameservers({ name, nameservers, transactionId, timeout })` - helper to update nameservers.
- `updateAutoRenew({ name, autoRenew, transactionId, timeout })` - helper to enable or disable auto-renewal.

## CommandResult

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

## Events

The client extends `EventEmitter` and emits:

- `connect` – when the TLS session is established.
- `close` – when the connection closes. Receives an `Error` describing the reason.
- `error` – emitted for socket issues, XML parse failures and EPP error responses without a matching transaction.
- `greeting` – fired when the registry sends its greeting banner.
- `message` – emitted for every parsed message prior to specific handling.
- `response` – emitted when a response cannot be matched to a pending command.
- `received` – emits `{ xml }` for each raw message from the registry.
- `sent` – emits `{ transactionId, xml }` whenever a command is transmitted.

## Errors

Failed commands resolve to plain `Error` instances with an optional numeric `code` property and the normalised `response` attached for additional inspection. Handle them by checking whether the resolved value is an `Error`.

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

---

# CLI

The EPP CLI provides a command-line interface for interacting with EPP servers directly from your terminal.

## CLI Installation

After installing the package, the `epp-cli` command is available:

```bash
# Global installation
npm install -g epp-client
epp-cli --help

# Or run directly with npx
npx epp-client --help

# Or run from local installation
./node_modules/.bin/epp-cli --help
```

## CLI Configuration

### Environment Variables

Create a `.env` file in your project:

```env
EPP_HOST=epp.example.com
EPP_PORT=700
EPP_USERNAME=your-username
EPP_PASSWORD=your-password
EPP_TIMEOUT=30000
EPP_REJECT_UNAUTHORIZED=false
EPP_SERVICES=urn:ietf:params:xml:ns:domain-1.0,urn:ietf:params:xml:ns:contact-1.0
EPP_EXTENSIONS=urn:ietf:params:xml:ns:secDNS-1.1
```

### Custom Config File

```bash
epp-cli --config my-config.env check-domain example.com
```

### CLI Flags

```bash
epp-cli --host epp.example.com --username user --password pass check-domain example.com
```

Configuration priority: CLI flags > Environment variables > .env file > Defaults

## CLI Commands

### Domain Commands

```bash
# Check domain availability
epp-cli check-domain example.com

# Get domain information
epp-cli info-domain example.com

# Register a new domain
epp-cli create-domain example.com \
  --registrant CONTACT-123 \
  --ns ns1.example.com,ns2.example.com \
  --period 2

# Update domain
epp-cli update-domain example.com \
  --add-ns ns3.example.com \
  --remove-ns ns1.example.com

# Update nameservers (replace all)
epp-cli update-nameservers example.com \
  --ns ns1.new.com,ns2.new.com

# Enable/disable auto-renew
epp-cli update-auto-renew example.com --enable
epp-cli update-auto-renew example.com --disable
```

### Contact Commands

```bash
# Create a contact
epp-cli create-contact CONTACT-123 \
  --name "John Doe" \
  --email john@example.com \
  --org "Example Corp" \
  --address "123 Main St|Suite 100" \
  --city "New York" \
  --state NY \
  --postcode 10001 \
  --country US \
  --phone "+1.2125551234"
```

### Advanced Commands

```bash
# Send custom EPP XML
epp-cli send-command --file custom-command.xml
epp-cli send-command --xml '<?xml version="1.0"?>...'
```

## CLI Global Options

| Option | Description |
| --- | --- |
| `-h, --help` | Show help message |
| `-v, --version` | Show version |
| `-c, --config <file>` | Load configuration from file |
| `--host <hostname>` | EPP server hostname |
| `--port <number>` | EPP server port (default: 700) |
| `-u, --username <user>` | Login username |
| `-p, --password <pass>` | Login password |
| `-t, --timeout <ms>` | Command timeout in milliseconds |
| `--verbose` | Enable verbose logging |
| `-q, --quiet` | Suppress non-error output |
| `-j, --json` | Output results as JSON |

## CLI Examples

### Complete Registration Flow

```bash
# 1. Check availability
epp-cli check-domain mycompany.com

# 2. Create contact
epp-cli create-contact REG-001 \
  --name "Company Admin" \
  --email admin@mycompany.com \
  --city "San Francisco" \
  --country US

# 3. Register domain
epp-cli create-domain mycompany.com \
  --registrant REG-001 \
  --ns ns1.mycompany.com,ns2.mycompany.com

# 4. Verify registration
epp-cli info-domain mycompany.com
```

### Batch Operations

```bash
# Check multiple domains
for domain in example1.com example2.com example3.com; do
  epp-cli --json check-domain $domain
done

# Update nameservers for multiple domains
for domain in $(cat domains.txt); do
  epp-cli update-nameservers $domain --ns ns1.new.com,ns2.new.com
done
```

### JSON Output for Scripting

```bash
# Check domain and parse with jq
AVAILABLE=$(epp-cli --json check-domain example.com | jq -r '.available')

if [ "$AVAILABLE" = "true" ]; then
  echo "Domain is available!"
fi
```

---

## Development

### Running Tests

```bash
npm test
```

### Building

```bash
npm run build
```

## Contributing

Contributions are welcome! Please see the project repository for guidelines.

## License

MIT © 2025
