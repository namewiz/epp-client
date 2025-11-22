import 'dotenv/config.js';
import EppClient, { EppClientConfig } from './src/index.js';

function parseArgs(argv = []) {
  const args = new Set(argv);
  return {
    runRegisterFlow: args.has('--run-register-flow')
  };
}

async function executeRegisterFlow(client) {
  // Caution: This attempts a real registration when invoked with the flag.
  const domainName = process.env.DEMO_DOMAIN || `demo.name.ng`;
  const contactId = process.env.DEMO_CONTACT_ID || `DEMO-${Date.now()}`;

  console.log('Register flow enabled. Domain:', domainName, 'Registrant ID:', contactId);

  // Optional: check availability before trying to create
  const check = await client.checkDomain({ name: domainName });
  if (check instanceof Error) {
    console.error('Pre-check failed:', check.message);
    return;
  }

  if (check.availability !== 'unregistered') {
    console.log('Domain is not available. Availability:', check.availability, 'Reason:', check.reason);
    return;
  }

  // Create a minimal contact for the registrant
  const contactResult = await client.createContact({
    id: contactId,
    name: process.env.DEMO_CONTACT_NAME || 'NG Domain',
    organisation: process.env.DEMO_CONTACT_ORG || 'NG Domain',
    addressLines: process.env.DEMO_CONTACT_ADDR || 'No 1, Innovation Way',
    city: process.env.DEMO_CONTACT_CITY || 'UYO',
    state: process.env.DEMO_CONTACT_STATE || 'AK',
    postcode: process.env.DEMO_CONTACT_POSTCODE || '100001',
    country: process.env.DEMO_CONTACT_COUNTRY || 'NG',
    phone: process.env.DEMO_CONTACT_PHONE || '+234.0000000000',
    email: process.env.DEMO_CONTACT_EMAIL || 'support@ngdomain.ng'
  });

  if (contactResult instanceof Error) {
    console.error('Contact creation failed:', contactResult.message, contactResult.code ?? '');
    return;
  }

  console.log('Contact created:', contactId);

  const nameservers = process.env.DEMO_NAMESERVERS
    ? process.env.DEMO_NAMESERVERS.split(',').map((s) => s.trim()).filter(Boolean)
    : ['ns1.google.com', 'ns2.google.com'];

  const period = Number(process.env.DEMO_DOMAIN_PERIOD || '1') || 1;
  const authPassword = process.env.DEMO_DOMAIN_AUTH ?? 'TheBest';

  const createResult = await client.createDomain({
    name: domainName,
    period,
    registrant: contactId,
    nameservers,
    authPassword
  });

  if (createResult instanceof Error) {
    console.error('Domain registration failed:', createResult.message, createResult.code ?? '');
    return;
  }

  console.log('Domain registration succeeded:', domainName);
  console.log('Domain registration succeeded:', domainName);
}

async function executeNameserverUpdateTest(client) {
  const domainName = process.env.TEST_DOMAIN;
  if (!domainName) {
    console.log('TEST_DOMAIN env var not set, skipping nameserver update test.');
    return;
  }

  console.log(`\n--- Starting Nameserver Update Test for ${domainName} ---`);

  // 1. Get full info before update
  console.log('Fetching domain info (before update)...');
  const infoBefore = await client.infoDomain({ name: domainName });
  if (infoBefore instanceof Error) {
    console.error('Failed to get domain info:', infoBefore.message);
    return;
  }
  console.log('Current Nameservers:', infoBefore.nameservers);

  // 2. Calculate new nameservers (dns-X -> dns-X+1)
  const currentNs = infoBefore.nameservers;
  const newNs = [];
  currentNs.map(ns => {
    const match = ns.match(/dns-(\d+)\.test\.com/);
    if (match) {
      const num = parseInt(match[1], 10);
      return `dns-${num + 1}.test.com`;
    }
    // Fallback if format doesn't match, just append -new
    return `${ns}.ng`;
  });

  // If list is empty, seed it
  if (newNs.length === 0) {
    newNs.push('dns1.registrar-servers.com', 'dns2.registrar-servers.com');
  }

  console.log('Updating nameservers to:', newNs);

  // 3. Update nameservers
  const updateResult = await client.updateNameservers({
    name: domainName,
    nameservers: newNs
  });

  if (updateResult instanceof Error) {
    console.error('Failed to update nameservers:', updateResult.message);
    return;
  }
  console.log('Update command sent successfully.');

  // 4. Get full info after update
  console.log('Fetching domain info (after update)...');
  const infoAfter = await client.infoDomain({ name: domainName });
  if (infoAfter instanceof Error) {
    console.error('Failed to get domain info:', infoAfter.message);
    return;
  }
  console.log('New Nameservers:', infoAfter.nameservers);
  console.log('--- Nameserver Update Test Completed ---\n');
}

async function main() {
  const { runRegisterFlow } = parseArgs(process.argv.slice(2));
  const client = new EppClient(new EppClientConfig({
    host: process.env.EPP_HOST,
    port: Number(process.env.EPP_PORT) || 700,
    rejectUnauthorized: false
  }));

  client.on('greeting', (message) => {
    console.log('Greeting from registry:', message.data?.svID);
  });

  client.on('response', (message) => {
    // Filter out responses that were already handled by the command promise
    // console.log('Unmatched response received:', message.resultMessage);
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

  // Existing check
  const checkResult = await client.checkDomain({ name: 'justiceo.name.ng' });
  if (checkResult instanceof Error) {
    console.error('Domain check failed:', checkResult.message);
  } else {
    console.log('Check success:', checkResult.success, 'availability:', checkResult.availability, 'reason:', checkResult.reason);
  }

  if (runRegisterFlow) {
    await executeRegisterFlow(client);
  } else {
    console.log('Register flow skipped. Pass --run-register-flow to enable.');
  }

  // Run nameserver update test
  await executeNameserverUpdateTest(client);

  const logoutResult = await client.logout();
  if (logoutResult instanceof Error) {
    console.error('Logout failed:', logoutResult.message);
  }

  await client.disconnect();
}

main().catch((error) => {
  console.error('Unexpected failure:', error);
});
