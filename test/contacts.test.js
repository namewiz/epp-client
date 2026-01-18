import assert from "node:assert/strict";
import { describe, test } from "node:test";
import EppClient from "../src/index.js";

describe("Contact Commands", () => {
  describe("checkContact", () => {
    test("requires id parameter", async () => {
      const client = new EppClient({});
      const result = await client.checkContact({});
      assert.ok(result instanceof Error);
    });

    test("checks single contact", async () => {
      const client = new EppClient({});
      client.sendCommand = async () => ({
        success: true,
        data: {
          "contact:chkData": {
            "contact:cd": { "contact:id": { _: "sh8013", $: { avail: "1" } } },
          },
        },
      });
      const result = await client.checkContact({ id: "sh8013" });
      assert.equal(result.id, "sh8013");
      assert.equal(result.available, true);
    });
  });

  describe("createContact", () => {
    test("requires all mandatory fields", async () => {
      const client = new EppClient({});
      const result = await client.createContact({ id: "sh8013" });
      assert.ok(result instanceof Error);
    });

    test("creates contact with full data", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      await client.createContact({
        id: "sh8013",
        name: "John Doe",
        organisation: "Example Inc",
        addressLines: ["123 Main St"],
        city: "New York",
        state: "NY",
        postcode: "10001",
        country: "US",
        phone: "+1.2125551234",
        email: "john@example.com",
      });

      assert.match(sentXml, /<contact:id>sh8013<\/contact:id>/);
      assert.match(sentXml, /<contact:name>John Doe<\/contact:name>/);
      assert.match(sentXml, /<contact:email>john@example.com<\/contact:email>/);
    });
  });

  describe("infoContact", () => {
    test("retrieves contact information", async () => {
      const client = new EppClient({});
      client.sendCommand = async () => ({
        success: true,
        data: {
          "contact:infData": {
            "contact:id": "sh8013",
            "contact:postalInfo": {
              "contact:name": "John Doe",
              "contact:addr": {
                "contact:city": "New York",
                "contact:cc": "US",
              },
            },
            "contact:email": "john@example.com",
          },
        },
      });

      const result = await client.infoContact({ id: "sh8013" });
      assert.equal(result.id, "sh8013");
      assert.equal(result.name, "John Doe");
    });
  });

  describe("updateContact", () => {
    test("updates contact email", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      await client.updateContact({
        id: "sh8013",
        change: { email: "new@example.com" },
      });
      assert.match(sentXml, /<contact:email>new@example.com<\/contact:email>/);
    });
  });

  describe("deleteContact", () => {
    test("deletes contact", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      await client.deleteContact({ id: "sh8013" });
      assert.match(sentXml, /<contact:delete/);
    });
  });
});
