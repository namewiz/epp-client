import assert from 'node:assert/strict';
import test from 'node:test';

import EppClient, { EppClientConfig, escapeXml, normalizeEppResponse } from '../src/index.js';

test('EppClientConfig.validate reports missing host', () => {
  const config = new EppClientConfig();
  const result = config.validate();

  assert.ok(result instanceof Error);
  assert.match(result.message, /host/i);
});

test('EppClientConfig.validate reports invalid port range', () => {
  const config = new EppClientConfig({ host: 'example', port: 70000 });
  const result = config.validate();

  assert.ok(result instanceof Error);
  assert.match(result.message, /port/i);
});

test('EppClientConfig.validate returns null when options are valid', () => {
  const config = new EppClientConfig({ host: 'example', port: 700, defaultTimeout: 5000 });
  const result = config.validate();

  assert.equal(result, null);
});

test('EppClientConfig.clone merges overrides into a new instance', () => {
  const original = new EppClientConfig({ host: 'one', port: 700, defaultTimeout: 1000 });
  const clone = original.clone({ port: 701, rejectUnauthorized: true });

  assert.notEqual(clone, original);
  assert.equal(clone.host, 'one');
  assert.equal(clone.port, 701);
  assert.equal(clone.rejectUnauthorized, true);
  assert.equal(clone.defaultTimeout, 1000);
});

test('EppClient.sendCommand returns an error when not connected', async () => {
  const client = new EppClient({ host: 'example', port: 700 });
  const result = await client.sendCommand('<xml />');

  assert.ok(result instanceof Error);
  assert.match(result.message, /not connected/i);
});

test('_prepareCommand injects transaction id when missing', () => {
  const client = new EppClient({ host: 'example', port: 700 });
  client._nextTransactionId = () => 'generated-id';
  const xml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">',
    '  <command>',
    '    <check />',
    '  </command>',
    '</epp>'
  ].join('\n');

  const prepared = client._prepareCommand(xml);

  assert.equal(prepared.transactionId, 'generated-id');
  assert.match(prepared.xml, /<clTRID>generated-id<\/clTRID>/);
});

test('_prepareCommand reuses existing transaction id when provided in XML', () => {
  const client = new EppClient({ host: 'example', port: 700 });
  const xml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">',
    '  <command>',
    '    <check />',
    '    <clTRID>provided-id</clTRID>',
    '  </command>',
    '</epp>'
  ].join('\n');

  const prepared = client._prepareCommand(xml, 'ignored');

  assert.equal(prepared.transactionId, 'provided-id');
  assert.equal(prepared.xml, xml.trim());
});

test('_prepareCommand falls back to provided transaction id when XML clTRID is empty', () => {
  const client = new EppClient({ host: 'example', port: 700 });
  const xml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">',
    '  <command>',
    '    <check />',
    '    <clTRID>   </clTRID>',
    '  </command>',
    '</epp>'
  ].join('\n');

  const prepared = client._prepareCommand(xml, 'fallback-id');

  assert.equal(prepared.transactionId, 'fallback-id');
  assert.equal(prepared.xml, xml.trim());
});

test('_prepareCommand rejects empty payloads', () => {
  const client = new EppClient({ host: 'example', port: 700 });
  const result = client._prepareCommand('   ');

  assert.ok(result instanceof Error);
  assert.match(result.message, /payload/i);
});

test('_prepareCommand rejects payloads missing a closing command tag', () => {
  const client = new EppClient({ host: 'example', port: 700 });
  const xml = '<epp><command><check /></command-missing>';
  const result = client._prepareCommand(xml);

  assert.ok(result instanceof Error);
  assert.match(result.message, /clTRID/i);
});

test('normalizeEppResponse returns greeting metadata', () => {
  const normalized = normalizeEppResponse({
    epp: {
      greeting: {
        svcMenu: {}
      }
    }
  });

  assert.equal(normalized.type, 'greeting');
  assert.equal(normalized.success, true);
  assert.equal(normalized.transactionId, null);
  assert.equal(normalized.resultCode, null);
});

test('normalizeEppResponse flattens response messages and detects success', () => {
  const normalized = normalizeEppResponse({
    epp: {
      response: {
        result: {
          $: { code: '1000' },
          msg: 'Command completed successfully'
        },
        trID: {
          clTRID: 'abc-123',
          svTRID: 'server-456'
        },
        resData: { name: 'example.com' }
      }
    }
  });

  assert.equal(normalized.type, 'response');
  assert.equal(normalized.success, true);
  assert.equal(normalized.resultCode, 1000);
  assert.equal(normalized.resultMessage, 'Command completed successfully');
  assert.deepEqual(normalized.resultMessages, ['Command completed successfully']);
  assert.equal(normalized.transactionId, 'abc-123');
  assert.equal(normalized.serverTransactionId, 'server-456');
  assert.deepEqual(normalized.data, { name: 'example.com' });
});

test('normalizeEppResponse aggregates multiple error messages', () => {
  const normalized = normalizeEppResponse({
    epp: {
      response: {
        result: [
          {
            $: { code: '2303' },
            msg: { _: 'Object does not exist', lang: 'en' }
          },
          {
            msg: ['Additional', 'details']
          }
        ],
        trID: {
          clTRID: 'abc-123',
          svTRID: 'server-456'
        },
        msgQ: { count: '1' },
        extension: { some: 'data' }
      }
    }
  });

  assert.equal(normalized.success, false);
  assert.equal(normalized.resultCode, 2303);
  assert.equal(normalized.resultMessage, 'Object does not exist Additional details');
  assert.deepEqual(normalized.resultMessages, ['Object does not exist', 'Additional details']);
  assert.equal(normalized.transactionId, 'abc-123');
  assert.equal(normalized.serverTransactionId, 'server-456');
  assert.deepEqual(normalized.queue, { count: '1' });
  assert.deepEqual(normalized.extension, { some: 'data' });
});

test('escapeXml safely encodes special characters', () => {
  assert.equal(escapeXml('5 < 7 & 8'), '5 &lt; 7 &amp; 8');
  assert.equal(escapeXml('\"quoted\"'), '&quot;quoted&quot;');
  assert.equal(escapeXml("O'Reilly"), 'O&apos;Reilly');
});

test('escapeXml returns empty string for nullish values', () => {
  assert.equal(escapeXml(null), '');
  assert.equal(escapeXml(undefined), '');
});

test('infoDomain returns parsed domain info', async () => {
  const client = new EppClient({ host: 'example', port: 700 });
  // Mock sendCommand to return a canned response
  client.sendCommand = async (xml) => {
    return {
      success: true,
      data: {
        'domain:infData': {
          'domain:name': 'example.com',
          'domain:roid': 'DOM-123',
          'domain:status': [{ $: { s: 'ok' } }],
          'domain:registrant': 'jd1234',
          'domain:ns': {
            'domain:hostObj': ['ns1.example.com', 'ns2.example.com']
          },
          'domain:clID': 'registrar',
          'domain:crID': 'registrar',
          'domain:crDate': '2023-01-01T00:00:00Z',
          'domain:exDate': '2024-01-01T00:00:00Z'
        }
      }
    };
  };

  const result = await client.infoDomain({ name: 'example.com' });

  assert.equal(result.success, true);
  assert.equal(result.name, 'example.com');
  assert.equal(result.domainId, 'DOM-123');
  assert.deepEqual(result.statuses, ['ok']);
  assert.equal(result.registrantId, 'jd1234');
  assert.deepEqual(result.nameservers, ['ns1.example.com', 'ns2.example.com']);
});

test('dumpDomains returns parsed info for all domains', async () => {
  const client = new EppClient({ host: 'example', port: 700 });
  let sentXml = '';

  client.sendCommand = async (xml) => {
    sentXml = xml;
    return {
      success: true,
      data: {
        'domain:infData': [
          {
            'domain:name': 'one.example',
            'domain:roid': 'DOM-1',
            'domain:status': [{ $: { s: 'ok' } }],
            'domain:registrant': 'jd1234',
            'domain:ns': { 'domain:hostObj': ['ns1.example.com', 'ns2.example.com'] },
            'domain:clID': 'registrar',
            'domain:crID': 'registrar',
            'domain:crDate': '2023-01-01T00:00:00Z',
            'domain:exDate': '2024-01-01T00:00:00Z'
          },
          {
            'domain:name': 'two.example',
            'domain:status': ['clientHold'],
            'domain:ns': { 'domain:hostObj': [] },
            'domain:clID': 'registrar',
            'domain:crID': 'registrar',
            'domain:crDate': '2023-02-01T00:00:00Z',
            'domain:exDate': '2024-02-01T00:00:00Z'
          }
        ]
      }
    };
  };

  const result = await client.dumpDomains();

  assert.equal(Array.isArray(result), true);
  assert.equal(result.length, 2);
  assert.equal(result[0].name, 'one.example');
  assert.equal(result[0].domainId, 'DOM-1');
  assert.equal(result[0].registrantId, 'jd1234');
  assert.deepEqual(result[0].nameservers, ['ns1.example.com', 'ns2.example.com']);
  assert.deepEqual(result[1].statuses, ['clientHold']);
  assert.match(sentXml, /<domain:all\/>/);
});

test('dumpDomains accepts explicit domain names when bulk queries are unsupported', async () => {
  const client = new EppClient({ host: 'example', port: 700 });
  const calls = [];

  client.infoDomain = async ({ name }) => {
    calls.push(name);
    return {
      success: true,
      name,
      domainId: `ID-${name}`,
      registrantId: 'jd1234',
      nameservers: [],
      statuses: [],
      clientId: null,
      createdBy: null,
      createdDate: null,
      updatedBy: null,
      updatedDate: null,
      expiryDate: null
    };
  };

  const result = await client.dumpDomains({ names: ['one.example', 'two.example'] });

  assert.deepEqual(calls, ['one.example', 'two.example']);
  assert.equal(result.length, 2);
  assert.equal(result[0].name, 'one.example');
  assert.equal(result[1].name, 'two.example');
});

test('updateDomain sends correct XML for adding and removing nameservers', async () => {
  const client = new EppClient({ host: 'example', port: 700 });
  let sentXml = '';
  client.sendCommand = async (xml) => {
    sentXml = xml;
    return { success: true };
  };

  await client.updateDomain({
    name: 'example.com',
    add: { nameservers: ['ns3.example.com'] },
    remove: { nameservers: ['ns1.example.com'] }
  });

  assert.match(sentXml, /<domain:update/);
  assert.match(sentXml, /<domain:add>\s*<domain:ns>\s*<domain:hostObj>ns3.example.com<\/domain:hostObj>/);
  assert.match(sentXml, /<domain:rem>\s*<domain:ns>\s*<domain:hostObj>ns1.example.com<\/domain:hostObj>/);
});

test('updateNameservers calculates add/rem correctly', async () => {
  const client = new EppClient({ host: 'example', port: 700 });

  // Mock infoDomain
  client.infoDomain = async () => ({
    success: true,
    nameservers: ['ns1.example.com', 'ns2.example.com']
  });

  // Mock updateDomain
  let updateArgs = null;
  client.updateDomain = async (args) => {
    updateArgs = args;
    return { success: true };
  };

  await client.updateNameservers({
    name: 'example.com',
    nameservers: ['ns1.example.com', 'ns3.example.com']
  });

  assert.ok(updateArgs);
  assert.equal(updateArgs.name, 'example.com');
  assert.deepEqual(updateArgs.add.nameservers, ['ns3.example.com']);
  assert.deepEqual(updateArgs.remove.nameservers, ['ns2.example.com']);
});

test('updateNameservers does nothing if nameservers are unchanged', async () => {
  const client = new EppClient({ host: 'example', port: 700 });

  client.infoDomain = async () => ({
    success: true,
    nameservers: ['ns1.example.com', 'ns2.example.com']
  });

  let updateCalled = false;
  client.updateDomain = async () => {
    updateCalled = true;
    return { success: true };
  };

  const result = await client.updateNameservers({
    name: 'example.com',
    nameservers: ['ns2.example.com', 'ns1.example.com'] // Order shouldn't matter for set comparison, but here we treat list as set
  });

  assert.equal(updateCalled, false);
  assert.equal(result.success, true);
  assert.match(result.message, /already up to date/);
});

test('updateAutoRenew sends correct XML for enabling auto-renew', async () => {
  const client = new EppClient({ host: 'example', port: 700 });
  let sentXml = '';
  client.sendCommand = async (xml) => {
    sentXml = xml;
    return { success: true };
  };

  // autoRenew: true -> remove clientRenewProhibited
  await client.updateAutoRenew({
    name: 'example.com',
    autoRenew: true
  });

  assert.match(sentXml, /<domain:update/);
  assert.match(sentXml, /<domain:rem>\s*<domain:status s="clientRenewProhibited"\/>/);
});

test('updateAutoRenew sends correct XML for disabling auto-renew', async () => {
  const client = new EppClient({ host: 'example', port: 700 });
  let sentXml = '';
  client.sendCommand = async (xml) => {
    sentXml = xml;
    return { success: true };
  };

  // autoRenew: false -> add clientRenewProhibited
  await client.updateAutoRenew({
    name: 'example.com',
    autoRenew: false
  });

  assert.match(sentXml, /<domain:update/);
  assert.match(sentXml, /<domain:add>\s*<domain:status s="clientRenewProhibited"\/>/);
});
