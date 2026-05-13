// Lightweight first-party attribution capture for lead-gen forms.
//
// On first page load, snapshots utm_* params and the referrer into
// sessionStorage so they survive in-app navigation between landing and
// the form submission. `encodeSource` packs the snapshot into the
// existing free-text `source` field on the leads/subscribers tables —
// no DB migration needed, stays under the 100-char column cap.

type Attribution = {
  src?: string;
  med?: string;
  cmp?: string;
  cnt?: string;
  ref?: string;
};

const STORAGE_KEY = "dp_attr_v1";
const SOURCE_FIELD_CAP = 100;

function readSession(): Attribution | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Attribution) : null;
  } catch {
    return null;
  }
}

function writeSession(attr: Attribution): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attr));
  } catch {
    // Session storage may be disabled in private mode — best-effort only.
  }
}

function snapshotFromUrl(): Attribution {
  const url = new URL(window.location.href);
  const p = url.searchParams;
  const attr: Attribution = {};
  const src = p.get("utm_source");
  const med = p.get("utm_medium");
  const cmp = p.get("utm_campaign");
  const cnt = p.get("utm_content");
  if (src) attr.src = src;
  if (med) attr.med = med;
  if (cmp) attr.cmp = cmp;
  if (cnt) attr.cnt = cnt;
  if (document.referrer) {
    try {
      const r = new URL(document.referrer);
      if (r.host && r.host !== window.location.host) attr.ref = r.host;
    } catch {
      // Malformed referrer — ignore.
    }
  }
  return attr;
}

// Initialize once per session. Subsequent calls keep the first-touch
// snapshot, so a user who lands via a UTM link and navigates internally
// before submitting still gets attributed to the original channel.
function ensureSnapshot(): Attribution {
  if (typeof window === "undefined") return {};
  const existing = readSession();
  if (existing) return existing;
  const fresh = snapshotFromUrl();
  if (Object.keys(fresh).length > 0) writeSession(fresh);
  return fresh;
}

function sanitize(value: string): string {
  return value.replace(/[|/]/g, "-").slice(0, 24);
}

// Returns the `source` value to send to the API. When attribution is
// present, appends a compact `|u:src/med/cmp` (and optionally `|r:host`)
// suffix, then truncates to the column cap.
export function encodeSource(baseSource: string): string {
  const attr = ensureSnapshot();
  const parts: string[] = [baseSource];
  if (attr.src || attr.med || attr.cmp) {
    const utm = [attr.src, attr.med, attr.cmp]
      .map((v) => (v ? sanitize(v) : ""))
      .join("/");
    parts.push(`u:${utm}`);
  }
  if (attr.ref) parts.push(`r:${sanitize(attr.ref)}`);
  return parts.join("|").slice(0, SOURCE_FIELD_CAP);
}
