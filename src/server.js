import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createRequire } from "node:module";
import AIDetector from "avoid-ai-writing-detector";
import * as z from "zod/v4";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const CONTEXT_MODES = ["general", "technical", "marketing", "personal"];
const MAX_ISSUES = 100;
const MAX_HIGHLIGHTS = 100;

const inputSchema = {
  text: z.string().min(1).max(100_000).describe(
    "Text to evaluate locally. The text is not sent to any network service.",
  ),
  context: z.enum(CONTEXT_MODES).default("general").describe(
    "Writing context. Technical mode suppresses patterns common in code-adjacent prose; defaults to general.",
  ),
};

const probabilitiesSchema = z.object({
  human: z.number().min(0).max(1),
  mixed: z.number().min(0).max(1),
  ai: z.number().min(0).max(1),
});

const classificationSchema = z.enum(["UNSCORED", "HUMAN_ONLY", "MIXED", "AI_ONLY"]);
const confidenceSchema = z.enum(["low", "medium", "high"]);
const reasonSchema = z.enum(["empty", "too_short", "too_long"]).nullable();

const scoreOutputSchema = {
  score: z.number().int().min(0).max(100),
  label: z.string(),
  scorable: z.boolean(),
  unscored_reason: reasonSchema,
  classification: classificationSchema,
  confidence: confidenceSchema,
  probabilities: probabilitiesSchema,
  word_count: z.number().int().nonnegative(),
  issue_count: z.number().int().nonnegative(),
  context: z.enum(CONTEXT_MODES),
};

const issueSchema = z.object({
  type: z.string(),
  text: z.string(),
  severity: z.string(),
  suggestion: z.string().nullable(),
});

const highlightSchema = z.object({
  start_sentence: z.number().int().nonnegative(),
  end_sentence: z.number().int().nonnegative(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  hit_count: z.number().int().nonnegative(),
  score: z.number().min(0).max(1),
});

const auditOutputSchema = {
  ...scoreOutputSchema,
  issues: z.array(issueSchema).max(MAX_ISSUES),
  statistics: z.object({
    tier1_count: z.number().int().nonnegative(),
    tier2_count: z.number().int().nonnegative(),
    tier3_count: z.number().int().nonnegative(),
    other_pattern_count: z.number().int().nonnegative(),
    quoted_lines_ignored: z.number().int().nonnegative(),
    normalization: z.object({
      zero_width: z.number().int().nonnegative(),
      homoglyph: z.number().int().nonnegative(),
      roleplay: z.number().int().nonnegative(),
    }),
  }),
  highlights: z.array(highlightSchema).max(MAX_HIGHLIGHTS),
  truncated: z.object({
    issues: z.number().int().nonnegative(),
    highlights: z.number().int().nonnegative(),
  }),
};

const readOnlyAnnotations = {
  title: "Local writing-pattern analysis",
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

function unscoredReason(result) {
  if (result.label === "Empty") return "empty";
  if (result.tooLong || result.label === "Text too long") return "too_long";
  if (result.tooShort || result.label === "Too short") return "too_short";
  return null;
}

function scoreResult(result, requestedContext) {
  const reason = unscoredReason(result);
  return {
    score: result.score,
    label: result.label,
    scorable: reason === null,
    unscored_reason: reason,
    classification: result.document_classification,
    confidence: result.confidence_category,
    probabilities: result.class_probabilities,
    word_count: result.stats.wordCount ?? 0,
    issue_count: result.issues.length,
    context: result.stats.contextMode ?? requestedContext,
  };
}

function auditResult(result, requestedContext) {
  const score = scoreResult(result, requestedContext);
  const normalization = result.stats.normalization ?? {};

  return {
    ...score,
    issues: result.issues.slice(0, MAX_ISSUES).map((issue) => ({
      type: issue.type,
      text: issue.text,
      severity: issue.severity,
      suggestion: issue.suggestion ?? null,
    })),
    statistics: {
      tier1_count: result.stats.tier1Count ?? 0,
      tier2_count: result.stats.tier2Count ?? 0,
      tier3_count: result.stats.tier3Count ?? 0,
      other_pattern_count: result.stats.patternCount ?? 0,
      quoted_lines_ignored: result.stats.quotedLines ?? 0,
      normalization: {
        zero_width: normalization.zeroWidth ?? 0,
        homoglyph: normalization.homoglyph ?? 0,
        roleplay: normalization.roleplay ?? 0,
      },
    },
    highlights: result.highlight_sentence_for_ai.slice(0, MAX_HIGHLIGHTS).map((highlight) => ({
      start_sentence: highlight.startSentence,
      end_sentence: highlight.endSentence,
      start: highlight.start,
      end: highlight.end,
      hit_count: highlight.hitCount,
      score: highlight.score,
    })),
    truncated: {
      issues: Math.max(0, result.issues.length - MAX_ISSUES),
      highlights: Math.max(
        0,
        result.highlight_sentence_for_ai.length - MAX_HIGHLIGHTS,
      ),
    },
  };
}

function asToolResult(structuredContent) {
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
  };
}

export function createServer() {
  const server = new McpServer({
    name: "avoid-ai-writing-mcp",
    version,
  });

  server.registerTool(
    "score_text",
    {
      title: "Score text for AI-writing patterns",
      description:
        "Score text locally with the deterministic Avoid AI Writing detector. Returns a compact 0-100 pattern score, classification, confidence, and counts. This is a heuristic signal, not proof of authorship; use audit_text when individual findings are needed.",
      inputSchema,
      outputSchema: scoreOutputSchema,
      annotations: { ...readOnlyAnnotations, title: "Score text for AI-writing patterns" },
    },
    async ({ text, context }) => {
      const result = AIDetector.analyzeText(text, { contextMode: context });
      return asToolResult(scoreResult(result, context));
    },
  );

  server.registerTool(
    "audit_text",
    {
      title: "Audit text for AI-writing patterns",
      description:
        "Audit text locally with the deterministic Avoid AI Writing detector. Returns the score plus up to 100 flagged patterns and 100 highlighted sentence regions, with truncation counts. This is a heuristic writing audit, not proof of authorship; use score_text for a compact result.",
      inputSchema,
      outputSchema: auditOutputSchema,
      annotations: { ...readOnlyAnnotations, title: "Audit text for AI-writing patterns" },
    },
    async ({ text, context }) => {
      const result = AIDetector.analyzeText(text, { contextMode: context });
      return asToolResult(auditResult(result, context));
    },
  );

  return server;
}
