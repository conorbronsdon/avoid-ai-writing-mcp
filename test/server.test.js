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
      context: "technical",
    },
  });

  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.context, "technical");
  assert.equal(result.structuredContent.issues.length, 8);
  assert.equal(result.structuredContent.issues[0].type, "tier1");
  assert.equal(result.structuredContent.highlights.length, 1);
  assert.equal(result.structuredContent.statistics.tier1_count, 6);
  assert.deepEqual(result.structuredContent.truncated, { issues: 0, highlights: 0 });
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
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
