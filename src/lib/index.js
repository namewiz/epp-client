import { EventEmitter } from "node:events";
import { connect as tlsConnect } from "node:tls";
import { parseStringPromise } from "xml2js";

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>';
const DEFAULT_SERVICES = [
  "urn:ietf:params:xml:ns:domain-1.0",
  "urn:ietf:params:xml:ns:contact-1.0",
  // "urn:ietf:params:xml:ns:host-1.0", // host commands aren't applicable to all registries.
];

export class EppClientConfig {
  constructor ({
    host = "",
    port = 700,
    rejectUnauthorized = false,
    defaultTimeout = 60000,
  } = {}) {
    this.host = host ?? process.env.EPP_HOST;
    this.port = port ?? Number(process.env.EPP_PORT);
    this.rejectUnauthorized = rejectUnauthorized;
    this.defaultTimeout = defaultTimeout;
  }

  clone(overrides = {}) {
    return new EppClientConfig({
      host: overrides.host ?? this.host,
      port: overrides.port ?? this.port,
      rejectUnauthorized:
        overrides.rejectUnauthorized ?? this.rejectUnauthorized,
      defaultTimeout: overrides.defaultTimeout ?? this.defaultTimeout,
    });
  }

  validate() {
    if (!this.host) {
      return new Error('The "host" option is required.');
    }

    if (!Number.isInteger(this.port) || this.port <= 0 || this.port > 65535) {
      return new Error(
        'The "port" option must be an integer between 1 and 65535.',
      );
    }

    if (!Number.isInteger(this.defaultTimeout) || this.defaultTimeout < 0) {
      return new Error(
        'The "defaultTimeout" option must be a non-negative integer.',
      );
    }

    return null;
  }

  toTlsOptions() {
    return {
      host: this.host,
      port: this.port,
      rejectUnauthorized: this.rejectUnauthorized,
    };
  }
}

export class EppClient extends EventEmitter {
  constructor (options = {}) {
    super();

    this._config =
      options instanceof EppClientConfig
        ? options
        : new EppClientConfig(options);
    this._socket = null;
    this._buffer = Buffer.alloc(0);
    this._pending = new Map();
    this._connected = false;
    this._transactionIdCounter = 0;

    this._onData = (chunk) => {
      void this._handleData(chunk);
    };

    this._onClose = (error) => {
      this._handleClose(error);
    };

    this._onSocketError = (error) => {
      this._handleSocketError(error);
    };
  }

  get isConnected() {
    return this._connected;
  }

  get config() {
    return this._config;
  }

  configure(overrides = {}) {
    this._config = this._config.clone(overrides);
    return this._config;
  }

  async connect() {
    const validationError = this._config.validate();

    if (validationError) {
      return validationError;
    }

    if (this._socket) {
      return new Error("The client is already connected.");
    }

    return new Promise((resolve) => {
      const socket = tlsConnect(this._config.toTlsOptions());

      const handleError = (error) => {
        cleanup();
        socket.destroy();
        resolve(normalizeError(error, "Failed to connect to the EPP server."));
      };

      const handleConnect = () => {
        cleanup();
        this._socket = socket;
        this._connected = true;
        this._buffer = Buffer.alloc(0);

        socket.on("data", this._onData);
        socket.on("close", this._onClose);
        socket.on("error", this._onSocketError);

        this.emit("connect");
        resolve(null);
      };

      const cleanup = () => {
        socket.removeListener("secureConnect", handleConnect);
        socket.removeListener("error", handleError);
      };

      socket.once("secureConnect", handleConnect);
      socket.once("error", handleError);
    });
  }

  async disconnect() {
    if (!this._socket) {
      return null;
    }

    return new Promise((resolve) => {
      const socket = this._socket;

      const handleClose = () => {
        socket.removeListener("error", handleError);
        resolve(null);
      };

      const handleError = (error) => {
        socket.removeListener("close", handleClose);
        resolve(
          normalizeError(
            error,
            "Socket error while closing the EPP connection.",
          ),
        );
      };

      socket.once("close", handleClose);
      socket.once("error", handleError);
      socket.end();
    });
  }

  destroy(error) {
    if (this._socket) {
      this._socket.destroy(error);
    }

    this._handleClose(error);
  }

  async sendCommand(xml, { transactionId, timeout } = {}) {
    const connectivityError = this._ensureConnected();

    if (connectivityError) {
      return connectivityError;
    }

    const prepared = this._prepareCommand(xml, transactionId);

    if (prepared instanceof Error) {
      return prepared;
    }

    const payload = Buffer.from(prepared.xml.trim(), "utf8");
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(payload.length + 4, 0);
    const message = Buffer.concat([header, payload]);
    const socket = this._socket;
    const timeoutMs = timeout ?? this._config.defaultTimeout;

    if (!socket) {
      return new Error("Unable to access the underlying socket.");
    }

    return new Promise((resolve) => {
      const settle = (outcome) => {
        if (timer) {
          clearTimeout(timer);
        }

        resolve(outcome);
      };

      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
            this._pending.delete(prepared.transactionId);
            settle(new Error(`EPP command timed out after ${timeoutMs}ms.`));
          }, timeoutMs)
          : null;

      this._pending.set(prepared.transactionId, settle);

      try {
        socket.write(message);
      } catch (error) {
        if (timer) {
          clearTimeout(timer);
        }

        this._pending.delete(prepared.transactionId);
        settle(normalizeError(error, "Failed to send the EPP command."));
        return;
      }

      this.emit("sent", {
        transactionId: prepared.transactionId,
        xml: prepared.xml.trim(),
      });
    });
  }

  async hello({ transactionId, timeout } = {}) {
    const clTRID = transactionId ?? this._nextTransactionId();
    const xml = buildHelloCommand();
    return this.sendCommand(xml, { transactionId: clTRID, timeout });
  }

  async login({
    username,
    password,
    services = DEFAULT_SERVICES,
    extensions = [],
    transactionId,
    timeout,
  } = {}) {
    if (!username || !password) {
      return new Error(
        'Both "username" and "password" are required for login.',
      );
    }

    const clTRID = transactionId ?? this._nextTransactionId();
    const xml = buildLoginCommand({
      username,
      password,
      services,
      extensions,
      transactionId: clTRID,
    });
    return this.sendCommand(xml, { transactionId: clTRID, timeout });
  }

  async logout({ transactionId, timeout } = {}) {
    const clTRID = transactionId ?? this._nextTransactionId();
    const xml = buildLogoutCommand({ transactionId: clTRID });
    return this.sendCommand(xml, { transactionId: clTRID, timeout });
  }

  // ========================================
  // CONTACT COMMANDS
  // ========================================

  async checkContact({ id, transactionId, timeout } = {}) {
    if (!id) {
      return new Error('The "id" field is required to check a contact.');
    }

    const clTRID = transactionId ?? this._nextTransactionId();
    const ids = Array.isArray(id) ? id : [id];
    const xml = buildCheckContactCommand({ ids, transactionId: clTRID });
    const outcome = await this.sendCommand(xml, {
      transactionId: clTRID,
      timeout,
    });

    if (outcome instanceof Error) {
      return outcome;
    }

    const resData = outcome?.data || {};
    const chkData = resData["contact:chkData"] || resData.chkData || {};
    const cd = ensureArray(chkData["contact:cd"] || chkData.cd || []);

    const results = cd.map((item) => {
      const idNode = item["contact:id"] || item.id || {};
      const contactId =
        typeof idNode === "string" ? idNode : idNode._ || idNode;
      const availRaw = idNode.$?.avail ?? null;
      const availNum =
        typeof availRaw === "string" || typeof availRaw === "number"
          ? Number(availRaw)
          : NaN;
      const available = availNum === 1;

      return {
        id: contactId,
        available,
        reason: item["contact:reason"] || item.reason || null,
      };
    });

    return Array.isArray(id) ? results : results[0];
  }

  async createContact({
    id,
    name,
    organisation,
    addressLines = [],
    city,
    state,
    postcode,
    country,
    phone,
    email,
    authInfo = "changeme",
    transactionId,
    timeout,
  } = {}) {
    if (!id) {
      return new Error('The "id" field is required to create a contact.');
    }

    if (!name) {
      return new Error('The "name" field is required to create a contact.');
    }

    if (!city) {
      return new Error('The "city" field is required to create a contact.');
    }

    if (!country) {
      return new Error('The "country" field is required to create a contact.');
    }

    if (!email) {
      return new Error('The "email" field is required to create a contact.');
    }

    // todo: add phone and street as required.

    const clTRID = transactionId ?? this._nextTransactionId();
    const xml = buildCreateContactCommand({
      id,
      name,
      organisation,
      addressLines,
      city,
      state,
      postcode,
      country,
      phone,
      email,
      authInfo,
      transactionId: clTRID,
    });

    return this.sendCommand(xml, { transactionId: clTRID, timeout });
  }

  async infoContact({ id, transactionId, timeout } = {}) {
    if (!id) {
      return new Error('The "id" field is required to get contact info.');
    }

    const clTRID = transactionId ?? this._nextTransactionId();
    const xml = buildInfoContactCommand({ id, transactionId: clTRID });
    const outcome = await this.sendCommand(xml, {
      transactionId: clTRID,
      timeout,
    });

    if (outcome instanceof Error) {
      return outcome;
    }

    const resData = outcome?.data || {};
    const infData = resData["contact:infData"] || resData.infData || {};

    return parseContactInfo(infData, id);
  }

  async updateContact({
    id,
    add,
    remove,
    change,
    transactionId,
    timeout,
  } = {}) {
    if (!id) {
      return new Error('The "id" field is required to update a contact.');
    }

    const clTRID = transactionId ?? this._nextTransactionId();
    const xml = buildUpdateContactCommand({
      id,
      add,
      remove,
      change,
      transactionId: clTRID,
    });

    return this.sendCommand(xml, { transactionId: clTRID, timeout });
  }

  async deleteContact({ id, transactionId, timeout } = {}) {
    if (!id) {
      return new Error('The "id" field is required to delete a contact.');
    }

    const clTRID = transactionId ?? this._nextTransactionId();
    const xml = buildDeleteContactCommand({ id, transactionId: clTRID });
    return this.sendCommand(xml, { transactionId: clTRID, timeout });
  }

  // ========================================
  // DOMAIN COMMANDS
  // ========================================

  async checkDomain({ name, transactionId, timeout } = {}) {
    if (!name) {
      return new Error('The "name" field is required to check a domain.');
    }

    const clTRID = transactionId ?? this._nextTransactionId();
    const names = Array.isArray(name) ? name : [name];
    const xml = buildCheckDomainCommand({ names, transactionId: clTRID });
    const outcome = await this.sendCommand(xml, {
      transactionId: clTRID,
      timeout,
    });

    if (outcome instanceof Error) {
      return outcome;
    }

    const resData = outcome?.data || {};
    const chkData = resData["domain:chkData"] || resData.chkData || {};
    const cd = ensureArray(chkData["domain:cd"] || chkData.cd || []);

    const results = cd.map((item) => {
      const nameNode = item["domain:name"] || item.name || {};
      const domainName =
        typeof nameNode === "string" ? nameNode : nameNode._ || nameNode;
      const availRaw = nameNode.$?.avail ?? null;
      const availNum =
        typeof availRaw === "string" || typeof availRaw === "number"
          ? Number(availRaw)
          : NaN;
      const availability = availNum === 1 ? "unregistered" : "registered";
      const reasonNode = item["domain:reason"] || item.reason || "";
      const reason = extractMessage(reasonNode) || "";

      return {
        success: Boolean(outcome.success),
        name: domainName,
        availability,
        reason,
      };
    });

    return Array.isArray(name) ? results : results[0];
  }

  async createDomain({
    name,
    period = 1,
    registrant,
    nameservers = [],
    contacts = [],
    authPassword = "changeme",
    transactionId,
    timeout,
  } = {}) {
    if (!name) {
      return new Error('The "name" field is required to create a domain.');
    }

    if (!registrant) {
      return new Error(
        'The "registrant" field is required to create a domain.',
      );
    }

    const clTRID = transactionId ?? this._nextTransactionId();
    const xml = buildCreateDomainCommand({
      name,
      period,
      registrant,
      nameservers,
      contacts,
      authPassword,
      transactionId: clTRID,
    });

    return this.sendCommand(xml, { transactionId: clTRID, timeout });
  }

  async infoDomain({ name, authInfo, transactionId, timeout } = {}) {
    if (!name) {
      return new Error('The "name" field is required to get domain info.');
    }

    const clTRID = transactionId ?? this._nextTransactionId();
    const xml = buildInfoDomainCommand({
      name,
      authInfo,
      transactionId: clTRID,
    });
    const outcome = await this.sendCommand(xml, {
      transactionId: clTRID,
      timeout,
    });

    if (outcome instanceof Error) {
      return outcome;
    }

    const resData = outcome?.data || {};
    const infData = resData["domain:infData"] || resData.infData || {};

    return parseDomainInfo(infData, name);
  }

  async updateDomain({
    name,
    add,
    remove,
    change,
    transactionId,
    timeout,
  } = {}) {
    if (!name) {
      return new Error('The "name" field is required to update a domain.');
    }

    const clTRID = transactionId ?? this._nextTransactionId();
    const xml = buildUpdateDomainCommand({
      name,
      add,
      remove,
      change,
      transactionId: clTRID,
    });

    return this.sendCommand(xml, { transactionId: clTRID, timeout });
  }

  async deleteDomain({ name, transactionId, timeout } = {}) {
    if (!name) {
      return new Error('The "name" field is required to delete a domain.');
    }

    const clTRID = transactionId ?? this._nextTransactionId();
    const xml = buildDeleteDomainCommand({ name, transactionId: clTRID });
    return this.sendCommand(xml, { transactionId: clTRID, timeout });
  }

  async renewDomain({
    name,
    currentExpiryDate,
    period = 1,
    transactionId,
    timeout,
  } = {}) {
    if (!name) {
      return new Error('The "name" field is required to renew a domain.');
    }

    if (!currentExpiryDate) {
      return new Error(
        'The "currentExpiryDate" field is required to renew a domain.',
      );
    }

    const clTRID = transactionId ?? this._nextTransactionId();
    const xml = buildRenewDomainCommand({
      name,
      currentExpiryDate,
      period,
      transactionId: clTRID,
    });

    const outcome = await this.sendCommand(xml, {
      transactionId: clTRID,
      timeout,
    });

    if (outcome instanceof Error) {
      return outcome;
    }

    const resData = outcome?.data || {};
    const renData = resData["domain:renData"] || resData.renData || {};

    return {
      success: true,
      name: extractMessage(renData["domain:name"] || renData.name) || name,
      expiryDate:
        extractMessage(renData["domain:exDate"] || renData.exDate) || null,
    };
  }

  async transferDomain({
    name,
    authInfo,
    period,
    transactionId,
    timeout,
  } = {}) {
    if (!name) {
      return new Error('The "name" field is required to transfer a domain.');
    }

    if (!authInfo) {
      return new Error(
        'The "authInfo" field is required to transfer a domain.',
      );
    }

    const clTRID = transactionId ?? this._nextTransactionId();
    const xml = buildTransferDomainCommand({
      name,
      authInfo,
      period,
      operation: "request",
      transactionId: clTRID,
    });

    const outcome = await this.sendCommand(xml, {
      transactionId: clTRID,
      timeout,
    });

    if (outcome instanceof Error) {
      return outcome;
    }

    const resData = outcome?.data || {};
    const trnData = resData["domain:trnData"] || resData.trnData || {};

    return {
      success: true,
      name: extractMessage(trnData["domain:name"] || trnData.name) || name,
      transferStatus:
        extractMessage(trnData["domain:trStatus"] || trnData.trStatus) || null,
      requestingRegistrar:
        extractMessage(trnData["domain:reID"] || trnData.reID) || null,
      requestDate:
        extractMessage(trnData["domain:reDate"] || trnData.reDate) || null,
      actionRegistrar:
        extractMessage(trnData["domain:acID"] || trnData.acID) || null,
      actionDate:
        extractMessage(trnData["domain:acDate"] || trnData.acDate) || null,
    };
  }

  async queryTransfer({ name, authInfo, transactionId, timeout } = {}) {
    if (!name) {
      return new Error(
        'The "name" field is required to query transfer status.',
      );
    }

    const clTRID = transactionId ?? this._nextTransactionId();
    const xml = buildTransferDomainCommand({
      name,
      authInfo,
      operation: "query",
      transactionId: clTRID,
    });

    return this.sendCommand(xml, { transactionId: clTRID, timeout });
  }

  async approveTransfer({ name, authInfo, transactionId, timeout } = {}) {
    if (!name) {
      return new Error('The "name" field is required to approve a transfer.');
    }

    const clTRID = transactionId ?? this._nextTransactionId();
    const xml = buildTransferDomainCommand({
      name,
      authInfo,
      operation: "approve",
      transactionId: clTRID,
    });

    return this.sendCommand(xml, { transactionId: clTRID, timeout });
  }

  async rejectTransfer({ name, authInfo, transactionId, timeout } = {}) {
    if (!name) {
      return new Error('The "name" field is required to reject a transfer.');
    }

    const clTRID = transactionId ?? this._nextTransactionId();
    const xml = buildTransferDomainCommand({
      name,
      authInfo,
      operation: "reject",
      transactionId: clTRID,
    });

    return this.sendCommand(xml, { transactionId: clTRID, timeout });
  }

  async cancelTransfer({ name, authInfo, transactionId, timeout } = {}) {
    if (!name) {
      return new Error('The "name" field is required to cancel a transfer.');
    }

    const clTRID = transactionId ?? this._nextTransactionId();
    const xml = buildTransferDomainCommand({
      name,
      authInfo,
      operation: "cancel",
      transactionId: clTRID,
    });

    return this.sendCommand(xml, { transactionId: clTRID, timeout });
  }

  // ========================================
  // CONVENIENCE METHODS
  // ========================================

  async updateNameservers({ name, nameservers, transactionId, timeout } = {}) {
    if (!name) {
      return new Error('The "name" field is required to update nameservers.');
    }
    if (!Array.isArray(nameservers)) {
      return new Error('The "nameservers" field must be an array.');
    }

    const infoResult = await this.infoDomain({ name, transactionId, timeout });
    if (infoResult instanceof Error) {
      return infoResult;
    }

    const currentNameservers = new Set(infoResult.nameservers);
    const newNameservers = new Set(nameservers);

    const toAdd = nameservers.filter((ns) => !currentNameservers.has(ns));
    const toRemove = infoResult.nameservers.filter(
      (ns) => !newNameservers.has(ns),
    );

    if (toAdd.length === 0 && toRemove.length === 0) {
      return { success: true, message: "Nameservers are already up to date." };
    }

    return this.updateDomain({
      name,
      add: toAdd.length ? { nameservers: toAdd } : undefined,
      remove: toRemove.length ? { nameservers: toRemove } : undefined,
      transactionId,
      timeout,
    });
  }

  async updateAutoRenew({ name, autoRenew, transactionId, timeout } = {}) {
    if (!name) {
      return new Error('The "name" field is required to update auto-renew.');
    }
    if (typeof autoRenew !== "boolean") {
      return new Error('The "autoRenew" field must be a boolean.');
    }

    // autoRenew = true  => remove clientRenewProhibited
    // autoRenew = false => add clientRenewProhibited
    const status = "clientRenewProhibited";

    return this.updateDomain({
      name,
      add: !autoRenew ? { status: [status] } : undefined,
      remove: autoRenew ? { status: [status] } : undefined,
      transactionId,
      timeout,
    });
  }

  // ========================================
  // POLL COMMANDS
  // ========================================

  async pollRequest({ transactionId, timeout } = {}) {
    const clTRID = transactionId ?? this._nextTransactionId();
    const xml = buildPollCommand({ operation: "req", transactionId: clTRID });
    const outcome = await this.sendCommand(xml, {
      transactionId: clTRID,
      timeout,
    });

    if (outcome instanceof Error) {
      return outcome;
    }

    const queue = outcome?.queue || null;
    const resData = outcome?.data || null;

    return {
      success: true,
      count: queue?.$?.count ? Number(queue.$.count) : 0,
      messageId: queue?.$?.id || null,
      queueDate: queue?.qDate || null,
      message: extractMessage(queue?.msg) || null,
      data: resData,
    };
  }

  async pollAck({ messageId, transactionId, timeout } = {}) {
    if (!messageId) {
      return new Error(
        'The "messageId" field is required to acknowledge a poll message.',
      );
    }

    const clTRID = transactionId ?? this._nextTransactionId();
    const xml = buildPollCommand({
      operation: "ack",
      messageId,
      transactionId: clTRID,
    });
    const outcome = await this.sendCommand(xml, {
      transactionId: clTRID,
      timeout,
    });

    if (outcome instanceof Error) {
      return outcome;
    }

    const queue = outcome?.queue || null;

    return {
      success: true,
      count: queue?.$?.count ? Number(queue.$.count) : 0,
      messageId: queue?.$?.id || null,
    };
  }

  // ========================================
  // HOST COMMANDS
  // ========================================

  async checkHost({ name, transactionId, timeout } = {}) {
    if (!name) {
      return new Error('The "name" field is required to check a host.');
    }

    const clTRID = transactionId ?? this._nextTransactionId();
    const names = Array.isArray(name) ? name : [name];
    const xml = buildCheckHostCommand({ names, transactionId: clTRID });
    const outcome = await this.sendCommand(xml, {
      transactionId: clTRID,
      timeout,
    });

    if (outcome instanceof Error) {
      return outcome;
    }

    const resData = outcome?.data || {};
    const chkData = resData["host:chkData"] || resData.chkData || {};
    const cd = ensureArray(chkData["host:cd"] || chkData.cd || []);

    const results = cd.map((item) => {
      const nameNode = item["host:name"] || item.name || {};
      const hostName =
        typeof nameNode === "string" ? nameNode : nameNode._ || nameNode;
      const availRaw = nameNode.$?.avail ?? null;
      const availNum =
        typeof availRaw === "string" || typeof availRaw === "number"
          ? Number(availRaw)
          : NaN;
      const available = availNum === 1;

      return {
        name: hostName,
        available,
        reason: extractMessage(item["host:reason"] || item.reason) || null,
      };
    });

    return Array.isArray(name) ? results : results[0];
  }

  async createHost({ name, addresses = [], transactionId, timeout } = {}) {
    if (!name) {
      return new Error('The "name" field is required to create a host.');
    }

    const clTRID = transactionId ?? this._nextTransactionId();
    const xml = buildCreateHostCommand({
      name,
      addresses,
      transactionId: clTRID,
    });
    return this.sendCommand(xml, { transactionId: clTRID, timeout });
  }

  async infoHost({ name, transactionId, timeout } = {}) {
    if (!name) {
      return new Error('The "name" field is required to get host info.');
    }

    const clTRID = transactionId ?? this._nextTransactionId();
    const xml = buildInfoHostCommand({ name, transactionId: clTRID });
    const outcome = await this.sendCommand(xml, {
      transactionId: clTRID,
      timeout,
    });

    if (outcome instanceof Error) {
      return outcome;
    }

    const resData = outcome?.data || {};
    const infData = resData["host:infData"] || resData.infData || {};

    return parseHostInfo(infData, name);
  }

  async updateHost({ name, add, remove, change, transactionId, timeout } = {}) {
    if (!name) {
      return new Error('The "name" field is required to update a host.');
    }

    const clTRID = transactionId ?? this._nextTransactionId();
    const xml = buildUpdateHostCommand({
      name,
      add,
      remove,
      change,
      transactionId: clTRID,
    });

    return this.sendCommand(xml, { transactionId: clTRID, timeout });
  }

  async deleteHost({ name, transactionId, timeout } = {}) {
    if (!name) {
      return new Error('The "name" field is required to delete a host.');
    }

    const clTRID = transactionId ?? this._nextTransactionId();
    const xml = buildDeleteHostCommand({ name, transactionId: clTRID });
    return this.sendCommand(xml, { transactionId: clTRID, timeout });
  }

  // ========================================
  // INTERNAL METHODS
  // ========================================

  async _handleData(chunk) {
    this._buffer = Buffer.concat([this._buffer, chunk]);

    while (this._buffer.length >= 4) {
      const messageLength = this._buffer.readUInt32BE(0);

      if (this._buffer.length < messageLength) {
        return;
      }

      const payload = this._buffer.slice(4, messageLength);
      this._buffer = this._buffer.slice(messageLength);
      const xml = payload
        .toString("utf8")
        .replace(/\u0000/g, "")
        .trim();

      if (!xml) {
        continue;
      }

      this.emit("received", { xml });

      const processingResult = await this._processIncomingXml(xml);

      if (processingResult instanceof Error) {
        this.emit("error", processingResult);
      }
    }
  }

  async _processIncomingXml(xml) {
    let parsed;

    try {
      parsed = await parseStringPromise(xml, {
        explicitArray: false,
        trim: true,
        normalize: false,
      });
    } catch (error) {
      return normalizeError(error, "Failed to parse EPP XML response.");
    }

    const normalized = normalizeEppResponse(parsed);
    normalized.raw = xml;
    normalized.parsed = parsed;

    this.emit("message", normalized);

    if (normalized.type === "greeting") {
      this.emit("greeting", normalized);
      return null;
    }

    const transactionId = normalized.transactionId;

    if (transactionId && this._pending.has(transactionId)) {
      const settle = this._pending.get(transactionId);
      this._pending.delete(transactionId);

      if (normalized.success) {
        settle(normalized);
      } else {
        settle(createCommandError(normalized));
      }

      return null;
    }

    this.emit("response", normalized);

    if (!normalized.success) {
      return createCommandError(normalized);
    }

    return null;
  }

  _handleClose(error) {
    if (this._socket) {
      this._socket.removeListener("data", this._onData);
      this._socket.removeListener("close", this._onClose);
      this._socket.removeListener("error", this._onSocketError);
      this._socket = null;
    }

    const wasConnected = this._connected;
    this._connected = false;
    const reason = error
      ? normalizeError(error)
      : new Error("EPP connection closed.");

    if (this._pending.size) {
      this._resolveAll(reason);
    }

    if (wasConnected) {
      this.emit("close", reason);
    }
  }

  _handleSocketError(error) {
    const normalized = normalizeError(error, "Socket error encountered.");
    this.emit("error", normalized);
    this._resolveAll(normalized);

    if (this._socket && !this._socket.destroyed) {
      this._socket.destroy(normalized);
    }
  }

  _resolveAll(outcome) {
    const resolvedOutcome =
      outcome instanceof Error ? outcome : normalizeError(outcome);

    for (const settle of this._pending.values()) {
      settle(resolvedOutcome);
    }

    this._pending.clear();
  }

  _ensureConnected() {
    if (!this._socket || !this._connected) {
      return new Error("The client is not connected. Call connect() first.");
    }

    return null;
  }

  _nextTransactionId() {
    this._transactionIdCounter += 1;
    return `tx-${Date.now()}-${this._transactionIdCounter}`;
  }

  _prepareCommand(xml, providedTransactionId) {
    const trimmed = typeof xml === "string" ? xml.trim() : "";

    if (!trimmed) {
      return new Error("An XML payload is required.");
    }

    const match = trimmed.match(/<clTRID>([^<]*)<\/clTRID>/i);

    if (match) {
      const existing = match[1] ? match[1].trim() : "";
      const transactionId =
        existing || providedTransactionId || this._nextTransactionId();
      return { xml: trimmed, transactionId };
    }

    const transactionId = providedTransactionId ?? this._nextTransactionId();

    if (!/<\/command>/i.test(trimmed)) {
      return new Error(
        "Unable to inject <clTRID>: no </command> closing tag found.",
      );
    }

    const injection = `    <clTRID>${escapeXml(transactionId)}</clTRID>`;
    const updated = trimmed.replace(
      /<\/command>/i,
      `${injection}\n  </command>`,
    );

    return { xml: updated, transactionId };
  }
}

// ========================================
// COMMAND BUILDERS
// ========================================

function buildHelloCommand() {
  return `${XML_HEADER}
<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">
  <hello/>
</epp>`;
}

function buildLoginCommand({
  username,
  password,
  services,
  extensions,
  transactionId,
}) {
  const serviceLines = (
    services && services.length ? services : DEFAULT_SERVICES
  )
    .map((uri) => `        <objURI>${escapeXml(uri)}</objURI>`)
    .join("\n");

  const extensionLines =
    extensions && extensions.length
      ? [
        "        <svcExtension>",
        ...extensions.map(
          (uri) => `          <extURI>${escapeXml(uri)}</extURI>`,
        ),
        "        </svcExtension>",
      ]
      : [];

  const lines = [
    XML_HEADER,
    '<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">',
    "  <command>",
    "    <login>",
    `      <clID>${escapeXml(username)}</clID>`,
    `      <pw>${escapeXml(password)}</pw>`,
    "      <options>",
    "        <version>1.0</version>",
    "        <lang>en</lang>",
    "      </options>",
    "      <svcs>",
    serviceLines,
    ...extensionLines,
    "      </svcs>",
    "    </login>",
    `    <clTRID>${escapeXml(transactionId)}</clTRID>`,
    "  </command>",
    "</epp>",
  ];

  return lines.filter(Boolean).join("\n");
}

function buildLogoutCommand({ transactionId }) {
  return `${XML_HEADER}
<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">
  <command>
    <logout/>
    <clTRID>${escapeXml(transactionId)}</clTRID>
  </command>
</epp>`;
}

// ========================================
// CONTACT COMMANDS
// ========================================

function buildCheckContactCommand({ ids, transactionId }) {
  const idLines = ids
    .map((id) => `        <contact:id>${escapeXml(id)}</contact:id>`)
    .join("\n");

  return `${XML_HEADER}
<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">
  <command>
    <check>
      <contact:check xmlns:contact="urn:ietf:params:xml:ns:contact-1.0">
${idLines}
      </contact:check>
    </check>
    <clTRID>${escapeXml(transactionId)}</clTRID>
  </command>
</epp>`;
}

function buildCreateContactCommand({
  id,
  name,
  organisation,
  addressLines,
  city,
  state,
  postcode,
  country,
  phone,
  email,
  authInfo,
  transactionId,
}) {
  const lines = Array.isArray(addressLines) ? addressLines : [addressLines];
  const streets = lines
    .filter(Boolean)
    .map(
      (line) =>
        `            <contact:street>${escapeXml(line)}</contact:street>`,
    );

  const contactLines = [
    XML_HEADER,
    '<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">',
    "  <command>",
    "    <create>",
    '      <contact:create xmlns:contact="urn:ietf:params:xml:ns:contact-1.0">',
    `        <contact:id>${escapeXml(id)}</contact:id>`,
    '        <contact:postalInfo type="loc">',
    `          <contact:name>${escapeXml(name)}</contact:name>`,
    organisation
      ? `          <contact:org>${escapeXml(organisation)}</contact:org>`
      : null,
    "          <contact:addr>",
    ...streets,
    `            <contact:city>${escapeXml(city)}</contact:city>`,
    state ? `            <contact:sp>${escapeXml(state)}</contact:sp>` : null,
    postcode
      ? `            <contact:pc>${escapeXml(postcode)}</contact:pc>`
      : null,
    `            <contact:cc>${escapeXml(country)}</contact:cc>`,
    "          </contact:addr>",
    "        </contact:postalInfo>",
    phone ? `        <contact:voice>${escapeXml(phone)}</contact:voice>` : null,
    `        <contact:email>${escapeXml(email)}</contact:email>`,
    "        <contact:authInfo>",
    `          <contact:pw>${escapeXml(authInfo)}</contact:pw>`,
    "        </contact:authInfo>",
    "      </contact:create>",
    "    </create>",
    `    <clTRID>${escapeXml(transactionId)}</clTRID>`,
    "  </command>",
    "</epp>",
  ];

  return contactLines.filter(Boolean).join("\n");
}

function buildInfoContactCommand({ id, transactionId }) {
  return `${XML_HEADER}
<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">
  <command>
    <info>
      <contact:info xmlns:contact="urn:ietf:params:xml:ns:contact-1.0">
        <contact:id>${escapeXml(id)}</contact:id>
      </contact:info>
    </info>
    <clTRID>${escapeXml(transactionId)}</clTRID>
  </command>
</epp>`;
}

function buildUpdateContactCommand({ id, add, remove, change, transactionId }) {
  const addBlock = [];
  const remBlock = [];
  const chgBlock = [];

  if (add && add.status && add.status.length > 0) {
    addBlock.push("        <contact:add>");
    add.status.forEach((s) => {
      addBlock.push(`          <contact:status s="${escapeXml(s)}"/>`);
    });
    addBlock.push("        </contact:add>");
  }

  if (remove && remove.status && remove.status.length > 0) {
    remBlock.push("        <contact:rem>");
    remove.status.forEach((s) => {
      remBlock.push(`          <contact:status s="${escapeXml(s)}"/>`);
    });
    remBlock.push("        </contact:rem>");
  }

  if (change) {
    const hasChanges =
      change.name ||
      change.organisation ||
      change.addressLines ||
      change.city ||
      change.state ||
      change.postcode ||
      change.country ||
      change.phone ||
      change.email ||
      change.authInfo;

    if (hasChanges) {
      chgBlock.push("        <contact:chg>");

      if (
        change.name ||
        change.organisation ||
        change.addressLines ||
        change.city ||
        change.country
      ) {
        chgBlock.push('          <contact:postalInfo type="loc">');
        if (change.name) {
          chgBlock.push(
            `            <contact:name>${escapeXml(change.name)}</contact:name>`,
          );
        }
        if (change.organisation) {
          chgBlock.push(
            `            <contact:org>${escapeXml(change.organisation)}</contact:org>`,
          );
        }

        const hasAddress =
          change.addressLines ||
          change.city ||
          change.state ||
          change.postcode ||
          change.country;
        if (hasAddress) {
          chgBlock.push("            <contact:addr>");

          if (change.addressLines) {
            const lines = Array.isArray(change.addressLines)
              ? change.addressLines
              : [change.addressLines];
            lines.filter(Boolean).forEach((line) => {
              chgBlock.push(
                `              <contact:street>${escapeXml(line)}</contact:street>`,
              );
            });
          }

          if (change.city) {
            chgBlock.push(
              `              <contact:city>${escapeXml(change.city)}</contact:city>`,
            );
          }
          if (change.state) {
            chgBlock.push(
              `              <contact:sp>${escapeXml(change.state)}</contact:sp>`,
            );
          }
          if (change.postcode) {
            chgBlock.push(
              `              <contact:pc>${escapeXml(change.postcode)}</contact:pc>`,
            );
          }
          if (change.country) {
            chgBlock.push(
              `              <contact:cc>${escapeXml(change.country)}</contact:cc>`,
            );
          }

          chgBlock.push("            </contact:addr>");
        }
        chgBlock.push("          </contact:postalInfo>");
      }

      if (change.phone) {
        chgBlock.push(
          `          <contact:voice>${escapeXml(change.phone)}</contact:voice>`,
        );
      }
      if (change.email) {
        chgBlock.push(
          `          <contact:email>${escapeXml(change.email)}</contact:email>`,
        );
      }
      if (change.authInfo) {
        chgBlock.push("          <contact:authInfo>");
        chgBlock.push(
          `            <contact:pw>${escapeXml(change.authInfo)}</contact:pw>`,
        );
        chgBlock.push("          </contact:authInfo>");
      }

      chgBlock.push("        </contact:chg>");
    }
  }

  const lines = [
    XML_HEADER,
    '<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">',
    "  <command>",
    "    <update>",
    '      <contact:update xmlns:contact="urn:ietf:params:xml:ns:contact-1.0">',
    `        <contact:id>${escapeXml(id)}</contact:id>`,
    ...addBlock,
    ...remBlock,
    ...chgBlock,
    "      </contact:update>",
    "    </update>",
    `    <clTRID>${escapeXml(transactionId)}</clTRID>`,
    "  </command>",
    "</epp>",
  ];

  return lines.join("\n");
}

function buildDeleteContactCommand({ id, transactionId }) {
  return `${XML_HEADER}
<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">
  <command>
    <delete>
      <contact:delete xmlns:contact="urn:ietf:params:xml:ns:contact-1.0">
        <contact:id>${escapeXml(id)}</contact:id>
      </contact:delete>
    </delete>
    <clTRID>${escapeXml(transactionId)}</clTRID>
  </command>
</epp>`;
}

// ========================================
// DOMAIN COMMANDS
// ========================================

function buildCheckDomainCommand({ names, transactionId }) {
  const nameLines = names
    .map((name) => `        <domain:name>${escapeXml(name)}</domain:name>`)
    .join("\n");

  return `${XML_HEADER}
<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">
  <command>
    <check>
      <domain:check xmlns:domain="urn:ietf:params:xml:ns:domain-1.0">
${nameLines}
      </domain:check>
    </check>
    <clTRID>${escapeXml(transactionId)}</clTRID>
  </command>
</epp>`;
}

function buildCreateDomainCommand({
  name,
  period,
  registrant,
  nameservers,
  contacts,
  authPassword,
  transactionId,
}) {
  const nameserverLines = (nameservers || [])
    .filter(Boolean)
    .map((ns) => `          <domain:hostObj>${escapeXml(ns)}</domain:hostObj>`);

  const contactLines = (contacts || []).filter(Boolean).map((contact) => {
    const type = contact.type || "admin";
    const id = contact.id || contact;
    return `        <domain:contact type="${escapeXml(type)}">${escapeXml(id)}</domain:contact>`;
  });

  const lines = [
    XML_HEADER,
    '<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">',
    "  <command>",
    "    <create>",
    '      <domain:create xmlns:domain="urn:ietf:params:xml:ns:domain-1.0">',
    `        <domain:name>${escapeXml(name)}</domain:name>`,
    `        <domain:period unit="y">${escapeXml(period)}</domain:period>`,
    ...(nameserverLines.length
      ? ["        <domain:ns>", ...nameserverLines, "        </domain:ns>"]
      : []),
    `        <domain:registrant>${escapeXml(registrant)}</domain:registrant>`,
    ...contactLines,
    "        <domain:authInfo>",
    `          <domain:pw>${escapeXml(authPassword)}</domain:pw>`,
    "        </domain:authInfo>",
    "      </domain:create>",
    "    </create>",
    `    <clTRID>${escapeXml(transactionId)}</clTRID>`,
    "  </command>",
    "</epp>",
  ];

  return lines.filter(Boolean).join("\n");
}

function buildInfoDomainCommand({ name, authInfo, transactionId }) {
  const authBlock = authInfo
    ? [
      "        <domain:authInfo>",
      `          <domain:pw>${escapeXml(authInfo)}</domain:pw>`,
      "        </domain:authInfo>",
    ]
    : [];

  const lines = [
    XML_HEADER,
    '<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">',
    "  <command>",
    "    <info>",
    '      <domain:info xmlns:domain="urn:ietf:params:xml:ns:domain-1.0">',
    `        <domain:name hosts="all">${escapeXml(name)}</domain:name>`,
    ...authBlock,
    "      </domain:info>",
    "    </info>",
    `    <clTRID>${escapeXml(transactionId)}</clTRID>`,
    "  </command>",
    "</epp>",
  ];

  return lines.join("\n");
}

function buildUpdateDomainCommand({
  name,
  add = {},
  remove = {},
  change = {},
  transactionId,
}) {
  const buildNsList = (list) => {
    if (!list || !list.length) return [];
    return list.map(
      (ns) => `          <domain:hostObj>${escapeXml(ns)}</domain:hostObj>`,
    );
  };

  const buildStatusList = (list) => {
    if (!list || !list.length) return [];
    return list.map((s) => `          <domain:status s="${escapeXml(s)}"/>`);
  };

  const buildContactList = (list) => {
    if (!list || !list.length) return [];
    return list.map((contact) => {
      const type = contact.type || "admin";
      const id = contact.id || contact;
      return `          <domain:contact type="${escapeXml(type)}">${escapeXml(id)}</domain:contact>`;
    });
  };

  const addNs = buildNsList(add.nameservers);
  const addStatus = buildStatusList(add.status);
  const addContacts = buildContactList(add.contacts);
  const remNs = buildNsList(remove.nameservers);
  const remStatus = buildStatusList(remove.status);
  const remContacts = buildContactList(remove.contacts);

  const addBlock =
    addNs.length || addStatus.length || addContacts.length
      ? [
        "        <domain:add>",
        ...(addNs.length
          ? ["          <domain:ns>", ...addNs, "          </domain:ns>"]
          : []),
        ...addContacts,
        ...addStatus,
        "        </domain:add>",
      ]
      : [];

  const remBlock =
    remNs.length || remStatus.length || remContacts.length
      ? [
        "        <domain:rem>",
        ...(remNs.length
          ? ["          <domain:ns>", ...remNs, "          </domain:ns>"]
          : []),
        ...remContacts,
        ...remStatus,
        "        </domain:rem>",
      ]
      : [];

  const chgBlock = [];
  if (change.registrant || change.authInfo) {
    chgBlock.push("        <domain:chg>");
    if (change.registrant) {
      chgBlock.push(
        `          <domain:registrant>${escapeXml(change.registrant)}</domain:registrant>`,
      );
    }
    if (change.authInfo) {
      chgBlock.push("          <domain:authInfo>");
      chgBlock.push(
        `            <domain:pw>${escapeXml(change.authInfo)}</domain:pw>`,
      );
      chgBlock.push("          </domain:authInfo>");
    }
    chgBlock.push("        </domain:chg>");
  }

  const lines = [
    XML_HEADER,
    '<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">',
    "  <command>",
    "    <update>",
    '      <domain:update xmlns:domain="urn:ietf:params:xml:ns:domain-1.0">',
    `        <domain:name>${escapeXml(name)}</domain:name>`,
    ...addBlock,
    ...remBlock,
    ...chgBlock,
    "      </domain:update>",
    "    </update>",
    `    <clTRID>${escapeXml(transactionId)}</clTRID>`,
    "  </command>",
    "</epp>",
  ];

  return lines.join("\n");
}

function buildDeleteDomainCommand({ name, transactionId }) {
  return `${XML_HEADER}
<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">
  <command>
    <delete>
      <domain:delete xmlns:domain="urn:ietf:params:xml:ns:domain-1.0">
        <domain:name>${escapeXml(name)}</domain:name>
      </domain:delete>
    </delete>
    <clTRID>${escapeXml(transactionId)}</clTRID>
  </command>
</epp>`;
}

function buildRenewDomainCommand({
  name,
  currentExpiryDate,
  period,
  transactionId,
}) {
  // Format date as YYYY-MM-DD if it's a Date object
  let dateStr = currentExpiryDate;
  if (currentExpiryDate instanceof Date) {
    dateStr = currentExpiryDate.toISOString().split("T")[0];
  } else if (typeof currentExpiryDate === "string") {
    // Extract just the date part if it includes time
    dateStr = currentExpiryDate.split("T")[0];
  }

  return `${XML_HEADER}
<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">
  <command>
    <renew>
      <domain:renew xmlns:domain="urn:ietf:params:xml:ns:domain-1.0">
        <domain:name>${escapeXml(name)}</domain:name>
        <domain:curExpDate>${escapeXml(dateStr)}</domain:curExpDate>
        <domain:period unit="y">${escapeXml(period)}</domain:period>
      </domain:renew>
    </renew>
    <clTRID>${escapeXml(transactionId)}</clTRID>
  </command>
</epp>`;
}

function buildTransferDomainCommand({
  name,
  authInfo,
  period,
  operation,
  transactionId,
}) {
  const periodLine = period
    ? `        <domain:period unit="y">${escapeXml(period)}</domain:period>`
    : "";
  const authBlock = authInfo
    ? [
      "        <domain:authInfo>",
      `          <domain:pw>${escapeXml(authInfo)}</domain:pw>`,
      "        </domain:authInfo>",
    ]
    : [];

  const lines = [
    XML_HEADER,
    '<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">',
    "  <command>",
    `    <transfer op="${escapeXml(operation)}">`,
    '      <domain:transfer xmlns:domain="urn:ietf:params:xml:ns:domain-1.0">',
    `        <domain:name>${escapeXml(name)}</domain:name>`,
    periodLine,
    ...authBlock,
    "      </domain:transfer>",
    "    </transfer>",
    `    <clTRID>${escapeXml(transactionId)}</clTRID>`,
    "  </command>",
    "</epp>",
  ];

  return lines.filter(Boolean).join("\n");
}

// ========================================
// POLL COMMANDS
// ========================================

function buildPollCommand({ operation, messageId, transactionId }) {
  if (operation === "ack" && messageId) {
    return `${XML_HEADER}
<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">
  <command>
    <poll op="ack" msgID="${escapeXml(messageId)}"/>
    <clTRID>${escapeXml(transactionId)}</clTRID>
  </command>
</epp>`;
  }

  return `${XML_HEADER}
<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">
  <command>
    <poll op="req"/>
    <clTRID>${escapeXml(transactionId)}</clTRID>
  </command>
</epp>`;
}

// ========================================
// RESPONSE NORMALIZATION
// ========================================

export function normalizeEppResponse(parsed) {
  const epp = parsed?.epp || {};

  if (epp.greeting) {
    return {
      type: "greeting",
      success: true,
      resultCode: null,
      resultMessage: "",
      resultMessages: [],
      transactionId: null,
      serverTransactionId: null,
      data: epp.greeting,
      queue: null,
      extension: null,
    };
  }

  const response = epp.response || {};
  const results = ensureArray(response.result);
  const firstResult = results[0] || {};
  const resultCode = firstResult?.$?.code ? Number(firstResult.$.code) : null;
  const resultMessages = results
    .map((item) => extractMessage(item?.msg))
    .filter((msg) => msg.length > 0);
  const resultMessage = resultMessages.join(" ").trim();
  const transactionId = response.trID?.clTRID || null;
  const serverTransactionId = response.trID?.svTRID || null;
  const success = typeof resultCode === "number" ? resultCode < 2000 : true;

  return {
    type: "response",
    success,
    resultCode,
    resultMessage,
    resultMessages,
    transactionId,
    serverTransactionId,
    data: response.resData || null,
    queue: response.msgQ || null,
    extension: response.extension || null,
  };
}

// ========================================
// PARSING HELPERS
// ========================================

function parseDomainInfo(infData, fallbackName = "") {
  const nsNode = infData?.["domain:ns"] || infData?.ns || {};
  const hostObj = nsNode["domain:hostObj"] || nsNode.hostObj || [];
  const nameservers = ensureArray(hostObj);

  const registrantId = extractMessage(
    infData?.["domain:registrant"] || infData?.registrant,
  );
  const domainId = extractMessage(infData?.["domain:roid"] || infData?.roid);
  const clientId = extractMessage(infData?.["domain:clID"] || infData?.clID);
  const createdBy = extractMessage(infData?.["domain:crID"] || infData?.crID);
  const createdDate = extractMessage(
    infData?.["domain:crDate"] || infData?.crDate,
  );
  const updatedBy = extractMessage(infData?.["domain:upID"] || infData?.upID);
  const updatedDate = extractMessage(
    infData?.["domain:upDate"] || infData?.upDate,
  );
  const expiryDate = extractMessage(
    infData?.["domain:exDate"] || infData?.exDate,
  );
  const transferDate = extractMessage(
    infData?.["domain:trDate"] || infData?.trDate,
  );

  const statusNode = infData?.["domain:status"] || infData?.status || [];
  const statuses = ensureArray(statusNode)
    .map((s) => s?.$?.s || s)
    .filter(Boolean);

  const nameValue =
    extractMessage(infData?.["domain:name"] || infData?.name) || fallbackName;

  // Parse contacts
  const contactNodes = ensureArray(
    infData?.["domain:contact"] || infData?.contact || [],
  );
  const contacts = contactNodes.map((c) => ({
    id: typeof c === "string" ? c : c._ || c,
    type: c?.$?.type || "admin",
  }));

  return {
    success: true,
    name: nameValue,
    roid: domainId,
    status: statuses,
    registrant: registrantId,
    contacts,
    nameservers,
    clID: clientId,
    crID: createdBy,
    crDate: createdDate,
    upID: updatedBy,
    upDate: updatedDate,
    exDate: expiryDate,
    trDate: transferDate,
  };
}

function parseContactInfo(infData, fallbackId = "") {
  const contactId =
    extractMessage(infData?.["contact:id"] || infData?.id) || fallbackId;
  const roid = extractMessage(infData?.["contact:roid"] || infData?.roid);

  const statusNode = infData?.["contact:status"] || infData?.status || [];
  const statuses = ensureArray(statusNode)
    .map((s) => s?.$?.s || s)
    .filter(Boolean);

  const postalInfo =
    infData?.["contact:postalInfo"] || infData?.postalInfo || {};
  const name = extractMessage(postalInfo?.["contact:name"] || postalInfo?.name);
  const org = extractMessage(postalInfo?.["contact:org"] || postalInfo?.org);

  const addr = postalInfo?.["contact:addr"] || postalInfo?.addr || {};
  const streets = ensureArray(addr?.["contact:street"] || addr?.street || []);
  const city = extractMessage(addr?.["contact:city"] || addr?.city);
  const state = extractMessage(addr?.["contact:sp"] || addr?.sp);
  const postcode = extractMessage(addr?.["contact:pc"] || addr?.pc);
  const country = extractMessage(addr?.["contact:cc"] || addr?.cc);

  const voice = extractMessage(infData?.["contact:voice"] || infData?.voice);
  const fax = extractMessage(infData?.["contact:fax"] || infData?.fax);
  const email = extractMessage(infData?.["contact:email"] || infData?.email);

  const clID = extractMessage(infData?.["contact:clID"] || infData?.clID);
  const crID = extractMessage(infData?.["contact:crID"] || infData?.crID);
  const crDate = extractMessage(infData?.["contact:crDate"] || infData?.crDate);
  const upID = extractMessage(infData?.["contact:upID"] || infData?.upID);
  const upDate = extractMessage(infData?.["contact:upDate"] || infData?.upDate);
  const trDate = extractMessage(infData?.["contact:trDate"] || infData?.trDate);

  return {
    success: true,
    id: contactId,
    roid,
    status: statuses,
    name,
    organisation: org,
    addressLines: streets,
    city,
    state,
    postcode,
    country,
    phone: voice,
    fax,
    email,
    clID,
    crID,
    crDate,
    upID,
    upDate,
    trDate,
  };
}

function parseHostInfo(infData, fallbackName = "") {
  const hostName =
    extractMessage(infData?.["host:name"] || infData?.name) || fallbackName;
  const roid = extractMessage(infData?.["host:roid"] || infData?.roid);

  const statusNode = infData?.["host:status"] || infData?.status || [];
  const statuses = ensureArray(statusNode)
    .map((s) => s?.$?.s || s)
    .filter(Boolean);

  const addrNodes = ensureArray(infData?.["host:addr"] || infData?.addr || []);
  const addresses = addrNodes.map((a) => ({
    ip: a?.$?.ip || "v4",
    address: typeof a === "string" ? a : a._ || a,
  }));

  const clID = extractMessage(infData?.["host:clID"] || infData?.clID);
  const crID = extractMessage(infData?.["host:crID"] || infData?.crID);
  const crDate = extractMessage(infData?.["host:crDate"] || infData?.crDate);
  const upID = extractMessage(infData?.["host:upID"] || infData?.upID);
  const upDate = extractMessage(infData?.["host:upDate"] || infData?.upDate);
  const trDate = extractMessage(infData?.["host:trDate"] || infData?.trDate);

  return {
    success: true,
    name: hostName,
    roid,
    status: statuses,
    addresses,
    clID,
    crID,
    crDate,
    upID,
    upDate,
    trDate,
  };
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function ensureArray(value) {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function extractMessage(message) {
  if (!message) {
    return "";
  }

  if (typeof message === "string") {
    return message.trim();
  }

  if (Array.isArray(message)) {
    return message
      .map((item) => extractMessage(item))
      .filter(Boolean)
      .join(" ");
  }

  if (typeof message === "object") {
    if (typeof message._ === "string") {
      return message._.trim();
    }

    return Object.values(message)
      .map((value) => extractMessage(value))
      .filter(Boolean)
      .join(" ");
  }

  return String(message).trim();
}

export function escapeXml(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function createCommandError(normalized) {
  const message = normalized.resultMessage || "EPP command failed.";
  const error = new Error(message);
  error.name = "EppCommandError";
  error.code = normalized.resultCode ?? null;
  error.response = normalized;
  return error;
}

function normalizeError(value, fallbackMessage = "Unexpected error.") {
  if (value instanceof Error) {
    return value;
  }

  const message =
    typeof value === "string" && value.length > 0 ? value : fallbackMessage;
  const error = new Error(message);

  if (value && typeof value === "object") {
    error.details = value;
  }

  return error;
}

export default EppClient;
