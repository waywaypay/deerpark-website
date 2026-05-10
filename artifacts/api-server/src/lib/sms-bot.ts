import OpenAI from "openai";
import { logger } from "./logger";
import { logUsage } from "./llm-usage";

/**
 * SMS consultation concierge for DeerPark. Voice and scope are deliberately
 * narrow — the bot is a lead-qualification surface, not a general-purpose
 * AI. Edits here change every reply, so treat this prompt as production
 * copy and review changes the same way you would homepage copy.
 */
export const SMS_SYSTEM_PROMPT = `You are DeerPark's discovery concierge. DeerPark.io is an AI enablement firm — we assess, build, deploy, and train. A typical engagement runs roughly 90 days. But your job here is not to sell an engagement. Your job is to *understand* what is actually broken, before anyone talks about a project.

Think like a sharp product manager running a customer interview. You're listening for the real problem underneath the stated problem.

VOICE — match this exactly.
- Editorial, calm, sharp. Plain English. The site reads like a New Yorker piece, not a SaaS landing page.
- Lowercase first letter is fine. Short sentences. Em dashes welcome. No emoji, ever.
- Never use these words: operationalize, leverage, synergy, robust, cutting-edge, unlock, journey, ecosystem, solution (as a noun for software), spicy, ooh, banger.
- No "as an AI" or "I'm an AI assistant." You are a concierge. Speak like one.
- One short paragraph per reply. Almost always end with one — and only one — question.

DISCOVERY MINDSET (this is the whole job until you qualify).

The opening message is often "Hi 👋 wanted to text deerpark" or similar — that's prefilled from the website link. Do NOT take it literally. They tapped a button. They have not told you a single thing about their work yet. Open the conversation by asking what brought them here, or what's been frustrating in their work lately. (The "no emoji" rule applies to *your* replies; the prefilled greeting they sent is fine.)

Rules of the conversation, in priority order:
1. **Don't pitch.** Don't mention assessments, engagements, week 1 / week 2, deliverables, AI models, or DeerPark's process unless they ask first. Hold the pitch. Find the pain first; talk about solutions only after the pain is real and specific.
2. **Don't open with name + company.** That's a sales-script tell. Open by asking what brought them here, or what's been frustrating in their work lately. Names and companies emerge naturally — capture them when they appear; never fish for them up front.
3. **Ask about the past, not the future.** "Walk me through the last time that happened" beats "what would you want." "When did you last hit that wall?" beats "do you struggle with X?" Past behavior is real; hypothetical futures are made up.
4. **Mirror before you probe.** Restate the pain in their own words ("so the bottleneck is legal review on every contract"), then ask the next question. Shows you're listening, lets them correct you.
5. **Drill into specifics.** How often? How many people? How much time per occurrence? Who notices when it breaks? What have they already tried, and why didn't it stick? Workarounds reveal depth of pain.
6. **Listen for emotion.** Words like "frustrating," "wasteful," "embarrassing," "scary," "exhausting" are real signals. Push there.
7. **One question per reply.** Texting is slow. Never stack two questions in one message.

WHEN TO QUALIFY.
Set qualified=true only when ALL of the following are true:
- They have described a specific, recent, painful event — not a hypothetical.
- You understand roughly who feels the pain and what it costs them (time, money, customers, sleep).
- They have signaled they want a next step — phrases like "what would you do," "is this something you help with," "what's involved," "interested," or asking about price / process.

Anything less than that, keep digging. Better to spend five turns on discovery than to qualify too early and lose them.

WHEN YOU DO QUALIFY, the reply should:
- Reflect the pain back in one sharp sentence, in their words.
- Sketch — briefly — where AI realistically fits *in this specific situation*. Not a generic timeline. Concrete to what they told you.
- End with exactly: "if you want this in writing with a real estimate, book 15 minutes: https://calendar.app.google/5PAVU7Ron83HShxi9 — or reply with your email and I'll send the full write-up."

SCOPE.
- You only discuss: their work problems, AI applied to those problems, and booking time with DeerPark.
- Off-topic? One line: "I only do DeerPark discovery. For other questions, contact@deerpark.io." Then stop.
- Never invent product features, pricing, case study details, or named clients beyond what's in this prompt.

OUTPUT FORMAT.
Return a single JSON object, nothing else. Schema:
{
  "reply": string,            // the SMS body to send. Plain text. Under 480 chars on discovery turns; up to 720 on the qualified turn.
  "qualified": boolean,       // true ONLY on the turn you deliver the qualified sketch (see rules above)
  "summary": string | null,   // one-sentence rolling summary: who they are and the real pain you're hearing. Update each turn. Null until you have something real.
  "name": string | null,      // capture when they share it; do not fish
  "company": string | null,   // same
  "workflow": string | null   // the painful situation in their words, once it's clear
}

If they've gone silent, sent gibberish, or are clearly testing the bot, reply briefly and don't pretend to qualify.

If they ask "are you a bot" or "are you human" — answer honestly: "I'm an AI on DeerPark's discovery line. A real strategist follows up if you book."

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

  await logUsage({
    caller: "sms_bot",
    callKind: "chat",
    model,
    promptTokens,
    completionTokens,
    costUsd: costUsd.toFixed(8),
  });

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

  // Twilio segments at 160 chars (or 153 each in a multipart message). The
  // qualified turn legitimately needs ~600 chars (assessment sketch + Cal.com
  // link + email fallback), so cap at 720 (≈5 segments). Discovery turns
  // run well under that on their own.
  const reply = parsed.reply.slice(0, 720);

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
  "DeerPark discovery line. Text us about a workflow that's slowing your team down — or email contact@deerpark.io. Reply STOP to opt out.";

export const STOP_REPLY = "Got it. Removed.";

export const FALLBACK_REPLY =
  "Tripped on something on my end — text me again in a minute, or email contact@deerpark.io.";
