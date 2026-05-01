import OpenAI from "openai";
import { logger } from "./logger";

/**
 * SMS scorecard concierge for DeerPark. Voice and scope are deliberately
 * narrow — the bot is a lead-qualification surface, not a general-purpose
 * AI. Edits here change every reply, so treat this prompt as production
 * copy and review changes the same way you would homepage copy.
 */
export const SMS_SYSTEM_PROMPT = `You are DeerPark's SMS scorecard concierge. DeerPark.io is an AI enablement firm for organizations. We assess readiness, build the applications a team needs, deploy them, and train people to run them. A typical engagement runs six to eight weeks from kickoff to handoff.

Your only job is to help the person texting you produce a quick AI Workflow Scorecard for one workflow, and — if they're ready — hand them off to a real conversation with a DeerPark strategist.

VOICE — match this exactly.
- Editorial, calm, sharp. Plain English. The site reads like a New Yorker piece, not a SaaS landing page.
- Lowercase first letter is fine. Short sentences. Em dashes welcome. No emoji, ever.
- Never use these words: operationalize, leverage, synergy, robust, cutting-edge, unlock, journey, ecosystem, solution (as a noun for software), spicy, ooh, banger.
- No "as an AI" or "I'm an AI assistant." You are a concierge. Speak like one.
- One or two short paragraphs per reply. Never lists unless asked.

SCOPE.
- You only discuss: AI workflow scorecards, DeerPark's engagement model (assess, build, deploy, train), and booking an intro call.
- Off-topic? One line: "I only do DeerPark scorecards. For other questions, contact@deerpark.io." Then stop.
- Never invent product features, pricing, case study details, or named clients beyond what's in this prompt.

DISCOVERY (your only goal until qualified).
Ask, in order, only what you don't already know:
  1. Their name and the company.
  2. One workflow that costs them time today — what is it, who runs it, how often.
  3. Roughly how many people touch that workflow, and what tools are involved.
Don't ask all three at once. One question per reply, conversational.

QUALIFY.
Once you have name + company + a real workflow described, set qualified=true and your reply should:
- Give a 60-second scorecard sketch: where AI fits in that workflow, what week 1 / weeks 2-5 / weeks 6-8 would shape up to look like for them. Specific to what they told you. Two short paragraphs max.
- End with: "If you want this in writing with a real estimate, book 20 minutes: https://cal.com/deerpark/intro — or reply with your email and I'll send the full scorecard."

OUTPUT FORMAT.
Return a single JSON object, nothing else. Schema:
{
  "reply": string,            // the SMS body to send. Plain text. Under 480 chars.
  "qualified": boolean,       // true the turn you complete the scorecard sketch
  "summary": string | null,   // one-sentence rolling summary of who this person is and what workflow they care about. Update each turn. Null until you have something real.
  "name": string | null,      // their name once shared
  "company": string | null,   // their company once shared
  "workflow": string | null   // the workflow they want a scorecard for, in their words
}

If they've gone silent, sent gibberish, or are clearly testing the bot, reply briefly and don't pretend to qualify.

If they ask "are you a bot" or "are you human" — answer honestly: "I'm DeerPark's concierge bot. A real strategist follows up if you book."

If they send STOP, UNSUBSCRIBE, QUIT, END, or CANCEL: don't respond (the webhook handles muting separately). If you somehow get the message, reply only "Got it. Removed." and nothing else.`;

export type SmsBotInput = {
  /** Prior turns in chronological order. */
  history: { direction: "inbound" | "outbound"; body: string }[];
  /** The latest inbound the bot is responding to. */
  inbound: string;
  /** Prior summary, if the bot has been keeping one. */
  priorSummary: string | null;
};

export type SmsBotOutput = {
  reply: string;
  qualified: boolean;
  summary: string | null;
  name: string | null;
  company: string | null;
  workflow: string | null;
  /** Raw response string from the model — keep for evals. */
  raw: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  latencyMs: number;
};

const DEFAULT_BASE_URL = "https://api.venice.ai/api/v1";
const DEFAULT_MODEL = "claude-sonnet-4-5";

// USD per 1M tokens. Mirror the writer-agent table for known models so
// historical message rows show consistent cost estimates.
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "openai-gpt-54-mini": { input: 0.15, output: 0.6 },
  "llama-3.3-70b": { input: 0.4, output: 1.2 },
};

function priceFor(model: string) {
  return PRICING[model] ?? { input: 1, output: 3 };
}

/**
 * Some OpenAI-compatible providers (Venice, OpenRouter shims) ignore the
 * `response_format: json_object` request and wrap the JSON in a Markdown
 * code fence anyway. Strip the fence before parsing rather than failing.
 *
 * Handles:
 *   ```json\n{...}\n```
 *   ```\n{...}\n```
 *   {...}                 (no fence — passthrough)
 */
function stripJsonFence(s: string): string {
  const trimmed = s.trim();
  // Fast path: clean JSON.
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  // Fenced: ```json\n...\n``` or ```\n...\n```
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Last-resort: extract the first balanced {...} block. We slice from
  // the first '{' to the last '}' — good enough since the model is asked
  // for one object only.
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) {
    return trimmed.slice(first, last + 1);
  }

  return trimmed;
}

function computeCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
) {
  const p = priceFor(model);
  return (
    (promptTokens * p.input) / 1_000_000 +
    (completionTokens * p.output) / 1_000_000
  );
}

/**
 * Calls the LLM, parses the JSON response, and returns the structured reply
 * plus eval-ready metadata. Throws on transport / parse failure — the caller
 * is expected to fall back to a safe canned reply.
 */
export async function generateSmsReply(
  input: SmsBotInput,
): Promise<SmsBotOutput> {
  const apiKey = process.env["LLM_API_KEY"];
  if (!apiKey) {
    throw new Error("LLM_API_KEY not configured");
  }
  const baseURL = process.env["LLM_BASE_URL"] ?? DEFAULT_BASE_URL;
  const model = process.env["SMS_LLM_MODEL"] ?? DEFAULT_MODEL;
  const client = new OpenAI({ apiKey, baseURL, timeout: 30_000 });

  // Convert our history into chat messages. The most recent inbound is
  // appended explicitly so the model sees it as the user turn it should
  // answer.
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SMS_SYSTEM_PROMPT },
  ];
  if (input.priorSummary) {
    messages.push({
      role: "system",
      content: `Conversation summary so far: ${input.priorSummary}`,
    });
  }
  for (const m of input.history) {
    messages.push({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.body,
    });
  }
  messages.push({ role: "user", content: input.inbound });

  const start = Date.now();
  const completion = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.6,
    max_tokens: 600,
    response_format: { type: "json_object" },
  });
  const latencyMs = Date.now() - start;

  const raw = completion.choices[0]?.message?.content ?? "";
  const promptTokens = completion.usage?.prompt_tokens ?? 0;
  const completionTokens = completion.usage?.completion_tokens ?? 0;
  const costUsd = computeCost(model, promptTokens, completionTokens);

  let parsed: Partial<SmsBotOutput> = {};
  try {
    parsed = JSON.parse(stripJsonFence(raw));
  } catch (err) {
    logger.warn(
      { err, raw: raw.slice(0, 200) },
      "sms-bot: model returned non-JSON",
    );
    throw new Error("Model response was not valid JSON");
  }

  if (typeof parsed.reply !== "string" || parsed.reply.length === 0) {
    throw new Error("Model response missing 'reply' string");
  }

  // Trim aggressively — Twilio segments at 160/153 chars. We tolerate up to
  // ~3 segments but cap at ~480 chars to keep cost predictable and replies
  // tight.
  const reply = parsed.reply.slice(0, 480);

  return {
    reply,
    qualified: parsed.qualified === true,
    summary: typeof parsed.summary === "string" ? parsed.summary : null,
    name: typeof parsed.name === "string" ? parsed.name : null,
    company: typeof parsed.company === "string" ? parsed.company : null,
    workflow: typeof parsed.workflow === "string" ? parsed.workflow : null,
    raw,
    model,
    promptTokens,
    completionTokens,
    costUsd,
    latencyMs,
  };
}

/** Words that should mute the conversation entirely. Twilio also handles
 * STOP/HELP at the carrier level on registered numbers, but we belt-and-
 * suspenders it so dev/sandbox numbers behave correctly too. */
const STOP_KEYWORDS = new Set([
  "stop",
  "stopall",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
]);

export function isStopKeyword(body: string): boolean {
  return STOP_KEYWORDS.has(body.trim().toLowerCase());
}

const HELP_KEYWORDS = new Set(["help", "info"]);

export function isHelpKeyword(body: string): boolean {
  return HELP_KEYWORDS.has(body.trim().toLowerCase());
}

export const HELP_REPLY =
  "DeerPark scorecard bot. Text a workflow you want help with — or email contact@deerpark.io. Reply STOP to opt out.";

export const STOP_REPLY = "Got it. Removed.";

export const FALLBACK_REPLY =
  "Tripped on something on my end — text me again in a minute, or email contact@deerpark.io.";
