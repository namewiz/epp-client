import assert from "node:assert/strict";
import { describe, test } from "node:test";
import EppClient from "../dist/index.js";

describe("Session Commands", () => {
  describe("hello", () => {
    test("sends hello command", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return {
          success: true,
          type: "greeting",
          data: {
            svID: "EPP Server",
            svDate: "2024-01-01T00:00:00Z",
          },
        };
      };

      const result = await client.hello();
      assert.match(sentXml, /<hello\/>/);
      assert.equal(result.success, true);
    });
  });

  describe("login", () => {
    test("requires username and password", async () => {
      const client = new EppClient({});
      const result = await client.login({});

      assert.ok(result instanceof Error);
      assert.match(result.message, /username.*password/i);
    });

    test("sends login command with credentials", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      await client.login({ username: "testuser", password: "testpass" });
      assert.match(sentXml, /<login>/);
      assert.match(sentXml, /<clID>testuser<\/clID>/);
      assert.match(sentXml, /<pw>testpass<\/pw>/);
    });

    test("includes services and extensions", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      await client.login({
        username: "testuser",
        password: "testpass",
        services: ["urn:ietf:params:xml:ns:domain-1.0"],
        extensions: ["urn:ietf:params:xml:ns:secDNS-1.1"],
      });

      assert.match(
        sentXml,
        /<objURI>urn:ietf:params:xml:ns:domain-1.0<\/objURI>/,
      );
      assert.match(
        sentXml,
        /<extURI>urn:ietf:params:xml:ns:secDNS-1.1<\/extURI>/,
      );
    });
  });

  describe("logout", () => {
    test("sends logout command", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return {
          success: true,
          resultCode: 1500,
        };
      };

      const result = await client.logout();
      assert.match(sentXml, /<logout\/>/);
      assert.equal(result.success, true);
    });
  });
});
