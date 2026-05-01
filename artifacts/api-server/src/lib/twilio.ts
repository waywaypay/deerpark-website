import crypto from "node:crypto";

/**
 * Verify a Twilio request signature without pulling in the Twilio SDK.
 *
 * Twilio signs each webhook by:
 *   1. Taking the full request URL (scheme + host + path + querystring),
 *   2. Sorting POST parameters alphabetically by key,
 *   3. Concatenating "key + value" for each (no separator),
 *   4. Appending that to the URL,
 *   5. Computing HMAC-SHA1 with the account auth token,
 *   6. Base64-encoding the result and sending it as `X-Twilio-Signature`.
 *
 * Reference: https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function verifyTwilioSignature(args: {
  authToken: string;
  signatureHeader: string | undefined;
  /** Full external URL Twilio called, including protocol/host/path. */
  fullUrl: string;
  /** Parsed POST body (form-encoded). */
  params: Record<string, string>;
}): boolean {
  const { authToken, signatureHeader, fullUrl, params } = args;
  if (!signatureHeader) return false;

  const sortedKeys = Object.keys(params).sort();
  let data = fullUrl;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const expected = crypto
    .createHmac("sha1", authToken)
    .update(Buffer.from(data, "utf8"))
    .digest("base64");

  // Constant-time compare to avoid timing oracles.
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Escape a string for safe inclusion inside a TwiML <Message> body. */
export function twimlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Build a TwiML response that sends a single SMS reply. Empty body = no reply. */
export function twimlMessage(body: string | null): string {
  if (!body) return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>";
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${twimlEscape(body)}</Message></Response>`;
}

/** Validate that a string looks like an E.164 phone number. */
export function isE164(s: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(s);
}
