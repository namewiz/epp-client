#!/usr/bin/env node
import { Command } from "commander";
import "dotenv/config.js";
import { readFile } from "node:fs/promises";
import EppClient, { EppClientConfig } from "../lib/index.js";
import { loadConfig, validateRequiredEnv } from "./config.js";
import { logger } from "./logger.js";

const program = new Command();

/**
 * Parse comma-separated values into an array
 */
function parseList(value) {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Create and connect EPP client, execute action, then disconnect
 */
async function withClient(action) {
  const globalOpts = program.opts();

  // Set logger verbosity
  if (globalOpts.verbose) {
    logger.setLevel("verbose");
  } else if (globalOpts.quiet) {
    logger.setLevel("error");
  }

  // Load and validate configuration
  const config = loadConfig(globalOpts);
  const envError = validateRequiredEnv(config);
  if (envError) {
    logger.error(envError.message);
    process.exit(1);
  }

  // Create client
  const client = new EppClient(
    new EppClientConfig({
      host: config.host,
      port: config.port,
      rejectUnauthorized: config.rejectUnauthorized,
      defaultTimeout: config.timeout,
    }),
  );

  // Setup verbose event listeners
  if (globalOpts.verbose) {
    client.on("connect", () => logger.verbose("Connected to EPP server"));
    client.on("greeting", (msg) =>
      logger.verbose("Received greeting:", msg.data?.svID),
    );
    client.on("sent", ({ xml }) => logger.verbose("Sent:", xml));
    client.on("received", ({ xml }) => logger.verbose("Received:", xml));
    client.on("error", (err) => logger.error("Client error:", err.message));
    client.on("close", (err) =>
      logger.verbose("Connection closed:", err?.message || "Clean disconnect"),
    );
  }

  try {
    // Connect
    logger.info("Connecting to EPP server...");
    const connectError = await client.connect();
    if (connectError instanceof Error) {
      logger.error("Connection failed:", connectError.message);
      process.exit(1);
    }

    // Login
    logger.info("Logging in...");
    const loginResult = await client.login({
      username: config.username,
      password: config.password,
      services: config.services,
      extensions: config.extensions,
    });

    if (loginResult instanceof Error) {
      logger.error("Login failed:", loginResult.message);
      await client.disconnect();
      process.exit(1);
    }
    logger.success("Logged in successfully");

    // Execute the action
    const result = await action(client);

    // Output result
    if (globalOpts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      logger.success("Command completed successfully");
      logger.info("Result:", JSON.stringify(result, null, 2));
    }

    // Logout and disconnect
    logger.info("Logging out...");
    await client.logout();
    await client.disconnect();
    logger.success("Disconnected");
  } catch (error) {
    logger.error("Command failed:", error.message);
    if (error.code) logger.error("Error code:", error.code);
    if (process.env.DEBUG) console.error(error);
    try {
      await client.logout();
      await client.disconnect();
    } catch { }
    process.exit(1);
  }
}

// Program setup
program
  .name("epp-cli")
  .description("EPP (Extensible Provisioning Protocol) command line interface")
  .version("1.0.0")
  .option("-c, --config <file>", "Load configuration from file")
  .option("--host <hostname>", "EPP server hostname")
  .option("--port <number>", "EPP server port", "700")
  .option("-u, --username <user>", "EPP login username")
  .option("-p, --password <pass>", "EPP login password")
  .option("-t, --timeout <ms>", "Command timeout in milliseconds")
  .option("--verbose", "Enable verbose logging")
  .option("-q, --quiet", "Suppress non-error output")
  .option("-j, --json", "Output results as JSON");

// check-domain command
program
  .command("check-domain")
  .alias("check")
  .description("Check if a domain is available for registration")
  .argument("<domain>", "Domain name to check")
  .action(async (domain) => {
    await withClient(async (client) => {
      const result = await client.checkDomain({ name: domain });
      if (result instanceof Error) throw result;
      return {
        domain,
        available: result.availability === "unregistered",
        status: result.availability,
        reason: result.reason || null,
      };
    });
  });

// info-domain command
program
  .command("info-domain")
  .alias("info")
  .description("Get detailed information about a domain")
  .argument("<domain>", "Domain name to query")
  .action(async (domain) => {
    await withClient(async (client) => {
      const result = await client.infoDomain({ name: domain });
      if (result instanceof Error) throw result;
      return {
        name: result.name,
        registrant: result.registrant,
        nameservers: result.nameservers,
        status: result.status,
        created: result.crDate,
        updated: result.upDate,
        expires: result.exDate,
        registrar: result.clID,
      };
    });
  });

// create-domain command
program
  .command("create-domain")
  .alias("create")
  .description("Register a new domain")
  .argument("<domain>", "Domain name to register")
  .requiredOption("--registrant <id>", "Contact ID for registrant")
  .option("--ns <nameservers>", "Comma-separated nameservers")
  .option("--period <years>", "Registration period in years", "1")
  .option("--auth <password>", "Authorization password", "changeme")
  .action(async (domain, options) => {
    await withClient(async (client) => {
      const result = await client.createDomain({
        name: domain,
        registrant: options.registrant,
        nameservers: options.ns ? parseList(options.ns) : [],
        period: parseInt(options.period, 10),
        authPassword: options.auth,
      });
      if (result instanceof Error) throw result;
      return {
        success: true,
        domain,
        message: "Domain created successfully",
      };
    });
  });

// create-contact command
program
  .command("create-contact")
  .description("Create a new contact")
  .argument("<id>", "Contact ID")
  .requiredOption("--name <name>", "Contact name")
  .requiredOption("--email <email>", "Email address")
  .requiredOption("--city <city>", "City")
  .requiredOption("--country <code>", "Country code (2 letters)")
  .requiredOption("--address <lines>", "Address lines (pipe-separated)")
  .requiredOption("--phone <number>", "Phone number (e.g., +1.2125551234)")
  .option("--org <name>", "Organization name")
  .option("--state <state>", "State/province")
  .option("--postcode <code>", "Postal code")
  .option("--auth <password>", "Authorization password", "changeme")
  .action(async (id, options) => {
    await withClient(async (client) => {
      const result = await client.createContact({
        id,
        name: options.name,
        email: options.email,
        city: options.city,
        country: options.country,
        organisation: options.org,
        addressLines: options.address
          ? options.address
            .split("|")
            .map((l) => l.trim())
            .filter(Boolean)
          : [],
        state: options.state,
        postcode: options.postcode,
        phone: options.phone,
        authInfo: options.auth,
      });
      if (result instanceof Error) throw result;
      return {
        success: true,
        contactId: id,
        message: "Contact created successfully",
      };
    });
  });

// update-domain command
program
  .command("update-domain")
  .alias("update")
  .description("Update domain attributes")
  .argument("<domain>", "Domain name to update")
  .option("--add-ns <ns>", "Add nameservers (comma-separated)")
  .option("--remove-ns <ns>", "Remove nameservers (comma-separated)")
  .option("--add-status <status>", "Add status (comma-separated)")
  .option("--remove-status <status>", "Remove status (comma-separated)")
  .option("--registrant <id>", "Change registrant contact")
  .option("--auth <password>", "Change authorization password")
  .action(async (domain, options) => {
    const add = {};
    const remove = {};
    const change = {};

    if (options.addNs) add.nameservers = parseList(options.addNs);
    if (options.addStatus) add.status = parseList(options.addStatus);
    if (options.removeNs) remove.nameservers = parseList(options.removeNs);
    if (options.removeStatus) remove.status = parseList(options.removeStatus);
    if (options.registrant) change.registrant = options.registrant;
    if (options.auth) change.authInfo = options.auth;

    if (
      Object.keys(add).length === 0 &&
      Object.keys(remove).length === 0 &&
      Object.keys(change).length === 0
    ) {
      logger.error(
        "At least one update operation is required (--add-ns, --remove-ns, --add-status, etc.)",
      );
      process.exit(1);
    }

    await withClient(async (client) => {
      const result = await client.updateDomain({
        name: domain,
        add: Object.keys(add).length > 0 ? add : undefined,
        remove: Object.keys(remove).length > 0 ? remove : undefined,
        change: Object.keys(change).length > 0 ? change : undefined,
      });
      if (result instanceof Error) throw result;
      return { success: true, domain, message: "Domain updated successfully" };
    });
  });

// update-nameservers command
program
  .command("update-nameservers")
  .description("Replace all nameservers for a domain")
  .argument("<domain>", "Domain name")
  .requiredOption("--ns <nameservers>", "Comma-separated nameservers")
  .action(async (domain, options) => {
    const nameservers = parseList(options.ns);
    await withClient(async (client) => {
      const result = await client.updateNameservers({
        name: domain,
        nameservers,
      });
      if (result instanceof Error) throw result;
      return {
        success: true,
        domain,
        nameservers,
        message: "Nameservers updated successfully",
      };
    });
  });

// update-auto-renew command
program
  .command("update-auto-renew")
  .description("Enable or disable auto-renewal for a domain")
  .argument("<domain>", "Domain name")
  .option("--enable", "Enable auto-renewal")
  .option("--disable", "Disable auto-renewal")
  .action(async (domain, options) => {
    if (!options.enable && !options.disable) {
      logger.error("Either --enable or --disable is required");
      process.exit(1);
    }
    const autoRenew = !!options.enable;

    await withClient(async (client) => {
      const result = await client.updateAutoRenew({ name: domain, autoRenew });
      if (result instanceof Error) throw result;
      return {
        success: true,
        domain,
        autoRenew,
        message: `Auto-renew ${autoRenew ? "enabled" : "disabled"} successfully`,
      };
    });
  });

// send-command command
program
  .command("send-command")
  .description("Send a custom EPP XML command")
  .option("--xml <xml>", "XML command string")
  .option("--file <path>", "Read XML from file")
  .action(async (options) => {
    let xml;
    if (options.xml) {
      xml = options.xml;
    } else if (options.file) {
      xml = await readFile(options.file, "utf8");
    } else {
      logger.error("Either --xml or --file is required");
      process.exit(1);
    }

    const globalOpts = program.opts();
    await withClient(async (client) => {
      const result = await client.sendCommand(xml, {
        timeout: globalOpts.timeout
          ? parseInt(globalOpts.timeout, 10)
          : undefined,
      });
      if (result instanceof Error) throw result;
      return {
        success: result.success,
        resultCode: result.resultCode,
        resultMessage: result.resultMessage,
        data: result.data,
        raw: globalOpts.verbose ? result.raw : undefined,
      };
    });
  });

// hello command
program
  .command("hello")
  .description("Send a hello command to the EPP server")
  .action(async () => {
    await withClient(async (client) => {
      const result = await client.hello();
      if (result instanceof Error) throw result;
      return {
        success: true,
        message: "Hello command sent successfully",
        data: result.data,
      };
    });
  });

// check-contact command
program
  .command("check-contact")
  .description("Check if a contact ID is available")
  .argument("<id>", "Contact ID to check")
  .action(async (id) => {
    await withClient(async (client) => {
      const result = await client.checkContact({ id });
      if (result instanceof Error) throw result;
      return {
        id,
        available: result.available,
        reason: result.reason || null,
      };
    });
  });

// info-contact command
program
  .command("info-contact")
  .description("Get detailed information about a contact")
  .argument("<id>", "Contact ID to query")
  .action(async (id) => {
    await withClient(async (client) => {
      const result = await client.infoContact({ id });
      if (result instanceof Error) throw result;
      return {
        id: result.id,
        name: result.name,
        organisation: result.organisation,
        email: result.email,
        phone: result.phone,
        fax: result.fax,
        addressLines: result.addressLines,
        city: result.city,
        state: result.state,
        postcode: result.postcode,
        country: result.country,
        status: result.status,
        created: result.crDate,
        updated: result.upDate,
        registrar: result.clID,
      };
    });
  });

// update-contact command
program
  .command("update-contact")
  .description("Update contact attributes")
  .argument("<id>", "Contact ID to update")
  .option("--name <name>", "Change contact name")
  .option("--org <name>", "Change organization name")
  .option("--email <email>", "Change email address")
  .option("--phone <number>", "Change phone number")
  .option("--address <lines>", "Change address (pipe-separated)")
  .option("--city <city>", "Change city")
  .option("--state <state>", "Change state/province")
  .option("--postcode <code>", "Change postal code")
  .option("--country <code>", "Change country code")
  .option("--auth <password>", "Change authorization password")
  .option("--add-status <status>", "Add status (comma-separated)")
  .option("--remove-status <status>", "Remove status (comma-separated)")
  .action(async (id, options) => {
    const add = {};
    const remove = {};
    const change = {};

    if (options.addStatus) add.status = parseList(options.addStatus);
    if (options.removeStatus) remove.status = parseList(options.removeStatus);
    if (options.name) change.name = options.name;
    if (options.org) change.organisation = options.org;
    if (options.email) change.email = options.email;
    if (options.phone) change.phone = options.phone;
    if (options.address) {
      change.addressLines = options.address
        .split("|")
        .map((l) => l.trim())
        .filter(Boolean);
    }
    if (options.city) change.city = options.city;
    if (options.state) change.state = options.state;
    if (options.postcode) change.postcode = options.postcode;
    if (options.country) change.country = options.country;
    if (options.auth) change.authInfo = options.auth;

    if (
      Object.keys(add).length === 0 &&
      Object.keys(remove).length === 0 &&
      Object.keys(change).length === 0
    ) {
      logger.error("At least one update operation is required");
      process.exit(1);
    }

    await withClient(async (client) => {
      const result = await client.updateContact({
        id,
        add: Object.keys(add).length > 0 ? add : undefined,
        remove: Object.keys(remove).length > 0 ? remove : undefined,
        change: Object.keys(change).length > 0 ? change : undefined,
      });
      if (result instanceof Error) throw result;
      return { success: true, id, message: "Contact updated successfully" };
    });
  });

// delete-contact command
program
  .command("delete-contact")
  .description("Delete a contact")
  .argument("<id>", "Contact ID to delete")
  .action(async (id) => {
    await withClient(async (client) => {
      const result = await client.deleteContact({ id });
      if (result instanceof Error) throw result;
      return { success: true, id, message: "Contact deleted successfully" };
    });
  });

// delete-domain command
program
  .command("delete-domain")
  .description("Delete a domain")
  .argument("<domain>", "Domain name to delete")
  .action(async (domain) => {
    await withClient(async (client) => {
      const result = await client.deleteDomain({ name: domain });
      if (result instanceof Error) throw result;
      return { success: true, domain, message: "Domain deleted successfully" };
    });
  });

// renew-domain command
program
  .command("renew-domain")
  .alias("renew")
  .description("Renew a domain registration")
  .argument("<domain>", "Domain name to renew")
  .requiredOption("--expiry <date>", "Current expiry date (YYYY-MM-DD)")
  .option("--period <years>", "Renewal period in years", "1")
  .action(async (domain, options) => {
    await withClient(async (client) => {
      const result = await client.renewDomain({
        name: domain,
        currentExpiryDate: options.expiry,
        period: parseInt(options.period, 10),
      });
      if (result instanceof Error) throw result;
      return {
        success: true,
        domain: result.name,
        newExpiryDate: result.expiryDate,
        message: "Domain renewed successfully",
      };
    });
  });

// transfer-domain command
program
  .command("transfer-domain")
  .alias("transfer")
  .description("Request a domain transfer")
  .argument("<domain>", "Domain name to transfer")
  .requiredOption("--auth <password>", "Authorization password for transfer")
  .option("--period <years>", "Transfer period in years")
  .action(async (domain, options) => {
    await withClient(async (client) => {
      const result = await client.transferDomain({
        name: domain,
        authInfo: options.auth,
        period: options.period ? parseInt(options.period, 10) : undefined,
      });
      if (result instanceof Error) throw result;
      return {
        success: true,
        domain: result.name,
        transferStatus: result.transferStatus,
        requestingRegistrar: result.requestingRegistrar,
        requestDate: result.requestDate,
        actionRegistrar: result.actionRegistrar,
        actionDate: result.actionDate,
        message: "Transfer request submitted successfully",
      };
    });
  });

// query-transfer command
program
  .command("query-transfer")
  .description("Query the status of a domain transfer")
  .argument("<domain>", "Domain name to query transfer status")
  .option("--auth <password>", "Authorization password")
  .action(async (domain, options) => {
    await withClient(async (client) => {
      const result = await client.queryTransfer({
        name: domain,
        authInfo: options.auth,
      });
      if (result instanceof Error) throw result;
      return {
        success: result.success,
        resultCode: result.resultCode,
        resultMessage: result.resultMessage,
        data: result.data,
      };
    });
  });

// approve-transfer command
program
  .command("approve-transfer")
  .description("Approve a pending domain transfer")
  .argument("<domain>", "Domain name")
  .option("--auth <password>", "Authorization password")
  .action(async (domain, options) => {
    await withClient(async (client) => {
      const result = await client.approveTransfer({
        name: domain,
        authInfo: options.auth,
      });
      if (result instanceof Error) throw result;
      return {
        success: true,
        domain,
        message: "Transfer approved successfully",
      };
    });
  });

// reject-transfer command
program
  .command("reject-transfer")
  .description("Reject a pending domain transfer")
  .argument("<domain>", "Domain name")
  .option("--auth <password>", "Authorization password")
  .action(async (domain, options) => {
    await withClient(async (client) => {
      const result = await client.rejectTransfer({
        name: domain,
        authInfo: options.auth,
      });
      if (result instanceof Error) throw result;
      return {
        success: true,
        domain,
        message: "Transfer rejected successfully",
      };
    });
  });

// cancel-transfer command
program
  .command("cancel-transfer")
  .description("Cancel a pending domain transfer request")
  .argument("<domain>", "Domain name")
  .option("--auth <password>", "Authorization password")
  .action(async (domain, options) => {
    await withClient(async (client) => {
      const result = await client.cancelTransfer({
        name: domain,
        authInfo: options.auth,
      });
      if (result instanceof Error) throw result;
      return {
        success: true,
        domain,
        message: "Transfer cancelled successfully",
      };
    });
  });

// dump-domains command
program
  .command("dump-domains")
  .description("Get detailed information for multiple domains")
  .argument("<domains>", "Comma-separated domain names")
  .action(async (domains) => {
    const names = parseList(domains);
    await withClient(async (client) => {
      const result = await client.dumpDomains({ names });
      if (result instanceof Error) throw result;
      return result.map((d) => ({
        name: d.name,
        registrant: d.registrant,
        nameservers: d.nameservers,
        status: d.status,
        created: d.crDate,
        updated: d.upDate,
        expires: d.exDate,
        registrar: d.clID,
      }));
    });
  });

// poll-request command
program
  .command("poll-request")
  .alias("poll")
  .description("Request the next message from the poll queue")
  .action(async () => {
    await withClient(async (client) => {
      const result = await client.pollRequest();
      if (result instanceof Error) throw result;
      return {
        success: result.success,
        count: result.count,
        messageId: result.messageId,
        queueDate: result.queueDate,
        message: result.message,
        data: result.data,
      };
    });
  });

// poll-ack command
program
  .command("poll-ack")
  .description("Acknowledge a poll message")
  .argument("<messageId>", "Message ID to acknowledge")
  .action(async (messageId) => {
    await withClient(async (client) => {
      const result = await client.pollAck({ messageId });
      if (result instanceof Error) throw result;
      return {
        success: result.success,
        count: result.count,
        messageId: result.messageId,
        message: "Message acknowledged successfully",
      };
    });
  });

// check-host command
program
  .command("check-host")
  .description("Check if a host name is available")
  .argument("<name>", "Host name to check (e.g., ns1.example.com)")
  .action(async (name) => {
    await withClient(async (client) => {
      const result = await client.checkHost({ name });
      if (result instanceof Error) throw result;
      return {
        name,
        available: result.available,
        reason: result.reason || null,
      };
    });
  });

// create-host command
program
  .command("create-host")
  .description("Create a new host (nameserver)")
  .argument("<name>", "Host name (e.g., ns1.example.com)")
  .option("--ip <addresses>", "Comma-separated IP addresses")
  .action(async (name, options) => {
    const addresses = options.ip
      ? parseList(options.ip).map((addr) => ({
          address: addr,
          ip: addr.includes(":") ? "v6" : "v4",
        }))
      : [];

    await withClient(async (client) => {
      const result = await client.createHost({ name, addresses });
      if (result instanceof Error) throw result;
      return { success: true, name, message: "Host created successfully" };
    });
  });

// info-host command
program
  .command("info-host")
  .description("Get detailed information about a host")
  .argument("<name>", "Host name to query")
  .action(async (name) => {
    await withClient(async (client) => {
      const result = await client.infoHost({ name });
      if (result instanceof Error) throw result;
      return {
        name: result.name,
        roid: result.roid,
        status: result.status,
        addresses: result.addresses,
        created: result.crDate,
        updated: result.upDate,
        registrar: result.clID,
      };
    });
  });

// update-host command
program
  .command("update-host")
  .description("Update host attributes")
  .argument("<name>", "Host name to update")
  .option("--add-ip <addresses>", "Add IP addresses (comma-separated)")
  .option("--remove-ip <addresses>", "Remove IP addresses (comma-separated)")
  .option("--add-status <status>", "Add status (comma-separated)")
  .option("--remove-status <status>", "Remove status (comma-separated)")
  .option("--new-name <name>", "Change host name")
  .action(async (name, options) => {
    const add = {};
    const remove = {};
    const change = {};

    if (options.addIp) {
      add.addresses = parseList(options.addIp).map((addr) => ({
        address: addr,
        ip: addr.includes(":") ? "v6" : "v4",
      }));
    }
    if (options.removeIp) {
      remove.addresses = parseList(options.removeIp).map((addr) => ({
        address: addr,
        ip: addr.includes(":") ? "v6" : "v4",
      }));
    }
    if (options.addStatus) add.status = parseList(options.addStatus);
    if (options.removeStatus) remove.status = parseList(options.removeStatus);
    if (options.newName) change.name = options.newName;

    if (
      Object.keys(add).length === 0 &&
      Object.keys(remove).length === 0 &&
      Object.keys(change).length === 0
    ) {
      logger.error("At least one update operation is required");
      process.exit(1);
    }

    await withClient(async (client) => {
      const result = await client.updateHost({
        name,
        add: Object.keys(add).length > 0 ? add : undefined,
        remove: Object.keys(remove).length > 0 ? remove : undefined,
        change: Object.keys(change).length > 0 ? change : undefined,
      });
      if (result instanceof Error) throw result;
      return { success: true, name, message: "Host updated successfully" };
    });
  });

// delete-host command
program
  .command("delete-host")
  .description("Delete a host")
  .argument("<name>", "Host name to delete")
  .action(async (name) => {
    await withClient(async (client) => {
      const result = await client.deleteHost({ name });
      if (result instanceof Error) throw result;
      return { success: true, name, message: "Host deleted successfully" };
    });
  });

program.parse();
