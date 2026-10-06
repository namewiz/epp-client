import assert from "node:assert/strict";
import { describe, test } from "node:test";
import EppClient from "../dist/index.js";

describe("Domain Transfer Commands", () => {
  describe("transferDomain", () => {
    test("requests transfer", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      await client.transferDomain({
        name: "example.com",
        authInfo: "secret123",
      });
      assert.match(sentXml, /<transfer op="request">/);
      assert.match(sentXml, /<domain:pw>secret123<\/domain:pw>/);
    });

    test("parses trnData including exDate", async () => {
      const client = new EppClient({});
      client.sendCommand = async () => ({
        success: true,
        data: {
          "domain:trnData": {
            "domain:name": "example.com",
            "domain:trStatus": "pending",
            "domain:reID": "NewReg",
            "domain:reDate": "2026-01-01T00:00:00Z",
            "domain:acID": "OldReg",
            "domain:acDate": "2026-01-06T00:00:00Z",
            "domain:exDate": "2027-06-01T00:00:00Z",
          },
        },
      });

      const result = await client.transferDomain({ name: "example.com", authInfo: "secret123" });
      assert.equal(result.transferStatus, "pending");
      assert.equal(result.expiryDate, "2027-06-01T00:00:00Z");
    });
  });

  describe("queryTransfer", () => {
    test("queries transfer status", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return {
          success: true,
          data: {
            "domain:trnData": {
              "domain:name": "example.com",
              "domain:trStatus": "pending",
              "domain:reID": "NewReg",
              "domain:reDate": "2024-01-01T00:00:00Z",
            },
          },
        };
      };

      const result = await client.queryTransfer({ name: "example.com" });
      assert.match(sentXml, /<transfer op="query">/);
      assert.equal(result.status, "pending");
    });
  });

  describe("approveTransfer", () => {
    test("approves incoming transfer", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      await client.approveTransfer({ name: "example.com" });
      assert.match(sentXml, /<transfer op="approve">/);
    });
  });

  describe("rejectTransfer", () => {
    test("rejects incoming transfer", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      await client.rejectTransfer({ name: "example.com" });
      assert.match(sentXml, /<transfer op="reject">/);
    });
  });

  describe("cancelTransfer", () => {
    test("cancels outgoing transfer", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      await client.cancelTransfer({ name: "example.com" });
      assert.match(sentXml, /<transfer op="cancel">/);
    });
  });
});
