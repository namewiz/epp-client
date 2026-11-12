import assert from "node:assert/strict";
import { createServer } from "node:net";
import { describe, test } from "node:test";
import EppClient from "../dist/index.js";

describe("connect()", () => {
  test("times out when the server never completes the TLS handshake", async () => {
    // Accepts TCP and then stays silent, like an overloaded registry.
    const held = [];
    const server = createServer((socket) => held.push(socket));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
      const client = new EppClient({ host: "127.0.0.1", port: server.address().port, defaultTimeout: 300 });
      const started = Date.now();
      const result = await client.connect();

      assert.ok(result instanceof Error);
      assert.match(result.message, /Timed out connecting to the EPP server after 300ms/);
      assert.ok(Date.now() - started < 2000);
      assert.equal(client.isAlive(), false);
    } finally {
      for (const socket of held) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("socket errors", () => {
  test("resolve pending commands without throwing when nothing listens for 'error'", () => {
    const client = new EppClient({ host: "epp.example.test", port: 700 });
    let settled;
    client._pending.set("tx-1", (outcome) => {
      settled = outcome;
    });

    assert.doesNotThrow(() => client._handleSocketError(new Error("read ECONNRESET")));
    assert.ok(settled instanceof Error);
    assert.match(settled.message, /ECONNRESET/);
  });

  test("still reach an attached 'error' listener", () => {
    const client = new EppClient({ host: "epp.example.test", port: 700 });
    let emitted;
    client.on("error", (error) => {
      emitted = error;
    });

    client._handleSocketError(new Error("read ECONNRESET"));
    assert.match(emitted.message, /ECONNRESET/);
  });
});
