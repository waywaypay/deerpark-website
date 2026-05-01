# SMS scorecard concierge

Inbound-SMS lead-capture path. Visitor texts the DeerPark concierge number, an
LLM-powered concierge runs a 2-3 turn discovery, and qualified conversations
get pushed into the existing `leads` table. Every inbound and outbound
message is stored with model + token + cost metadata so we can run evals
offline.

## Architecture

```
Twilio number ──► POST /api/sms/inbound (TwiML reply)
                       │
                       ├─► sms_messages       ← inbound, then outbound
                       ├─► sms_conversations  ← rolling state per phone
                       └─► leads              ← when bot marks qualified=true
```

- `src/routes/sms.ts` — webhook. Verifies Twilio signature, dedupes on
  `MessageSid`, calls the bot, replies via TwiML in the same response.
- `src/lib/sms-bot.ts` — system prompt + JSON-mode call against the
  OpenAI-compatible `LLM_*` client. Editorial voice; refuses off-topic.
- `src/lib/twilio.ts` — signature verification (HMAC-SHA1) and TwiML
  helpers, hand-rolled to avoid pulling in the Twilio SDK.
- `src/routes/sms-admin.ts` — gated by `ADMIN_SECRET`. Lists conversations,
  exports messages for offline eval pipelines.

## Setup (production)

1. **Provision a Twilio number.**
   - Toll-free is fastest (provisioned in hours; carrier verification 1-3
     weeks but the number works the whole time). Long-code US needs A2P
     10DLC registration before you can send anything.
   - In the Twilio console → Phone Numbers → your number → Messaging →
     "A MESSAGE COMES IN" → Webhook → `https://api.deerpark.io/api/sms/inbound`
     (POST).

2. **Set env vars.**
   ```
   TWILIO_AUTH_TOKEN=<from twilio console>
   LLM_API_KEY=<your venice/openrouter/openai key>
   LLM_BASE_URL=https://api.venice.ai/api/v1   # or whichever
   SMS_LLM_MODEL=claude-sonnet-4-5             # or claude-haiku-4-5 for cost
   ADMIN_SECRET=<openssl rand -hex 32>
   ```
   Do **not** set `TWILIO_SKIP_VERIFY=1` in production. Without signature
   verification anyone can post to the webhook and burn LLM budget.

3. **Apply schema.**
   ```
   pnpm --filter @workspace/db push
   ```

4. **Set the web client number.**
   In the deerpark-web build env (Vercel, Fly, wherever):
   ```
   VITE_SMS_NUMBER=+15551234567
   ```
   When unset the SMS CTAs render nothing — that's the kill switch.

## Setup (local development)

```bash
# 1. Get the dev server up
cd artifacts/api-server
cp .env.example .env
# fill in DATABASE_URL, LLM_API_KEY, ADMIN_SECRET, TWILIO_SKIP_VERIFY=1
pnpm dev

# 2. Tunnel so Twilio can reach localhost (or simulate via curl)
ngrok http 3000   # → https://abc123.ngrok.io
# Point a Twilio test number at https://abc123.ngrok.io/api/sms/inbound

# 3. Or just curl it
curl -X POST http://localhost:3000/api/sms/inbound \
  -d 'MessageSid=SMtest1' \
  -d 'From=+15551234567' \
  -d 'Body=Hi'
```

With `TWILIO_SKIP_VERIFY=1` the webhook accepts any POST. Never set this in
production.

## Eval workflow

The whole point of this design is that every message is reviewable.

```bash
# Recent conversations (most-recently-active first)
curl https://api.deerpark.io/api/admin/sms/conversations \
  -H "Authorization: Bearer $ADMIN_SECRET" | jq

# Full transcript for one conversation, including raw model JSON
curl https://api.deerpark.io/api/admin/sms/conversations/42 \
  -H "Authorization: Bearer $ADMIN_SECRET" | jq

# Bulk export since a timestamp (for offline eval pipelines)
curl "https://api.deerpark.io/api/admin/sms/messages?since=2026-04-01T00:00:00Z" \
  -H "Authorization: Bearer $ADMIN_SECRET" | jq

# Manually mute an abusive number
curl -X POST https://api.deerpark.io/api/admin/sms/conversations/42/mute \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"muted": true}'
```

Every outbound row stores: `model`, `prompt_tokens`, `completion_tokens`,
`cost_usd`, `latency_ms`, and the unparsed `raw_model_response`. Build evals
against that — judge the reply quality, the qualification accuracy, the
voice match against the prompt's banned-word list, etc.

## Cost ceiling

At ~100 conversations/month × ~10 messages avg × Claude Sonnet 4.5 pricing,
expect ~$3-5/mo in LLM cost. Twilio toll-free runs ~$2/mo + ~$0.008 per
inbound + outbound segment. Switch to `SMS_LLM_MODEL=claude-haiku-4-5`
(or any cheaper model the OpenAI-compat endpoint exposes) to drop LLM cost
~3x with minor quality loss on the qualification turn.

## Safety knobs

- `STOP / UNSUBSCRIBE / CANCEL / END / QUIT` (case-insensitive) → mutes
  the conversation forever, replies once with `STOP_REPLY`, no LLM call.
- `HELP / INFO` → static reply, no LLM call.
- Replies capped at 480 chars (≈3 SMS segments).
- Bot prompt forbids inventing pricing, case study details, or named
  clients beyond what's in the prompt itself.
- Lead-capture turn writes to `leads` with synthesized email
  `<digits>@sms.deerpark.io` so existing lead pipelines work; the actual
  phone is in `challenge` for follow-up.

## What's intentionally NOT here yet

- **Outbound-initiated SMS.** The webhook only replies to inbound. Sending
  unsolicited SMS to a list is a regulatory minefield (TCPA in the US).
  If we add it, route through Twilio's REST API with an explicit opt-in
  table and STOP-keyword precheck.
- **Rate limiting.** A single number could blow up our LLM bill by texting
  in a loop. If we see abuse, add a per-phone-per-hour cap before a real
  rate limiter. For now, manual `mute` via the admin endpoint is the
  pressure valve.
- **A/B prompt testing.** Easy to add — store `prompt_version` on the
  conversation row, pick deterministically by phone hash. Defer until
  we have enough eval data to know what to test.
