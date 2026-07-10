import assert from "node:assert/strict";
import { describe, test } from "node:test";
import EppClient from "../dist/index.js";

describe("isAlive()", () => {
  test("is false before connecting", () => {
    const client = new EppClient({ host: "epp.example.test", port: 700 });
    assert.equal(client.isAlive(), false);
  });

  test("is false after a simulated socket destroy", () => {
    const client = new EppClient({ host: "epp.example.test", port: 700 });
    // Simulate a warm-then-dead socket without a live registry.
    client._connected = true;
    client._socket = { destroyed: false };
    assert.equal(client.isAlive(), true);
    client._socket.destroyed = true;
    assert.equal(client.isAlive(), false);
    client._socket = null;
    assert.equal(client.isAlive(), false);
  });
});
