# EPP Client Test Suite

Comprehensive unit tests for the EPP (Extensible Provisioning Protocol) client library.

## Test Organization

Tests are organized into logical modules matching the EPP command structure:

### Core Tests (`core.test.js`)

- **EppClientConfig**: Configuration validation, cloning, TLS options
- **EppClient**: Client initialization, connection management, command preparation
- **Utilities**: XML escaping, response normalization
- **Transaction Management**: Transaction ID generation and injection

### Session Commands (`session.test.js`)

- **hello**: Server greeting requests
- **login**: Authentication with services/extensions
- **logout**: Session termination

### Contact Commands (`contacts.test.js`)

- **checkContact**: Single and batch availability checks
- **createContact**: Contact creation with full validation
- **infoContact**: Contact information retrieval
- **updateContact**: Contact modification (email, phone, postal info, status)
- **deleteContact**: Contact deletion

### Domain Commands (`domains.test.js`)

- **checkDomain**: Domain availability checks (single/multiple)
- **createDomain**: Domain registration with nameservers, contacts
- **infoDomain**: Domain information retrieval
- **updateDomain**: Nameserver/status/contact/registrant updates
- **deleteDomain**: Domain deletion
- **renewDomain**: Domain renewal
- **updateNameservers**: Convenience method for NS updates
- **updateAutoRenew**: Auto-renewal toggle
- **dumpDomains**: Bulk domain information retrieval

### Transfer Commands (`transfers.test.js`)

- **transferDomain**: Request domain transfer
- **queryTransfer**: Check transfer status
- **approveTransfer**: Approve incoming transfer
- **rejectTransfer**: Reject incoming transfer
- **cancelTransfer**: Cancel outgoing transfer

### RGP Commands (`rgp.test.js`)

- **restoreDomain**: Request domain restoration from redemption period
- **restoreReport**: Submit restore report with deletion/restoration details

### Poll Commands (`poll.test.js`)

- **pollRequest**: Retrieve messages from queue
- **pollAck**: Acknowledge and dequeue messages

## Running Tests

Run all tests:

```bash
npm test
```

Run specific test file:

```bash
node --test test/domains.test.js
```

Run with coverage:

```bash
node --test --experimental-test-coverage test/
```

Watch mode:

```bash
node --test --watch test/
```

## Test Patterns

### Validation Tests

Each command tests for required parameters:

```javascript
test("requires name parameter", async () => {
  const client = new EppClient({ host: "example", port: 700 });
  const result = await client.createDomain({ registrant: "jd1234" });
  assert.ok(result instanceof Error);
  assert.match(result.message, /name.*required/i);
});
```

### XML Generation Tests

Verify correct XML is generated:

```javascript
test("includes nameservers", async () => {
  const client = new EppClient({ host: "example", port: 700 });
  let sentXml = "";
  client.sendCommand = async (xml) => {
    sentXml = xml;
    return { success: true };
  };

  await client.createDomain({
    name: "example.com",
    registrant: "jd1234",
    nameservers: ["ns1.example.com"],
  });

  assert.match(sentXml, /<domain:hostObj>ns1.example.com<\/domain:hostObj>/);
});
```

### Response Parsing Tests

Verify responses are correctly parsed:

```javascript
test("retrieves domain info", async () => {
  const client = new EppClient({ host: "example", port: 700 });
  client.sendCommand = async () => ({
    success: true,
    data: {
      "domain:infData": {
        "domain:name": "example.com",
        "domain:registrant": "jd1234",
      },
    },
  });

  const result = await client.infoDomain({ name: "example.com" });
  assert.equal(result.name, "example.com");
  assert.equal(result.registrantId, "jd1234");
});
```

## Coverage Goals

- **Line Coverage**: > 90%
- **Branch Coverage**: > 85%
- **Function Coverage**: 100%

## Test Data

Tests use mocked EPP servers and don't require actual EPP connectivity. All test data follows RFC 5730-5733 standards.

## Adding New Tests

1. Create test file in appropriate category
2. Use `describe` for grouping related tests
3. Use descriptive test names starting with verbs
4. Follow existing patterns for consistency
5. Mock `sendCommand` for unit tests
6. Test error cases and edge conditions

## Dependencies

Tests use Node.js built-in test runner (Node.js 18+):

- `node:test` - Test framework
- `node:assert/strict` - Assertions

No external test dependencies required.
