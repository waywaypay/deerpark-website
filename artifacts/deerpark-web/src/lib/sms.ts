/**
 * SMS scorecard concierge config.
 *
 * Set `VITE_SMS_NUMBER` in the build env to a full E.164 phone number
 * (e.g. "+15551234567"). When unset, all SMS CTAs render nothing — that's
 * the kill switch if Twilio breaks or we want to ship the SEO/copy work
 * before the number is provisioned.
 */

const RAW_NUMBER = (import.meta.env.VITE_SMS_NUMBER as string | undefined)?.trim() ?? "";

const E164_RE = /^\+[1-9]\d{6,14}$/;

export const SMS_NUMBER_E164: string | null = E164_RE.test(RAW_NUMBER)
  ? RAW_NUMBER
  : null;

/** Pretty-print a US number; otherwise return as-is. */
export function formatSmsNumber(e164: string): string {
  // +15551234567 → +1 (555) 123-4567
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (m) return `+1 (${m[1]}) ${m[2]}-${m[3]}`;
  return e164;
}

/**
 * Build the platform-correct sms: URI. iOS uses `&body=`, Android uses
 * `?body=` — the `?` form works on both modern stacks; iOS quietly accepts
 * either. We keep it simple and use `?body=`.
 */
export function smsHref(e164: string, body = "Hi, scorecard please."): string {
  return `sms:${e164}?body=${encodeURIComponent(body)}`;
}

export const SMS_ENABLED = SMS_NUMBER_E164 !== null;
