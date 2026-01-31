import assert from "node:assert/strict";
import { describe, test } from "node:test";
import EppClient from "../dist/index.js";

describe("Poll Commands", () => {
  describe("pollRequest", () => {
    test("retrieves message from queue", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return {
          success: true,
          resultCode: 1301,
          resultMessage: "Command completed successfully; ack to dequeue",
          queue: {
            $: { count: "5", id: "msg-123" },
            qDate: "2024-01-01T00:00:00Z",
            msg: "Domain renewed",
          },
          data: {
            "domain:infData": {
              "domain:name": "example.com",
              "domain:exDate": "2025-01-01T00:00:00Z",
            },
          },
        };
      };

      const result = await client.pollRequest();
      assert.match(sentXml, /<poll op="req"\/>/);
      assert.equal(result.success, true);
      assert.equal(result.count, 5);
      assert.equal(result.messageId, "msg-123");
    });

    test("handles empty queue", async () => {
      const client = new EppClient({});
      client.sendCommand = async () => ({
        success: true,
        resultCode: 1300,
        resultMessage: "Command completed successfully; no messages",
        queue: null,
      });

      const result = await client.pollRequest();
      assert.equal(result.success, true);
      assert.equal(result.count, 0);
    });
  });

  describe("pollAck", () => {
    test("acknowledges message", async () => {
      const client = new EppClient({});
      let sentXml = "";
      client.sendCommand = async (xml) => {
        sentXml = xml;
        return {
          success: true,
          queue: { $: { count: "4", id: "msg-123" } },
        };
      };

      const result = await client.pollAck({ messageId: "msg-123" });
      assert.match(sentXml, /<poll op="ack" msgID="msg-123"\/>/);
      assert.equal(result.success, true);
      assert.equal(result.count, 4);
    });

    test("requires messageId parameter", async () => {
      const client = new EppClient({});
      const result = await client.pollAck({});

      assert.ok(result instanceof Error);
      assert.match(result.message, /messageId.*required/i);
    });
  });
});
