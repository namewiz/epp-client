import assert from "node:assert/strict";
import { describe, test } from "node:test";
import EppClient from "../dist/index.js";

describe("RGP (Registry Grace Period) Commands", () => {
  describe("restoreDomain", () => {
    test("sends restore request command", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true, extension: {} };
      };

      const result = await client.restoreDomain({ name: "example.com" });
      assert.match(sentXml, /<domain:update/);
      assert.match(sentXml, /<domain:name>example.com<\/domain:name>/);
      assert.match(sentXml, /<rgp:update xmlns:rgp="urn:ietf:params:xml:ns:rgp-1.0">/);
      assert.match(sentXml, /<rgp:restore op="request"\/>/);
      assert.equal(result.success, true);
      assert.equal(result.name, "example.com");
    });

    test("parses RGP status from response", async () => {
      const client = new EppClient({});
      client.sendCommand = async () => ({
        success: true,
        extension: {
          "rgp:infData": {
            "rgp:rgpStatus": { $: { s: "pendingRestore" } },
          },
        },
      });

      const result = await client.restoreDomain({ name: "example.com" });
      assert.equal(result.rgpStatus, "pendingRestore");
    });

    test("requires domain name", async () => {
      const client = new EppClient({});
      const result = await client.restoreDomain({});
      assert.ok(result instanceof Error);
      assert.match(result.message, /name.*required/i);
    });

    test("handles restore request error", async () => {
      const client = new EppClient({});
      client.sendCommand = async () => new Error("Domain not in redemption period");

      const result = await client.restoreDomain({ name: "example.com" });
      assert.ok(result instanceof Error);
    });
  });

  describe("restoreReport", () => {
    test("sends restore report command", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      const result = await client.restoreReport({
        name: "example.com",
        preData: "Pre-delete WHOIS data",
        postData: "Post-restore WHOIS data",
        deleteTime: "2024-01-15T10:30:00Z",
        restoreTime: "2024-01-20T14:00:00Z",
        restoreReason: "Domain deleted by mistake",
        statements: [
          "Registrant requested restoration",
          "Information verified accurate",
        ],
      });

      assert.match(sentXml, /<domain:update/);
      assert.match(sentXml, /<domain:name>example.com<\/domain:name>/);
      assert.match(sentXml, /<rgp:restore op="report">/);
      assert.match(sentXml, /<rgp:report>/);
      assert.match(sentXml, /<rgp:preData>Pre-delete WHOIS data<\/rgp:preData>/);
      assert.match(sentXml, /<rgp:postData>Post-restore WHOIS data<\/rgp:postData>/);
      assert.match(sentXml, /<rgp:delTime>2024-01-15T10:30:00Z<\/rgp:delTime>/);
      assert.match(sentXml, /<rgp:resTime>2024-01-20T14:00:00Z<\/rgp:resTime>/);
      assert.match(sentXml, /<rgp:resReason>Domain deleted by mistake<\/rgp:resReason>/);
      assert.match(sentXml, /<rgp:statement>Registrant requested restoration<\/rgp:statement>/);
      assert.match(sentXml, /<rgp:statement>Information verified accurate<\/rgp:statement>/);
      assert.equal(result.success, true);
    });

    test("includes optional other field", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      await client.restoreReport({
        name: "example.com",
        preData: "Pre-delete data",
        postData: "Post-restore data",
        deleteTime: "2024-01-15T10:30:00Z",
        restoreTime: "2024-01-20T14:00:00Z",
        restoreReason: "Accidental deletion",
        statements: ["Statement 1"],
        other: "Additional relevant information",
      });

      assert.match(sentXml, /<rgp:other>Additional relevant information<\/rgp:other>/);
    });

    test("handles Date objects for times", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      const deleteTime = new Date("2024-01-15T10:30:00Z");
      const restoreTime = new Date("2024-01-20T14:00:00Z");

      await client.restoreReport({
        name: "example.com",
        preData: "Pre-delete data",
        postData: "Post-restore data",
        deleteTime,
        restoreTime,
        restoreReason: "Test",
        statements: ["Statement"],
      });

      assert.match(sentXml, /<rgp:delTime>2024-01-15T10:30:00.000Z<\/rgp:delTime>/);
      assert.match(sentXml, /<rgp:resTime>2024-01-20T14:00:00.000Z<\/rgp:resTime>/);
    });

    test("requires domain name", async () => {
      const client = new EppClient({});
      const result = await client.restoreReport({
        preData: "data",
        postData: "data",
        deleteTime: "2024-01-15",
        restoreTime: "2024-01-20",
        restoreReason: "reason",
        statements: ["statement"],
      });
      assert.ok(result instanceof Error);
      assert.match(result.message, /name.*required/i);
    });

    test("requires preData", async () => {
      const client = new EppClient({});
      const result = await client.restoreReport({
        name: "example.com",
        postData: "data",
        deleteTime: "2024-01-15",
        restoreTime: "2024-01-20",
        restoreReason: "reason",
        statements: ["statement"],
      });
      assert.ok(result instanceof Error);
      assert.match(result.message, /preData.*required/i);
    });

    test("requires postData", async () => {
      const client = new EppClient({});
      const result = await client.restoreReport({
        name: "example.com",
        preData: "data",
        deleteTime: "2024-01-15",
        restoreTime: "2024-01-20",
        restoreReason: "reason",
        statements: ["statement"],
      });
      assert.ok(result instanceof Error);
      assert.match(result.message, /postData.*required/i);
    });

    test("requires at least one statement", async () => {
      const client = new EppClient({});
      const result = await client.restoreReport({
        name: "example.com",
        preData: "data",
        postData: "data",
        deleteTime: "2024-01-15",
        restoreTime: "2024-01-20",
        restoreReason: "reason",
        statements: [],
      });
      assert.ok(result instanceof Error);
      assert.match(result.message, /statement.*required/i);
    });

    test("requires restoreReason", async () => {
      const client = new EppClient({});
      const result = await client.restoreReport({
        name: "example.com",
        preData: "data",
        postData: "data",
        deleteTime: "2024-01-15",
        restoreTime: "2024-01-20",
        statements: ["statement"],
      });
      assert.ok(result instanceof Error);
      assert.match(result.message, /reason.*required/i);
    });

    test("handles restore report error", async () => {
      const client = new EppClient({});
      client.sendCommand = async () => new Error("Domain not in pendingRestore status");

      const result = await client.restoreReport({
        name: "example.com",
        preData: "data",
        postData: "data",
        deleteTime: "2024-01-15",
        restoreTime: "2024-01-20",
        restoreReason: "reason",
        statements: ["statement"],
      });
      assert.ok(result instanceof Error);
    });

    test("escapes XML special characters", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      await client.restoreReport({
        name: "example.com",
        preData: "Data with <special> & \"characters\"",
        postData: "More 'special' data",
        deleteTime: "2024-01-15T10:30:00Z",
        restoreTime: "2024-01-20T14:00:00Z",
        restoreReason: "Reason with <tags>",
        statements: ["Statement with & ampersand"],
      });

      assert.match(sentXml, /&lt;special&gt;/);
      assert.match(sentXml, /&amp;/);
      assert.match(sentXml, /&quot;characters&quot;/);
    });
  });
});
