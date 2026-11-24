import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createServer } from "../src/server.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

async function connectedPair() {
  const server = createServer();
  const client = new Client({ name: "avoid-ai-writing-mcp-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

test("advertises exactly the two local, read-only tools", async (t) => {
  const { client, server } = await connectedPair();
  t.after(async () => Promise.all([client.close(), server.close()]));

  const { tools } = await client.listTools();
  assert.equal(client.getServerVersion().version, version);
  assert.deepEqual(tools.map(({ name }) => name).sort(), ["audit_text", "score_text"]);

  for (const tool of tools) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
    assert.equal(tool.annotations.idempotentHint, true);
    assert.equal(tool.annotations.openWorldHint, false);
    assert.ok(tool.outputSchema);
  }
});

test("score_text returns a compact deterministic score", async (t) => {
  const { client, server } = await connectedPair();
  t.after(async () => Promise.all([client.close(), server.close()]));

  const args = {
    text: "This comprehensive and robust solution will seamlessly leverage a holistic ecosystem to facilitate impactful outcomes for everyone involved.",
    context: "general",
  };
  const first = await client.callTool({ name: "score_text", arguments: args });
  const second = await client.callTool({ name: "score_text", arguments: args });

  assert.equal(first.isError, undefined);
  assert.deepEqual(first.structuredContent, second.structuredContent);
  assert.equal(first.structuredContent.score, 36);
  assert.equal(first.structuredContent.issue_count, 8);
  assert.equal(first.structuredContent.context, "general");
  assert.equal("issues" in first.structuredContent, false);
});

test("audit_text returns findings and typed highlights", async (t) => {
  const { client, server } = await connectedPair();
  t.after(async () => Promise.all([client.close(), server.close()]));

  const result = await client.callTool({
    name: "audit_text",
    arguments: {
      text: "This comprehensive and robust solution will seamlessly leverage a holistic ecosystem to facilitate impactful outcomes for everyone involved.",
      context: "general",
    },
  });

  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.context, "general");
  assert.equal(result.structuredContent.issues.length, 8);
  assert.equal(result.structuredContent.issues[0].type, "tier1");
  assert.equal(result.structuredContent.highlights.length, 1);
  assert.equal(result.structuredContent.statistics.tier1_count, 6);
  assert.deepEqual(result.structuredContent.truncated, { issues: 0, highlights: 0 });
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
});

test("technical context suppresses words that are normal in code-adjacent prose", async (t) => {
  const { client, server } = await connectedPair();
  t.after(async () => Promise.all([client.close(), server.close()]));

  const result = await client.callTool({
    name: "audit_text",
    arguments: {
      text: "This comprehensive and robust solution will seamlessly leverage a holistic ecosystem to facilitate impactful outcomes for everyone involved.",
      context: "technical",
    },
  });

  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.context, "technical");
  assert.deepEqual(
    result.structuredContent.issues.map(({ text }) => text),
    ["holistic", "impactful"],
  );
});

test("audit_text caps highlighted regions and reports truncation", async (t) => {
  const { client, server } = await connectedPair();
  t.after(async () => Promise.all([client.close(), server.close()]));

  const text = Array.from(
    { length: 120 },
    () =>
      "Comprehensive systems improve workflows. Teams review the details carefully. People record the result clearly.",
  ).join(" ");
  const result = await client.callTool({
    name: "audit_text",
    arguments: { text, context: "general" },
  });

  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.highlights.length, 100);
  assert.equal(result.structuredContent.truncated.highlights, 20);
});

test("short text is returned as unscored rather than a transport error", async (t) => {
  const { client, server } = await connectedPair();
  t.after(async () => Promise.all([client.close(), server.close()]));

  const result = await client.callTool({
    name: "score_text",
    arguments: { text: "Too short.", context: "general" },
  });

  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.scorable, false);
  assert.equal(result.structuredContent.unscored_reason, "too_short");
  assert.equal(result.structuredContent.classification, "UNSCORED");
});

test("Object.prototype names are not findings and keep the output schema valid", async (t) => {
  const { client, server } = await connectedPair();
  t.after(async () => Promise.all([client.close(), server.close()]));

  // Detector 3.22.1 resolved "constructor" and "__proto__" against
  // Object.prototype and returned a function or object as the suggestion,
  // which the server reports as null. The pinned detector no longer flags them.
  for (const word of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
    const result = await client.callTool({
      name: "audit_text",
      arguments: {
        text: `We set ${word} on the object here so that the lookup works for all of the callers.`,
        context: "technical",
      },
    });

    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent.issues, []);
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  }
});

test("audit_text preserves string suggestions from the detector", async (t) => {
  const { client, server } = await connectedPair();
  t.after(async () => Promise.all([client.close(), server.close()]));

  const result = await client.callTool({
    name: "audit_text",
    arguments: {
      text: "We set robust defaults on the object here so that the lookup works for all of the callers.",
      context: "general",
    },
  });

  assert.equal(result.isError, undefined);
  assert.deepEqual(result.structuredContent.issues, [
    {
      type: "tier1",
      text: "robust",
      severity: "high",
      suggestion: "strong, reliable, solid",
    },
  ]);
});

// avoid-ai-writing-mcp#15: line-start whitespace runs made the detector's
// line-anchored regexes quadratic. "w ".repeat(10) + U+2028 x 99,000 blocked
// the server for about 28 s on detector 3.22.1.
test("near-limit whitespace runs finish in bounded time", async (t) => {
  const { client, server } = await connectedPair();
  t.after(async () => Promise.all([client.close(), server.close()]));

  for (const run of ["\u2028", "\u2029", "\n", "\r", " \n"]) {
    const text = "w ".repeat(10) + run.repeat(Math.floor(99_000 / run.length));
    const started = performance.now();
    const result = await client.callTool({ name: "score_text", arguments: { text, context: "general" } });
    const elapsed = performance.now() - started;

    assert.equal(result.isError, undefined);
    assert.ok(elapsed < 3_000, `${JSON.stringify(run)} run took ${Math.round(elapsed)} ms`);
  }
});
