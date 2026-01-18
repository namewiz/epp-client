import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  EppClientConfig,
  escapeXml,
  normalizeEppResponse,
} from "../src/index.js";

describe("EppClientConfig", () => {
  describe("constructor", () => {
    test("creates instance with default values", () => {
      const config = new EppClientConfig();

      assert.equal(config.host, "");
      assert.equal(config.port, 700);
      assert.equal(config.rejectUnauthorized, false);
      assert.equal(config.defaultTimeout, 10000);
    });

    test("accepts custom configuration", () => {
      const config = new EppClientConfig({
        host: "epp.example.com",
        port: 701,
        rejectUnauthorized: true,
        defaultTimeout: 30000,
      });

      assert.equal(config.host, "epp.example.com");
      assert.equal(config.port, 701);
      assert.equal(config.rejectUnauthorized, true);
      assert.equal(config.defaultTimeout, 30000);
    });
  });

  describe("validate", () => {
    test("reports missing host", () => {
      const config = new EppClientConfig();
      const result = config.validate();

      assert.ok(result instanceof Error);
      assert.match(result.message, /host/i);
    });

    test("reports invalid port (too low)", () => {
      const config = new EppClientConfig({ port: 0 });
      const result = config.validate();

      assert.ok(result instanceof Error);
      assert.match(result.message, /port/i);
    });

    test("reports invalid port (too high)", () => {
      const config = new EppClientConfig({});
      const result = config.validate();

      assert.ok(result instanceof Error);
      assert.match(result.message, /port/i);
    });

    test("reports invalid timeout (negative)", () => {
      const config = new EppClientConfig({
        defaultTimeout: -1000,
      });
      const result = config.validate();

      assert.ok(result instanceof Error);
      assert.match(result.message, /timeout/i);
    });

    test("returns null when configuration is valid", () => {
      const config = new EppClientConfig({
        host: "epp.example.com",
        port: 700,
        defaultTimeout: 5000,
      });
      const result = config.validate();

      assert.equal(result, null);
    });
  });

  describe("clone", () => {
    test("creates a new instance", () => {
      const original = new EppClientConfig({});
      const clone = original.clone();

      assert.notEqual(clone, original);
      assert.ok(clone instanceof EppClientConfig);
    });

    test("merges overrides into new instance", () => {
      const original = new EppClientConfig({
        host: "one",
        port: 700,
        defaultTimeout: 1000,
      });
      const clone = original.clone({
        port: 701,
        rejectUnauthorized: true,
      });

      assert.equal(clone.host, "one");
      assert.equal(clone.port, 701);
      assert.equal(clone.rejectUnauthorized, true);
      assert.equal(clone.defaultTimeout, 1000);
    });
  });
});

describe("escapeXml", () => {
  test("escapes special characters", () => {
    assert.equal(escapeXml("5 < 7 & 8"), "5 &lt; 7 &amp; 8");
    assert.equal(escapeXml('"quoted"'), "&quot;quoted&quot;");
    assert.equal(escapeXml("O'Reilly"), "O&apos;Reilly");
  });

  test("returns empty string for nullish values", () => {
    assert.equal(escapeXml(null), "");
    assert.equal(escapeXml(undefined), "");
  });
});

describe("normalizeEppResponse", () => {
  test("normalizes greeting", () => {
    const normalized = normalizeEppResponse({
      epp: {
        greeting: { svcMenu: {} },
      },
    });

    assert.equal(normalized.type, "greeting");
    assert.equal(normalized.success, true);
  });

  test("normalizes successful response", () => {
    const normalized = normalizeEppResponse({
      epp: {
        response: {
          result: {
            $: { code: "1000" },
            msg: "Success",
          },
          trID: {
            clTRID: "abc",
            svTRID: "xyz",
          },
        },
      },
    });

    assert.equal(normalized.success, true);
    assert.equal(normalized.resultCode, 1000);
  });

  test("normalizes error response", () => {
    const normalized = normalizeEppResponse({
      epp: {
        response: {
          result: {
            $: { code: "2303" },
            msg: "Object does not exist",
          },
        },
      },
    });

    assert.equal(normalized.success, false);
    assert.equal(normalized.resultCode, 2303);
  });
});
