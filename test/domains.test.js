import assert from "node:assert/strict";
import { describe, test } from "node:test";
import EppClient from "../dist/index.js";

const host = process.env.EPP_HOST;

describe("Domain Commands", () => {
  describe("checkDomain", () => {
    test("checks domain availability", async () => {
      const client = new EppClient({});
      client.sendCommand = async () => ({
        success: true,
        data: {
          "domain:chkData": {
            "domain:cd": {
              "domain:name": { _: "example.com", $: { avail: "1" } },
            },
          },
        },
      });
      const result = await client.checkDomain({ name: "example.com" });
      assert.equal(result.availability, "unregistered");
    });
  });

  describe("createDomain", () => {
    test("creates domain with minimal params", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      await client.createDomain({ name: "example.com", registrant: "jd1234" });
      assert.match(sentXml, /<domain:name>example.com<\/domain:name>/);
      assert.match(sentXml, /<domain:registrant>jd1234<\/domain:registrant>/);
    });

    test("includes nameservers", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      await client.createDomain({
        name: "example.com",
        registrant: "jd1234",
        nameservers: ["ns1.example.com", "ns2.example.com"],
      });
      assert.match(
        sentXml,
        /<domain:hostObj>ns1.example.com<\/domain:hostObj>/,
      );
    });

    test("omits secDNS extension when no dsData given", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      await client.createDomain({ name: "example.com", registrant: "jd1234" });
      assert.doesNotMatch(sentXml, /secDNS/);
    });

    test("includes dsData in secDNS:create extension", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      await client.createDomain({
        name: "example.com",
        registrant: "jd1234",
        dsData: [
          { keyTag: 12345, alg: 8, digestType: 2, digest: "49FD46E6C4B45C55D4AC" },
        ],
      });

      assert.match(sentXml, /<secDNS:create xmlns:secDNS="urn:ietf:params:xml:ns:secDNS-1.1">/);
      assert.match(sentXml, /<secDNS:keyTag>12345<\/secDNS:keyTag>/);
      assert.match(sentXml, /<secDNS:alg>8<\/secDNS:alg>/);
      assert.match(sentXml, /<secDNS:digestType>2<\/secDNS:digestType>/);
      assert.match(sentXml, /<secDNS:digest>49FD46E6C4B45C55D4AC<\/secDNS:digest>/);

      const createClose = sentXml.indexOf("</create>");
      const clTRID = sentXml.indexOf("<clTRID>");
      const extension = sentXml.indexOf("<extension>");
      assert.ok(createClose > -1 && extension > createClose);
      assert.ok(clTRID > -1 && clTRID > extension);
    });
  });

  describe("infoDomain", () => {
    test("retrieves domain info", async () => {
      const client = new EppClient({});
      client.sendCommand = async () => ({
        success: true,
        data: {
          "domain:infData": {
            "domain:name": "example.com",
            "domain:registrant": "jd1234",
            "domain:ns": { "domain:hostObj": ["ns1.example.com"] },
            "domain:clID": "RegistrarA",
            "domain:crDate": "2023-01-01T00:00:00Z",
          },
        },
      });

      const result = await client.infoDomain({ name: "example.com" });
      assert.equal(result.name, "example.com");
      assert.equal(result.registrant, "jd1234");
      assert.deepEqual(result.dsData, []);
    });

    test("parses dsData from secDNS:infData extension", async () => {
      const client = new EppClient({});
      client.sendCommand = async () => ({
        success: true,
        data: {
          "domain:infData": {
            "domain:name": "example.com",
            "domain:registrant": "jd1234",
          },
        },
        extension: {
          "secDNS:infData": {
            "secDNS:dsData": {
              "secDNS:keyTag": "12345",
              "secDNS:alg": "8",
              "secDNS:digestType": "2",
              "secDNS:digest": "49FD46E6C4B45C55D4AC",
            },
          },
        },
      });

      const result = await client.infoDomain({ name: "example.com" });
      assert.deepEqual(result.dsData, [
        { keyTag: 12345, alg: 8, digestType: 2, digest: "49FD46E6C4B45C55D4AC" },
      ]);
    });
  });

  describe("updateDomain", () => {
    test("adds and removes nameservers", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      await client.updateDomain({
        name: "example.com",
        add: { nameservers: ["ns3.example.com"] },
        remove: { nameservers: ["ns1.example.com"] },
      });

      assert.match(sentXml, /<domain:add>/);
      assert.match(sentXml, /<domain:rem>/);
    });

    test("adds dsData via secDNS:update add", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      await client.updateDomain({
        name: "example.com",
        add: {
          dsData: [
            { keyTag: 12345, alg: 8, digestType: 2, digest: "49FD46E6C4B45C55D4AC" },
          ],
        },
      });

      assert.match(sentXml, /<secDNS:update xmlns:secDNS="urn:ietf:params:xml:ns:secDNS-1.1">/);
      assert.match(sentXml, /<secDNS:add>[\s\S]*<secDNS:keyTag>12345<\/secDNS:keyTag>[\s\S]*<\/secDNS:add>/);
    });

    test("removes dsData via secDNS:update rem", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      await client.updateDomain({
        name: "example.com",
        remove: {
          dsData: [
            { keyTag: 12345, alg: 8, digestType: 2, digest: "49FD46E6C4B45C55D4AC" },
          ],
        },
      });

      assert.match(sentXml, /<secDNS:rem>[\s\S]*<secDNS:keyTag>12345<\/secDNS:keyTag>[\s\S]*<\/secDNS:rem>/);
    });

    test("removes all dsData via secDNS:all", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      await client.updateDomain({
        name: "example.com",
        remove: { dsDataAll: true },
      });

      assert.match(sentXml, /<secDNS:rem>\s*<secDNS:all>true<\/secDNS:all>\s*<\/secDNS:rem>/);
      assert.match(sentXml, /<domain:chg\s*\/>/);
    });

    test("omits secDNS extension when no dsData given", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      await client.updateDomain({
        name: "example.com",
        add: { nameservers: ["ns3.example.com"] },
      });

      assert.doesNotMatch(sentXml, /secDNS/);
    });
  });

  describe("deleteDomain", () => {
    test("deletes domain", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      await client.deleteDomain({ name: "example.com" });
      assert.match(sentXml, /<domain:delete/);
    });
  });

  describe("renewDomain", () => {
    test("renews domain", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      await client.renewDomain({
        name: "example.com",
        currentExpiryDate: "2024-01-01",
        period: 1,
      });

      assert.match(sentXml, /<domain:renew/);
      assert.match(
        sentXml,
        /<domain:curExpDate>2024-01-01<\/domain:curExpDate>/,
      );
    });
  });

  describe("updateNameservers", () => {
    test("calculates add/remove correctly", async () => {
      const client = new EppClient({});
      client.infoDomain = async () => ({
        success: true,
        nameservers: ["ns1.example.com", "ns2.example.com"],
      });

      let updateArgs;
      client.updateDomain = async (args) => {
        updateArgs = args;
        return { success: true };
      };

      await client.updateNameservers({
        name: "example.com",
        nameservers: ["ns1.example.com", "ns3.example.com"],
      });

      assert.deepEqual(updateArgs.add.nameservers, ["ns3.example.com"]);
      assert.deepEqual(updateArgs.remove.nameservers, ["ns2.example.com"]);
    });
  });

  describe("updateAutoRenew", () => {
    test("enables auto-renew", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return { success: true };
      };

      await client.updateAutoRenew({ name: "example.com", autoRenew: true });
      assert.match(sentXml, /<domain:rem>/);
      assert.match(sentXml, /clientRenewProhibited/);
    });
  });
});
