import { Fragment, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  RefreshCw,
  LogOut,
  Play,
  ExternalLink,
  Mail,
  Bot,
  Radio,
  PenLine,
  Send,
  ChevronRight,
  ChevronDown,
  Gavel,
  Eye,
  MessageSquare,
  FileText,
} from "lucide-react";

const TOKEN_KEY = "deerpark.admin.token";

type Agent = {
  id: string;
  displayName: string;
  category: string;
  kind: string;
  url: string;
  enabled: boolean;
  headlineCount: number;
  latestPublishedAt: string | null;
  latestIngestedAt: string | null;
};

type AgentHeadline = {
  id: number;
  title: string;
  url: string;
  category: string;
  publishedAt: string;
  createdAt: string;
};

type AgentDetail = {
  agent: Omit<Agent, "headlineCount" | "latestPublishedAt" | "latestIngestedAt">;
  headlines: AgentHeadline[];
};

type Lead = {
  id: string;
  source: "consultation" | "dispatch";
  sourceDetail: string | null;
  createdAt: string;
  name: string | null;
  contact: string;
  contactType: "email" | "sms";
  company: string | null;
  challenge: string | null;
  unsubscribedAt: string | null;
};

type IngestResult = {
  source: string;
  fetched: number;
  inserted: number;
  error?: string;
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
};

// Strip HTML tags safely. DOMParser with "text/html" does NOT execute scripts
// or fetch resources during parsing, so extracting textContent is XSS-safe
// even for LLM-produced HTML (which is what we have in dispatch_archive —
// intro text is rendered from polished markdown, an untrusted source from a
// security perspective). Use this anywhere archived intro/commentary is
// surfaced in the authenticated admin UI.
const htmlToText = (html: string): string => {
  if (typeof window === "undefined" || !html) return html ?? "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").trim();
};

const apiFetch = async (token: string, path: string, init?: RequestInit) => {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  return res;
};

const Login = ({ onAuthed }: { onAuthed: (token: string) => void }) => {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(token, "/admin/whoami");
      if (res.ok) {
        sessionStorage.setItem(TOKEN_KEY, token);
        onAuthed(token);
      } else if (res.status === 401) {
        setError("Invalid admin token.");
      } else if (res.status === 503) {
        setError("Admin is disabled — ADMIN_SECRET is not configured on the server.");
      } else {
        setError(`Unexpected response: ${res.status}`);
      }
    } catch {
      setError("Network error. Is the API server running?");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <form onSubmit={onSubmit} className="w-full max-w-md border border-foreground/15 bg-card p-8 space-y-5">
        <div>
          <div className="section-label mb-2">DeerPark</div>
          <h1 className="text-2xl font-serif">Admin sign-in</h1>
          <p className="text-sm text-muted-foreground font-light mt-2">
            Enter the admin token (the value of <code>ADMIN_SECRET</code> on the API server).
          </p>
        </div>
        <div>
          <label htmlFor="token" className="section-label block mb-2">Admin token</label>
          <input
            id="token"
            type="password"
            autoFocus
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={submitting}
            className="w-full h-12 bg-background border border-foreground/15 px-4 text-sm outline-none focus:border-primary/80 disabled:opacity-50"
          />
        </div>
        {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
        <Button
          type="submit"
          disabled={submitting || token.length === 0}
          className="w-full rounded-none h-12 bg-foreground text-background hover:bg-foreground/90 text-xs uppercase tracking-widest"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
        <Link href="/" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
          <ArrowLeft className="w-3 h-3" /> Back to site
        </Link>
      </form>
    </div>
  );
};

const AgentsTab = ({ token }: { token: string }) => {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<IngestResult[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(token, "/admin/agents");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { items: Agent[] };
      setAgents(json.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await apiFetch(token, `/admin/agents/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDetail((await res.json()) as AgentDetail);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const runOne = async (id: string) => {
    setBusyId(id);
    setLastRun(null);
    try {
      const res = await apiFetch(token, `/admin/agents/${id}/ingest`, { method: "POST" });
      if (res.ok) {
        const json = (await res.json()) as { result: IngestResult };
        setLastRun([json.result]);
        await load();
        if (selectedId === id) await loadDetail(id);
      }
    } finally {
      setBusyId(null);
    }
  };

  const runAll = async () => {
    setBusyId("__all__");
    setLastRun(null);
    try {
      const res = await apiFetch(token, "/admin/agents/ingest", { method: "POST" });
      if (res.ok) {
        const json = (await res.json()) as { results: IngestResult[] };
        setLastRun(json.results);
        await load();
        if (selectedId) await loadDetail(selectedId);
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif">Headline ingestion agents</h2>
          <p className="text-sm text-muted-foreground font-light mt-1">
            Sources that fetch AI news on a schedule. The scheduler runs every {" "}
            <code>HEADLINE_INGEST_INTERVAL_MIN</code> minutes (default 15).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-none text-xs uppercase tracking-widest"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button
            onClick={() => void runAll()}
            disabled={busyId !== null}
            className="rounded-none text-xs uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90"
          >
            <Play className="w-3.5 h-3.5" />
            {busyId === "__all__" ? "Running…" : "Run all now"}
          </Button>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {lastRun && (
        <div className="border border-foreground/15 bg-card p-4 text-xs font-sans">
          <div className="section-label mb-2">Last run</div>
          <ul className="space-y-1">
            {lastRun.map((r) => (
              <li key={r.source} className={r.error ? "text-red-400" : "text-muted-foreground"}>
                <span className="text-foreground">{r.source}</span> — fetched {r.fetched}, inserted {r.inserted}
                {r.error ? ` — error: ${r.error}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border border-foreground/15 bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left bg-background/40">
            <tr className="border-b border-foreground/10">
              <th className="px-4 py-3 section-label">Agent</th>
              <th className="px-4 py-3 section-label">Category</th>
              <th className="px-4 py-3 section-label">Kind</th>
              <th className="px-4 py-3 section-label">Status</th>
              <th className="px-4 py-3 section-label">Headlines</th>
              <th className="px-4 py-3 section-label">Latest published</th>
              <th className="px-4 py-3 section-label">Last ingest</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {agents?.map((a) => (
              <tr key={a.id} className="border-b border-foreground/10 hover:bg-background/40">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    className="text-foreground hover:underline underline-offset-4"
                  >
                    {a.displayName}
                  </button>
                  <div className="text-[11px] text-muted-foreground font-mono">{a.id}</div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{a.category}</td>
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{a.kind}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] uppercase tracking-widest px-2 py-1 border ${a.enabled ? "border-primary/40 text-primary" : "border-foreground/20 text-muted-foreground"}`}>
                    {a.enabled ? "Enabled" : "Disabled"}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{a.headlineCount}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(a.latestPublishedAt)}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(a.latestIngestedAt)}</td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!a.enabled || busyId !== null}
                    onClick={() => void runOne(a.id)}
                    className="rounded-none text-[10px] uppercase tracking-widest"
                  >
                    <Play className="w-3 h-3" />
                    {busyId === a.id ? "…" : "Run"}
                  </Button>
                </td>
              </tr>
            ))}
            {agents && agents.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground text-sm">
                  No agents configured.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <div className="border border-foreground/15 bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/10">
            <div>
              <div className="section-label">Agent detail</div>
              <div className="text-base font-serif mt-1">
                {detail?.agent.displayName ?? selectedId}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          <div className="p-4">
            {detailLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
            {detail && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-6">
                  <div>
                    <div className="section-label">Kind</div>
                    <div className="font-mono">{detail.agent.kind}</div>
                  </div>
                  <div>
                    <div className="section-label">Category</div>
                    <div>{detail.agent.category}</div>
                  </div>
                  <div className="md:col-span-2 min-w-0">
                    <div className="section-label">Source URL</div>
                    <a
                      href={detail.agent.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs truncate inline-flex items-center gap-1 hover:text-foreground"
                    >
                      <span className="truncate">{detail.agent.url || "(none)"}</span>
                      {detail.agent.url && <ExternalLink className="w-3 h-3 shrink-0" />}
                    </a>
                  </div>
                </div>
                <div className="section-label mb-3">Recent headlines ({detail.headlines.length})</div>
                <ul className="divide-y divide-foreground/10">
                  {detail.headlines.map((h) => (
                    <li key={h.id} className="py-3 flex gap-4 items-start">
                      <div className="text-[11px] text-muted-foreground font-mono w-32 shrink-0">
                        {formatDate(h.publishedAt)}
                      </div>
                      <a
                        href={h.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm hover:underline underline-offset-4 flex-1"
                      >
                        {h.title}
                      </a>
                    </li>
                  ))}
                  {detail.headlines.length === 0 && (
                    <li className="py-6 text-sm text-muted-foreground text-center">
                      No headlines ingested yet.
                    </li>
                  )}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const LeadsTab = ({ token }: { token: string }) => {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(token, "/admin/leads");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { items: Lead[] };
      setLeads(json.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (!leads) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      [l.name, l.contact, l.company, l.challenge, l.source, l.sourceDetail]
        .some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [leads, filter]);

  const exportCsv = () => {
    if (!leads || leads.length === 0) return;
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = [
      "id",
      "source",
      "sourceDetail",
      "createdAt",
      "name",
      "contactType",
      "contact",
      "company",
      "challenge",
      "unsubscribedAt",
    ];
    const rows = leads.map((l) =>
      [
        l.id,
        l.source,
        l.sourceDetail ?? "",
        l.createdAt,
        l.name ?? "",
        l.contactType,
        l.contact,
        l.company ?? "",
        l.challenge ?? "",
        l.unsubscribedAt ?? "",
      ]
        .map((v) => escape(String(v)))
        .join(","),
    );
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deerpark-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyContacts = async () => {
    if (!filtered.length) return;
    const list = filtered.map((l) => l.contact).join(", ");
    await navigator.clipboard.writeText(list);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-serif">Leads</h2>
          <p className="text-sm text-muted-foreground font-light mt-1">
            Everyone who's reached out — free consultation requests and Dispatch newsletter subscribers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-9 px-3 bg-background border border-foreground/15 text-sm outline-none focus:border-primary/80"
          />
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-none text-xs uppercase tracking-widest"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => void copyContacts()}
            disabled={!filtered.length}
            className="rounded-none text-xs uppercase tracking-widest"
          >
            Copy contacts
          </Button>
          <Button
            onClick={exportCsv}
            disabled={!leads || leads.length === 0}
            className="rounded-none text-xs uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90"
          >
            Export CSV
          </Button>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="text-xs text-muted-foreground">
        {leads ? `${filtered.length} of ${leads.length} ${leads.length === 1 ? "lead" : "leads"}` : "Loading…"}
      </div>

      <div className="border border-foreground/15 bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left bg-background/40">
            <tr className="border-b border-foreground/10">
              <th className="px-4 py-3 section-label">Submitted</th>
              <th className="px-4 py-3 section-label">Source</th>
              <th className="px-4 py-3 section-label">Name</th>
              <th className="px-4 py-3 section-label">Contact</th>
              <th className="px-4 py-3 section-label">Company</th>
              <th className="px-4 py-3 section-label">Challenge</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => {
              const sourceLabel = l.source === "consultation" ? "Consultation" : "Dispatch";
              const sourceClass =
                l.source === "consultation"
                  ? "border-primary/40 text-primary"
                  : "border-foreground/30 text-foreground/80";
              return (
                <tr
                  key={l.id}
                  className="border-b border-foreground/10 hover:bg-background/40 cursor-pointer"
                  onClick={() => setExpanded((id) => (id === l.id ? null : l.id))}
                >
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDate(l.createdAt)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`text-[10px] uppercase tracking-widest border px-1.5 py-0.5 ${sourceClass}`}>
                      {sourceLabel}
                    </span>
                    {l.sourceDetail && (
                      <span className="ml-2 text-[10px] uppercase tracking-widest text-muted-foreground border border-foreground/15 px-1.5 py-0.5">
                        {l.sourceDetail}
                      </span>
                    )}
                    {l.source === "dispatch" && l.unsubscribedAt && (
                      <span className="ml-2 text-[10px] uppercase tracking-widest text-muted-foreground border border-foreground/15 px-1.5 py-0.5">
                        Unsubscribed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{l.name ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground border border-foreground/15 px-1.5 py-0.5">
                        {l.contactType === "sms" ? "SMS" : "Email"}
                      </span>
                      <a
                        href={l.contactType === "sms" ? `sms:${l.contact}` : `mailto:${l.contact}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:underline underline-offset-4"
                      >
                        {l.contact}
                      </a>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {l.company ?? <span>—</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-md">
                    {l.challenge ? (
                      <div className={expanded === l.id ? "whitespace-pre-wrap" : "truncate"}>
                        {l.challenge}
                      </div>
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {leads && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">
                  {leads.length === 0 ? "No leads yet." : "No leads match that filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

type WriterAgent = {
  id: string;
  displayName: string;
  description: string;
  model: string;
  baseUrl: string;
  enabled: boolean;
  configured: boolean;
  postCount: number;
  latestPublishedAt: string | null;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCostUsd: string;
};

type AdminPost = {
  id: number;
  agentId: string;
  mode: string;
  tag: string;
  title: string;
  dek: string;
  bodyMarkdown: string;
  citations: string[];
  sourceHeadlineIds: number[];
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  costUsd: string | null;
  publishedAt: string;
  createdAt: string;
};

const formatTokens = (n: number | null | undefined) => {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
};

const formatUsd = (s: string | number | null | undefined) => {
  if (s === null || s === undefined || s === "") return "—";
  const n = typeof s === "string" ? Number(s) : s;
  if (!Number.isFinite(n) || n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
};

type DigestState = {
  config: {
    hasFromEmail: boolean;
    hasResendKey: boolean;
    hasLlmKey: boolean;
    hourPt: number;
    minutePt: number;
    timezone: string;
    ready: boolean;
  } | null;
  lastSentPtDate: string | null;
  todayPtDate: string;
  alreadySentToday: boolean;
  topCandidateCount: number;
  activeSubscribers: number;
};

type DigestPreview = {
  subject: string;
  html: string;
  text: string;
  headlineCount: number;
  bannerGenerated: boolean;
  polishApplied: boolean;
};

type DigestRunResult = {
  ok: boolean;
  sent: number | null;
  failed?: number;
  subject?: string;
  headlineCount?: number;
  bannerGenerated?: boolean;
  polishApplied?: boolean;
  reason?: string;
  firstFailure?: string | null;
  results?: Array<{ recipient: string; ok: boolean; error?: string }>;
};

type ComposeDiagnostics = {
  polishStatus: "success" | "no_api_key" | "request_failed" | "parse_failed" | "missing_subject_or_intro";
  polishError?: string;
  polishCommentaryCount: number;
  fallbackCommentaryCount: number;
  fallbackError?: string;
  finalCommentaryCount: number;
  headlineCount: number;
};

type DigestTestSendResult =
  | {
      ok: true;
      recipient: string;
      subject: string;
      headlineCount: number;
      bannerGenerated: boolean;
      polishApplied: boolean;
      diagnostics: ComposeDiagnostics;
    }
  | { ok: false; recipient?: string; error: string };

type JudgeSpec = {
  judge: {
    model: string;
    baseUrl: string;
    configured: boolean;
    minTopRelevanceScore: number;
    judgeLookbackDays: number;
    batchSize: number;
    errorStreakBreak: number;
  };
  topSelection: {
    tierWeights: Record<string, number>;
    halfLifeDays: number;
    perSourceCap: number;
    defaultDays: number;
    defaultLimit: number;
    dedupeThreshold: number;
    minPapers: number;
    broadPressSources: string[];
    broadPressRequiresOrg: boolean;
    requiresCommentary: boolean;
  };
  lastRun: {
    finishedAt: string;
    summary: { candidates: number; scored: number; batches: number; errors: number };
    model: string;
    lastError?: string;
  } | null;
  stats: {
    total: number;
    scored: number;
    unscored: number;
    lowest: Array<{ id: number; source: string; title: string; relevanceScore: number }>;
    highest: Array<{ id: number; source: string; title: string; relevanceScore: number }>;
  };
};

const WRITER_MODES = [
  { id: "auto", label: "Auto (agent picks)" },
  { id: "deep_dive", label: "Deep dive" },
  { id: "free_pick", label: "Free pick" },
  { id: "weekly_recap", label: "Weekly recap (week's top-10)" },
] as const;

type WriterModeId = (typeof WRITER_MODES)[number]["id"];

type WriterModeSlot = "free_pick" | "deep_dive" | "weekly_recap";
type PromptSlotId = "base" | WriterModeSlot;

type PromptSlotState = { value: string; isCustom: boolean; default: string };

const PROMPT_SLOT_TABS: { id: PromptSlotId; label: string; helper: string }[] = [
  { id: "base", label: "Shared rules", helper: "Voice, format, citation rules. Applied to every run regardless of mode." },
  { id: "free_pick", label: "Free pick", helper: "Default daily recap framing. ~700–900 words." },
  { id: "deep_dive", label: "Deep dive", helper: "Top 3 items get extra context. ~900–1100 words." },
  { id: "weekly_recap", label: "Weekly recap", helper: "Once-per-week roundup framed around the week." },
];

const PROMPT_LIMITS: Record<PromptSlotId, { min: number; max: number }> = {
  base: { min: 200, max: 20_000 },
  free_pick: { min: 0, max: 4_000 },
  deep_dive: { min: 0, max: 4_000 },
  weekly_recap: { min: 0, max: 4_000 },
};

const WriterAgentsTab = ({ token }: { token: string }) => {
  const [agents, setAgents] = useState<WriterAgent[] | null>(null);
  const [posts, setPosts] = useState<AdminPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [runMode, setRunMode] = useState<WriterModeId>("auto");
  const [lastRun, setLastRun] = useState<{ ok: boolean; message: string } | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<number | null>(null);

  // Prompt editor state. Four slots: a shared base prompt + one addendum per
  // mode. Each slot has its own draft, isCustom flag, and built-in default.
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptSlots, setPromptSlots] = useState<{
    base: PromptSlotState;
    addenda: Record<WriterModeSlot, PromptSlotState>;
  } | null>(null);
  const [drafts, setDrafts] = useState<Record<PromptSlotId, string>>({
    base: "",
    free_pick: "",
    deep_dive: "",
    weekly_recap: "",
  });
  const [activeSlot, setActiveSlot] = useState<PromptSlotId>("base");
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptStatus, setPromptStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [aRes, pRes] = await Promise.all([
        apiFetch(token, "/admin/writers"),
        apiFetch(token, "/admin/posts"),
      ]);
      if (!aRes.ok) throw new Error(`Writers HTTP ${aRes.status}`);
      if (!pRes.ok) throw new Error(`Posts HTTP ${pRes.status}`);
      const aJson = (await aRes.json()) as { items: WriterAgent[] };
      const pJson = (await pRes.json()) as { items: AdminPost[] };
      setAgents(aJson.items);
      setPosts(pJson.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load writers");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const runOne = async (id: string) => {
    setBusyId(id);
    setLastRun({ ok: true, message: "Starting run…" });
    try {
      const kickoff = await apiFetch(token, `/admin/writers/${id}/run?mode=${runMode}`, {
        method: "POST",
      });
      const kickoffText = await kickoff.text();
      let kickoffJson: { error?: string; accepted?: boolean } | null = null;
      try {
        kickoffJson = JSON.parse(kickoffText);
      } catch {
        kickoffJson = null;
      }
      if (!kickoff.ok && kickoff.status !== 202) {
        const msg = kickoffJson?.error ?? `HTTP ${kickoff.status}: ${kickoffText.slice(0, 200)}`;
        setLastRun({ ok: false, message: msg });
        setBusyId(null);
        return;
      }

      // Poll for up to 8 minutes. With 1,400–2,500 word posts plus a possible
      // retry on length-validator rejection, Claude reasoning can run 4–6 min.
      setLastRun({
        ok: true,
        message: "Generating… (this can take 3–6 minutes for long posts with retry)",
      });
      const startedAt = Date.now();
      const deadlineMs = 8 * 60 * 1000;
      const pollIntervalMs = 4000;
      while (Date.now() - startedAt < deadlineMs) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        const stRes = await apiFetch(token, `/admin/writers/${id}/run-status`);
        if (!stRes.ok) continue;
        const stJson = (await stRes.json()) as {
          status: {
            status: "idle" | "running" | "ok" | "error" | "aborted";
            postId: number | null;
            error: string | null;
            rationale: string | null;
          };
        };
        const s = stJson.status;
        if (s.status === "ok") {
          setLastRun({ ok: true, message: `Wrote post #${s.postId}` });
          await load();
          setBusyId(null);
          return;
        }
        if (s.status === "aborted") {
          // Clean outcome: agent decided the corpus doesn't support a real
          // piece today. Surface as informational, not an error.
          setLastRun({
            ok: true,
            message: `No post today — agent aborted: ${s.rationale ?? "corpus too thin for a real piece"}`,
          });
          setBusyId(null);
          return;
        }
        if (s.status === "error") {
          setLastRun({ ok: false, message: s.error ?? "Run failed" });
          setBusyId(null);
          return;
        }
      }
      setLastRun({
        ok: false,
        message:
          "Timed out waiting for the run to finish (8 minutes). The run may have completed — refresh the page and check Recent posts before re-running.",
      });
    } catch (err) {
      setLastRun({ ok: false, message: err instanceof Error ? err.message : "Run failed" });
    } finally {
      setBusyId(null);
    }
  };

  const stateForSlot = (
    slots: { base: PromptSlotState; addenda: Record<WriterModeSlot, PromptSlotState> },
    slot: PromptSlotId,
  ): PromptSlotState => (slot === "base" ? slots.base : slots.addenda[slot]);

  const openPromptEditor = async () => {
    setPromptOpen(true);
    setPromptStatus(null);
    setPromptLoading(true);
    try {
      const res = await apiFetch(token, "/admin/writers/daily-writer/prompt");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        base: PromptSlotState;
        addenda: Record<WriterModeSlot, PromptSlotState>;
      };
      setPromptSlots(json);
      setDrafts({
        base: json.base.value,
        free_pick: json.addenda.free_pick.value,
        deep_dive: json.addenda.deep_dive.value,
        weekly_recap: json.addenda.weekly_recap.value,
      });
    } catch (err) {
      setPromptStatus({
        ok: false,
        message: err instanceof Error ? err.message : "Failed to load prompt",
      });
    } finally {
      setPromptLoading(false);
    }
  };

  const savePromptSlot = async (slot: PromptSlotId) => {
    setPromptSaving(true);
    setPromptStatus(null);
    try {
      const res = await apiFetch(token, "/admin/writers/daily-writer/prompt", {
        method: "PUT",
        body: JSON.stringify({ slot, value: drafts[slot] }),
      });
      const json = (await res.json()) as { error?: string };
      if (res.ok) {
        setPromptSlots((prev) => {
          if (!prev) return prev;
          const next = { ...prev, addenda: { ...prev.addenda } };
          const updated: PromptSlotState = {
            value: drafts[slot],
            isCustom: true,
            default: stateForSlot(prev, slot).default,
          };
          if (slot === "base") next.base = updated;
          else next.addenda[slot] = updated;
          return next;
        });
        setPromptStatus({ ok: true, message: `Saved ${slot}. Next run will use it.` });
      } else {
        setPromptStatus({ ok: false, message: json.error ?? `HTTP ${res.status}` });
      }
    } catch (err) {
      setPromptStatus({
        ok: false,
        message: err instanceof Error ? err.message : "Save failed",
      });
    } finally {
      setPromptSaving(false);
    }
  };

  const resetPromptSlot = async (slot: PromptSlotId) => {
    if (!promptSlots) return;
    const label = PROMPT_SLOT_TABS.find((t) => t.id === slot)?.label ?? slot;
    if (!confirm(`Reset "${label}" to the built-in default? Your custom edits for this slot will be deleted.`)) return;
    const defaultValue = stateForSlot(promptSlots, slot).default;
    setPromptSaving(true);
    setPromptStatus(null);
    try {
      const res = await apiFetch(
        token,
        `/admin/writers/daily-writer/prompt?slot=${encodeURIComponent(slot)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPromptSlots((prev) => {
        if (!prev) return prev;
        const updated: PromptSlotState = { value: defaultValue, isCustom: false, default: defaultValue };
        const next = { ...prev, addenda: { ...prev.addenda } };
        if (slot === "base") next.base = updated;
        else next.addenda[slot] = updated;
        return next;
      });
      setDrafts((d) => ({ ...d, [slot]: defaultValue }));
      setPromptStatus({ ok: true, message: `Reset ${slot} to default.` });
    } catch (err) {
      setPromptStatus({
        ok: false,
        message: err instanceof Error ? err.message : "Reset failed",
      });
    } finally {
      setPromptSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif">Writer agents</h2>
          <p className="text-sm text-muted-foreground font-light mt-1">
            Agents that turn ingested headlines into posts. Anti-hallucination: every citation
            is validated against the corpus before save.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void openPromptEditor()}
            className="rounded-none text-xs uppercase tracking-widest"
          >
            <PenLine className="w-3.5 h-3.5" /> Edit prompt
          </Button>
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-none text-xs uppercase tracking-widest"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {promptOpen && (
        <div className="border border-foreground/30 bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/15">
            <div>
              <div className="section-label">System prompt</div>
              <div className="text-xs text-muted-foreground font-light mt-1">
                Shared rules + per-mode framing. At run time the system prompt is{" "}
                <code className="text-[11px]">base + addendum-for-this-mode</code>.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPromptOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          {promptLoading || !promptSlots ? (
            <div className="p-6 text-xs text-muted-foreground">Loading…</div>
          ) : (
            (() => {
              const slotState = stateForSlot(promptSlots, activeSlot);
              const draft = drafts[activeSlot];
              const limits = PROMPT_LIMITS[activeSlot];
              const tab = PROMPT_SLOT_TABS.find((t) => t.id === activeSlot)!;
              const dirty = draft !== slotState.value;
              const tooShort = draft.length < limits.min;
              const tooLong = draft.length > limits.max;
              return (
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-1 border-b border-foreground/10 -mx-4 px-4 pb-0">
                    {PROMPT_SLOT_TABS.map((t) => {
                      const ts = stateForSlot(promptSlots, t.id);
                      const isActive = t.id === activeSlot;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setActiveSlot(t.id)}
                          className={`px-3 py-2 text-[11px] uppercase tracking-widest border-b-2 -mb-px transition-colors ${
                            isActive
                              ? "border-foreground text-foreground"
                              : "border-transparent text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {t.label}
                          {ts.isCustom && (
                            <span className="ml-1.5 text-primary" title="Custom value saved">
                              ●
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-xs text-muted-foreground font-light">
                    {tab.helper}{" "}
                    <span className={slotState.isCustom ? "text-primary" : ""}>
                      {slotState.isCustom ? "Custom value saved." : "Using built-in default."}
                    </span>
                  </div>
                  <textarea
                    value={draft}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [activeSlot]: e.target.value }))
                    }
                    spellCheck={false}
                    rows={activeSlot === "base" ? 20 : 8}
                    className="w-full bg-background border border-foreground/15 px-3 py-3 text-xs font-mono leading-relaxed outline-none focus:border-primary/80 resize-y"
                  />
                  <div className="flex items-center justify-between text-xs">
                    <div className="text-muted-foreground">
                      {draft.length.toLocaleString()} chars
                      {tooShort && (
                        <span className="text-red-400 ml-2">— too short (min {limits.min})</span>
                      )}
                      {tooLong && (
                        <span className="text-red-400 ml-2">— too long (max {limits.max.toLocaleString()})</span>
                      )}
                      {!tooShort && !tooLong && dirty && (
                        <span className="text-amber-400 ml-2">— unsaved changes</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() => void resetPromptSlot(activeSlot)}
                        disabled={promptSaving || !slotState.isCustom}
                        className="rounded-none text-[10px] uppercase tracking-widest"
                      >
                        Reset to default
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          setDrafts((d) => ({ ...d, [activeSlot]: slotState.default }))
                        }
                        disabled={promptSaving}
                        className="rounded-none text-[10px] uppercase tracking-widest"
                      >
                        Load default into editor
                      </Button>
                      <Button
                        onClick={() => void savePromptSlot(activeSlot)}
                        disabled={promptSaving || tooShort || tooLong || !dirty}
                        className="rounded-none text-[10px] uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90"
                      >
                        {promptSaving ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  </div>
                  {promptStatus && (
                    <div
                      className={`text-xs ${
                        promptStatus.ok ? "text-primary" : "text-red-400"
                      }`}
                    >
                      {promptStatus.message}
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground font-light leading-relaxed pt-2 border-t border-foreground/10">
                    Saved prompts take effect on the next writer run. Anti-hallucination is enforced
                    in code regardless of prompt — the citation validator rejects drafts that
                    reference URLs not in the corpus, so even if you remove the rules from the
                    prompt, fabricated citations still won't be saved.
                  </p>
                </div>
              );
            })()
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {agents && agents.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(() => {
            const a = agents[0];
            const avgCost =
              a.postCount > 0
                ? Number(a.totalCostUsd) / a.postCount
                : 0;
            const avgTokens = a.postCount > 0 ? a.totalTokens / a.postCount : 0;
            return (
              <>
                <div className="border border-foreground/15 bg-card px-4 py-3">
                  <div className="section-label text-[10px]">Total spent</div>
                  <div className="text-xl font-serif mt-1">
                    {formatUsd(a.totalCostUsd)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    over {a.postCount} {a.postCount === 1 ? "post" : "posts"}
                  </div>
                </div>
                <div className="border border-foreground/15 bg-card px-4 py-3">
                  <div className="section-label text-[10px]">Avg cost / post</div>
                  <div className="text-xl font-serif mt-1">{formatUsd(avgCost)}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">running average</div>
                </div>
                <div className="border border-foreground/15 bg-card px-4 py-3">
                  <div className="section-label text-[10px]">Total tokens</div>
                  <div className="text-xl font-serif mt-1">
                    {formatTokens(a.totalTokens)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {formatTokens(a.totalPromptTokens)} in · {formatTokens(a.totalCompletionTokens)} out
                  </div>
                </div>
                <div className="border border-foreground/15 bg-card px-4 py-3">
                  <div className="section-label text-[10px]">Avg tokens / post</div>
                  <div className="text-xl font-serif mt-1">
                    {formatTokens(Math.round(avgTokens))}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    in + out combined
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {lastRun && (
        <div
          className={`border p-3 text-xs font-sans ${
            lastRun.ok ? "border-primary/40 text-primary" : "border-red-400/40 text-red-400"
          }`}
        >
          {lastRun.message}
        </div>
      )}

      <div className="border border-foreground/15 bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left bg-background/40">
            <tr className="border-b border-foreground/10">
              <th className="px-4 py-3 section-label">Agent</th>
              <th className="px-4 py-3 section-label">Model</th>
              <th className="px-4 py-3 section-label">Status</th>
              <th className="px-4 py-3 section-label">Posts</th>
              <th className="px-4 py-3 section-label">Latest</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {agents?.map((a) => (
              <tr key={a.id} className="border-b border-foreground/10 hover:bg-background/40">
                <td className="px-4 py-3">
                  <div>{a.displayName}</div>
                  <div className="text-[11px] text-muted-foreground font-light max-w-md">
                    {a.description}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                  <div>{a.model}</div>
                  <div className="text-[10px] opacity-70 truncate max-w-[200px]">{a.baseUrl}</div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[10px] uppercase tracking-widest px-2 py-1 border ${
                      a.enabled
                        ? "border-primary/40 text-primary"
                        : "border-foreground/20 text-muted-foreground"
                    }`}
                  >
                    {a.configured ? (a.enabled ? "Enabled" : "Disabled") : "Needs API key"}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{a.postCount}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {formatDate(a.latestPublishedAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-2 items-center">
                    <select
                      value={runMode}
                      onChange={(e) => setRunMode(e.target.value as WriterModeId)}
                      disabled={!a.configured || busyId !== null}
                      className="h-8 px-2 bg-background border border-foreground/15 text-[10px] uppercase tracking-widest outline-none focus:border-primary/80 disabled:opacity-50"
                    >
                      {WRITER_MODES.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!a.configured || busyId !== null}
                      onClick={() => void runOne(a.id)}
                      className="rounded-none text-[10px] uppercase tracking-widest"
                    >
                      <Play className="w-3 h-3" />
                      {busyId === a.id ? "…" : "Run"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {agents && agents.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">
                  No writer agents configured.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div>
        <div className="section-label mb-3">Recent posts ({posts?.length ?? 0})</div>
        <div className="border border-foreground/15 bg-card divide-y divide-foreground/10">
          {posts?.map((p) => (
            <div key={p.id} className="px-4 py-4">
              <button
                type="button"
                onClick={() => setExpandedPostId((id) => (id === p.id ? null : p.id))}
                className="w-full text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground font-mono mb-1">
                      {formatDate(p.publishedAt)} · {p.mode} · {p.tag} ·{" "}
                      {p.citations.length} citations
                    </div>
                    <div className="text-base font-serif">{p.title}</div>
                    <div className="text-xs text-muted-foreground font-light mt-1 line-clamp-2">
                      {p.dek}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono">{formatUsd(p.costUsd)}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      {formatTokens(p.totalTokens)} tok
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 text-muted-foreground mt-1 ml-auto transition-transform ${
                        expandedPostId === p.id ? "rotate-90" : ""
                      }`}
                    />
                  </div>
                </div>
              </button>
              {expandedPostId === p.id && (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                    <div>
                      <div className="text-[10px] section-label">Cost</div>
                      <div className="text-sm font-mono mt-1">{formatUsd(p.costUsd)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] section-label">Total tokens</div>
                      <div className="text-sm font-mono mt-1">
                        {formatTokens(p.totalTokens)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] section-label">Prompt</div>
                      <div className="text-sm font-mono mt-1">
                        {formatTokens(p.promptTokens)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] section-label">Completion</div>
                      <div className="text-sm font-mono mt-1">
                        {formatTokens(p.completionTokens)}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs section-label">Body</div>
                  <pre className="whitespace-pre-wrap text-sm font-light text-foreground/90 leading-relaxed">
                    {p.bodyMarkdown}
                  </pre>
                  <div>
                    <div className="text-xs section-label mb-2">Citations</div>
                    <ul className="text-xs space-y-1">
                      {p.citations.map((url) => (
                        <li key={url}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 break-all"
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span>{url}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          ))}
          {posts && posts.length === 0 && (
            <div className="px-4 py-10 text-center text-muted-foreground text-sm">
              No posts yet. Hit Run to generate one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const JudgeTab = ({ token }: { token: string }) => {
  const [spec, setSpec] = useState<JudgeSpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rescoring, setRescoring] = useState(false);
  const [rescoreStatus, setRescoreStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const [promptOpen, setPromptOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState<string>("");
  const [promptIsCustom, setPromptIsCustom] = useState(false);
  const [promptDefault, setPromptDefault] = useState<string>("");
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptStatus, setPromptStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(token, "/admin/judge/spec");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSpec((await res.json()) as JudgeSpec);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load judge spec");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const openPromptEditor = async () => {
    setPromptOpen(true);
    setPromptStatus(null);
    setPromptLoading(true);
    try {
      const res = await apiFetch(token, "/admin/judge/prompt");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { prompt: string; isCustom: boolean; defaultPrompt: string };
      setPromptDraft(json.prompt);
      setPromptIsCustom(json.isCustom);
      setPromptDefault(json.defaultPrompt);
    } catch (err) {
      setPromptStatus({ ok: false, message: err instanceof Error ? err.message : "Failed to load prompt" });
    } finally {
      setPromptLoading(false);
    }
  };

  const savePrompt = async () => {
    setPromptSaving(true);
    setPromptStatus(null);
    try {
      const res = await apiFetch(token, "/admin/judge/prompt", {
        method: "PUT",
        body: JSON.stringify({ prompt: promptDraft }),
      });
      const json = (await res.json()) as { error?: string };
      if (res.ok) {
        setPromptIsCustom(true);
        setPromptStatus({ ok: true, message: "Prompt saved. Next rescore will use it." });
      } else {
        setPromptStatus({ ok: false, message: json.error ?? `HTTP ${res.status}` });
      }
    } catch (err) {
      setPromptStatus({ ok: false, message: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setPromptSaving(false);
    }
  };

  const resetPromptToDefault = async () => {
    if (!confirm("Reset to the built-in default judge prompt?")) return;
    setPromptSaving(true);
    setPromptStatus(null);
    try {
      const res = await apiFetch(token, "/admin/judge/prompt", { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPromptDraft(promptDefault);
      setPromptIsCustom(false);
      setPromptStatus({ ok: true, message: "Reset to default." });
    } catch (err) {
      setPromptStatus({ ok: false, message: err instanceof Error ? err.message : "Reset failed" });
    } finally {
      setPromptSaving(false);
    }
  };

  const rescore = async () => {
    if (!confirm("Clear scores in the lookback window and re-judge with the current prompt? This makes ~6 LLM calls.")) return;
    setRescoring(true);
    setRescoreStatus(null);
    try {
      const res = await apiFetch(token, "/admin/judge/rescore", { method: "POST" });
      const json = (await res.json()) as { cleared?: { cleared: number }; summary?: { scored: number; batches: number; errors: number } };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const cleared = json.cleared?.cleared ?? 0;
      const scored = json.summary?.scored ?? 0;
      const errors = json.summary?.errors ?? 0;
      setRescoreStatus({
        ok: errors === 0,
        message: `Cleared ${cleared}, scored ${scored}${errors > 0 ? `, ${errors} batch errors` : ""}.`,
      });
      await load();
    } catch (err) {
      setRescoreStatus({ ok: false, message: err instanceof Error ? err.message : "Rescore failed" });
    } finally {
      setRescoring(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif">Headline judge</h2>
          <p className="text-sm text-muted-foreground font-light mt-1">
            The LLM that scores each headline 0–100 plus the deterministic algorithm that turns
            scored items into the top-10 dispatch. Edit the prompt to change what the judge calls
            "relevant"; tune the scoring constants in code.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void openPromptEditor()}
            className="rounded-none text-xs uppercase tracking-widest"
          >
            <PenLine className="w-3.5 h-3.5" /> Edit prompt
          </Button>
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-none text-xs uppercase tracking-widest"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button
            onClick={() => void rescore()}
            disabled={rescoring || !spec?.judge.configured}
            className="rounded-none text-xs uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90"
          >
            <Play className="w-3.5 h-3.5" />
            {rescoring ? "Rescoring…" : "Rescore lookback"}
          </Button>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {rescoreStatus && (
        <div className={`border p-3 text-xs ${rescoreStatus.ok ? "border-primary/40 text-primary" : "border-red-400/40 text-red-400"}`}>
          {rescoreStatus.message}
        </div>
      )}

      {promptOpen && (
        <div className="border border-foreground/30 bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/15">
            <div>
              <div className="section-label">Judge system prompt</div>
              <div className="text-xs text-muted-foreground font-light mt-1">
                Controls how the judge classifies and scores each headline.{" "}
                <span className={promptIsCustom ? "text-primary" : ""}>
                  {promptIsCustom ? "Using custom prompt." : "Using built-in default."}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPromptOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          {promptLoading ? (
            <div className="p-6 text-xs text-muted-foreground">Loading…</div>
          ) : (
            <div className="p-4 space-y-3">
              <textarea
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                spellCheck={false}
                rows={20}
                className="w-full bg-background border border-foreground/15 px-3 py-3 text-xs font-mono leading-relaxed outline-none focus:border-primary/80 resize-y"
              />
              <div className="flex items-center justify-between text-xs">
                <div className="text-muted-foreground">
                  {promptDraft.length.toLocaleString()} chars
                  {promptDraft.length < 200 && (
                    <span className="text-red-400 ml-2">— too short (min 200)</span>
                  )}
                  {promptDraft.length > 20_000 && (
                    <span className="text-red-400 ml-2">— too long (max 20,000)</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void resetPromptToDefault()}
                    disabled={promptSaving || !promptIsCustom}
                    className="rounded-none text-[10px] uppercase tracking-widest"
                  >
                    Reset to default
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setPromptDraft(promptDefault)}
                    disabled={promptSaving}
                    className="rounded-none text-[10px] uppercase tracking-widest"
                  >
                    Load default into editor
                  </Button>
                  <Button
                    onClick={() => void savePrompt()}
                    disabled={promptSaving || promptDraft.length < 200 || promptDraft.length > 20_000}
                    className="rounded-none text-[10px] uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90"
                  >
                    {promptSaving ? "Saving…" : "Save prompt"}
                  </Button>
                </div>
              </div>
              {promptStatus && (
                <div className={`text-xs ${promptStatus.ok ? "text-primary" : "text-red-400"}`}>
                  {promptStatus.message}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {spec && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-foreground/15 bg-card p-4 space-y-3">
              <div className="section-label">How items are scored</div>
              <dl className="text-sm grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
                <dt className="text-muted-foreground">Model</dt>
                <dd className="font-mono text-xs break-all">{spec.judge.model}</dd>
                <dt className="text-muted-foreground">Base URL</dt>
                <dd className="font-mono text-xs break-all">{spec.judge.baseUrl}</dd>
                <dt className="text-muted-foreground">API key</dt>
                <dd>{spec.judge.configured ? "Configured" : <span className="text-red-400">Missing</span>}</dd>
                <dt className="text-muted-foreground">Lookback</dt>
                <dd>{spec.judge.judgeLookbackDays} days</dd>
                <dt className="text-muted-foreground">Batch size</dt>
                <dd>{spec.judge.batchSize}</dd>
                <dt className="text-muted-foreground">Streak break</dt>
                <dd>{spec.judge.errorStreakBreak} consecutive errors</dd>
                <dt className="text-muted-foreground">Top gate</dt>
                <dd>relevance ≥ {spec.judge.minTopRelevanceScore}</dd>
              </dl>
            </div>

            <div className="border border-foreground/15 bg-card p-4 space-y-3">
              <div className="section-label">How top-10 is picked</div>
              <dl className="text-sm grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
                <dt className="text-muted-foreground">Window</dt>
                <dd>last {spec.topSelection.defaultDays} days, {spec.topSelection.defaultLimit} items</dd>
                <dt className="text-muted-foreground">Per-source cap</dt>
                <dd>{spec.topSelection.perSourceCap}</dd>
                <dt className="text-muted-foreground">Tier weights</dt>
                <dd className="font-mono text-xs">
                  {Object.entries(spec.topSelection.tierWeights).map(([tier, w]) => `T${tier}=${w}`).join(" · ")}
                </dd>
                <dt className="text-muted-foreground">Recency half-life</dt>
                <dd>{spec.topSelection.halfLifeDays} days</dd>
                <dt className="text-muted-foreground">Dedupe threshold</dt>
                <dd>Jaccard ≥ {spec.topSelection.dedupeThreshold}</dd>
                <dt className="text-muted-foreground">Reserved papers</dt>
                <dd>min {spec.topSelection.minPapers} slots</dd>
                <dt className="text-muted-foreground">Broad-press filter</dt>
                <dd>
                  {spec.topSelection.broadPressRequiresOrg
                    ? "Broad-press items dropped unless they anchor on an org entity (judged or not)"
                    : "Disabled"}
                </dd>
                <dt className="text-muted-foreground">Commentary required</dt>
                <dd>
                  {spec.topSelection.requiresCommentary
                    ? "Top items must have a generated brief; uncommented rows are skipped"
                    : "Disabled"}
                </dd>
              </dl>
            </div>
          </div>

          <div className="border border-foreground/15 bg-card p-4 space-y-3">
            <div className="section-label">Last run</div>
            {spec.lastRun ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-[10px] section-label">Finished</div>
                  <div className="text-xs font-mono mt-1">{formatDate(spec.lastRun.finishedAt)}</div>
                </div>
                <div>
                  <div className="text-[10px] section-label">Candidates</div>
                  <div className="text-xs font-mono mt-1">{spec.lastRun.summary.candidates}</div>
                </div>
                <div>
                  <div className="text-[10px] section-label">Scored</div>
                  <div className="text-xs font-mono mt-1">{spec.lastRun.summary.scored}</div>
                </div>
                <div>
                  <div className="text-[10px] section-label">Errors</div>
                  <div className="text-xs font-mono mt-1">
                    {spec.lastRun.summary.errors > 0 ? (
                      <span className="text-red-400">{spec.lastRun.summary.errors}</span>
                    ) : (
                      "0"
                    )}
                  </div>
                </div>
                {spec.lastRun.lastError && (
                  <div className="col-span-2 sm:col-span-4">
                    <div className="text-[10px] section-label">Last error</div>
                    <div className="text-xs font-mono mt-1 text-red-400 break-all">{spec.lastRun.lastError}</div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No runs yet.</p>
            )}
            <div className="text-xs text-muted-foreground pt-3 border-t border-foreground/10">
              Lookback corpus: {spec.stats.scored.toLocaleString()} scored, {spec.stats.unscored.toLocaleString()} unscored ({spec.stats.total.toLocaleString()} total in window).
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="border border-foreground/15 bg-card">
              <div className="px-4 py-3 border-b border-foreground/10">
                <div className="section-label">Highest scored ({spec.stats.highest.length})</div>
              </div>
              <ul className="divide-y divide-foreground/10">
                {spec.stats.highest.map((h) => (
                  <li key={h.id} className="px-4 py-3 flex gap-3 items-start">
                    <span className="font-mono text-xs text-primary w-9 shrink-0">{h.relevanceScore}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm">{h.title}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{h.source}</div>
                    </div>
                  </li>
                ))}
                {spec.stats.highest.length === 0 && (
                  <li className="px-4 py-6 text-center text-xs text-muted-foreground">No scored items yet.</li>
                )}
              </ul>
            </div>

            <div className="border border-foreground/15 bg-card">
              <div className="px-4 py-3 border-b border-foreground/10">
                <div className="section-label">Lowest scored ({spec.stats.lowest.length})</div>
              </div>
              <ul className="divide-y divide-foreground/10">
                {spec.stats.lowest.map((h) => (
                  <li key={h.id} className="px-4 py-3 flex gap-3 items-start">
                    <span className="font-mono text-xs text-muted-foreground w-9 shrink-0">{h.relevanceScore}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm">{h.title}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{h.source}</div>
                    </div>
                  </li>
                ))}
                {spec.stats.lowest.length === 0 && (
                  <li className="px-4 py-6 text-center text-xs text-muted-foreground">No scored items yet.</li>
                )}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const EmailAgentsTab = ({ token }: { token: string }) => {
  const [state, setState] = useState<DigestState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [runResults, setRunResults] = useState<DigestRunResult["results"] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<DigestPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<DigestTestSendResult | null>(null);

  // Banner-image prompt editor state
  const [bannerPromptOpen, setBannerPromptOpen] = useState(false);
  const [bannerPromptDraft, setBannerPromptDraft] = useState<string>("");
  const [bannerPromptIsCustom, setBannerPromptIsCustom] = useState(false);
  const [bannerPromptDefault, setBannerPromptDefault] = useState<string>("");
  const [bannerPromptLoading, setBannerPromptLoading] = useState(false);
  const [bannerPromptSaving, setBannerPromptSaving] = useState(false);
  const [bannerPromptStatus, setBannerPromptStatus] =
    useState<{ ok: boolean; message: string } | null>(null);

  const openBannerPromptEditor = async () => {
    setBannerPromptOpen(true);
    setBannerPromptStatus(null);
    setBannerPromptLoading(true);
    try {
      const res = await apiFetch(token, "/admin/email/banner-prompt");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        template: string;
        isCustom: boolean;
        defaultTemplate: string;
      };
      setBannerPromptDraft(json.template);
      setBannerPromptIsCustom(json.isCustom);
      setBannerPromptDefault(json.defaultTemplate);
    } catch (err) {
      setBannerPromptStatus({
        ok: false,
        message: err instanceof Error ? err.message : "Failed to load template",
      });
    } finally {
      setBannerPromptLoading(false);
    }
  };

  const saveBannerPrompt = async () => {
    setBannerPromptSaving(true);
    setBannerPromptStatus(null);
    try {
      const res = await apiFetch(token, "/admin/email/banner-prompt", {
        method: "PUT",
        body: JSON.stringify({ template: bannerPromptDraft }),
      });
      const json = (await res.json()) as { error?: string };
      if (res.ok) {
        setBannerPromptIsCustom(true);
        setBannerPromptStatus({ ok: true, message: "Template saved. Next send will use it." });
      } else {
        setBannerPromptStatus({ ok: false, message: json.error ?? `HTTP ${res.status}` });
      }
    } catch (err) {
      setBannerPromptStatus({
        ok: false,
        message: err instanceof Error ? err.message : "Save failed",
      });
    } finally {
      setBannerPromptSaving(false);
    }
  };

  const resetBannerPrompt = async () => {
    if (!confirm("Reset banner prompt to the built-in default? Your custom edits will be deleted.")) return;
    setBannerPromptSaving(true);
    setBannerPromptStatus(null);
    try {
      const res = await apiFetch(token, "/admin/email/banner-prompt", { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setBannerPromptDraft(bannerPromptDefault);
      setBannerPromptIsCustom(false);
      setBannerPromptStatus({ ok: true, message: "Reset to default." });
    } catch (err) {
      setBannerPromptStatus({
        ok: false,
        message: err instanceof Error ? err.message : "Reset failed",
      });
    } finally {
      setBannerPromptSaving(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(token, "/admin/digest/state");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setState((await res.json()) as DigestState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load digest state");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const sendNow = async () => {
    if (!confirm(`Send the daily top-10 email to ${state?.activeSubscribers ?? "?"} subscribers right now?`)) return;
    setSending(true);
    setSendResult(null);
    setRunResults(null);
    try {
      const res = await apiFetch(token, "/admin/digest/run", { method: "POST" });
      const json = (await res.json()) as DigestRunResult;
      if (json.sent === null) {
        setSendResult({ ok: true, message: json.reason ?? "No-op." });
      } else {
        setSendResult({
          ok: (json.failed ?? 0) === 0,
          message: `Sent "${json.subject}" to ${json.sent} (failed ${json.failed ?? 0}). Banner ${json.bannerGenerated ? "generated" : "skipped"}, polish ${json.polishApplied ? "applied" : "skipped"}.`,
        });
        setRunResults(json.results ?? null);
      }
      await load();
    } catch (err) {
      setSendResult({ ok: false, message: err instanceof Error ? err.message : "Send failed" });
    } finally {
      setSending(false);
    }
  };

  const sendTest = async () => {
    const to = testEmail.trim();
    if (!to) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await apiFetch(token, "/admin/digest/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const json = (await res.json()) as DigestTestSendResult;
      setTestResult(json);
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : "Test send failed" });
    } finally {
      setTestSending(false);
    }
  };

  const openPreview = async () => {
    setPreviewing(true);
    setPreviewError(null);
    setPreview(null);
    try {
      const res = await apiFetch(token, "/admin/digest/preview");
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setPreview((await res.json()) as DigestPreview);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  };

  const cfg = state?.config;
  const ready = Boolean(cfg?.ready);
  const statusLabel = !cfg
    ? "Loading…"
    : ready
      ? state?.alreadySentToday
        ? "Sent today"
        : "Ready"
      : "Needs config";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif">Email agents</h2>
          <p className="text-sm text-muted-foreground font-light mt-1">
            One agent: the daily top-10 dispatch. Pulls the same top-10 the website serves,
            generates a banner image, and runs an LLM polish pass over the subject and intro
            before sending via Resend.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void openBannerPromptEditor()}
            className="rounded-none text-xs uppercase tracking-widest"
          >
            <PenLine className="w-3.5 h-3.5" /> Edit banner prompt
          </Button>
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-none text-xs uppercase tracking-widest"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {bannerPromptOpen && (
        <div className="border border-foreground/30 bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/15">
            <div>
              <div className="section-label">Banner image prompt</div>
              <div className="text-xs text-muted-foreground font-light mt-1">
                Sent to Venice's image endpoint to generate the email banner. Use{" "}
                <code className="font-mono">{`{{stories}}`}</code> as a placeholder for the
                day's top three headlines.{" "}
                <span className={bannerPromptIsCustom ? "text-primary" : ""}>
                  {bannerPromptIsCustom ? "Using custom template." : "Using built-in default."}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setBannerPromptOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          {bannerPromptLoading ? (
            <div className="p-6 text-xs text-muted-foreground">Loading…</div>
          ) : (
            <div className="p-4 space-y-3">
              <textarea
                value={bannerPromptDraft}
                onChange={(e) => setBannerPromptDraft(e.target.value)}
                spellCheck={false}
                rows={8}
                className="w-full bg-background border border-foreground/15 px-3 py-3 text-xs font-mono leading-relaxed outline-none focus:border-primary/80 resize-y"
              />
              <div className="flex items-center justify-between text-xs">
                <div className="text-muted-foreground">
                  {bannerPromptDraft.length.toLocaleString()} chars
                  {bannerPromptDraft.length < 20 && (
                    <span className="text-red-400 ml-2">— too short (min 20)</span>
                  )}
                  {bannerPromptDraft.length > 4000 && (
                    <span className="text-red-400 ml-2">— too long (max 4,000)</span>
                  )}
                  {bannerPromptDraft.length >= 20 &&
                    !bannerPromptDraft.includes("{{stories}}") && (
                      <span className="text-amber-400 ml-2">
                        — no <code className="font-mono">{`{{stories}}`}</code> placeholder; the
                        prompt will be sent verbatim regardless of the day's headlines
                      </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void resetBannerPrompt()}
                    disabled={bannerPromptSaving || !bannerPromptIsCustom}
                    className="rounded-none text-[10px] uppercase tracking-widest"
                  >
                    Reset to default
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setBannerPromptDraft(bannerPromptDefault)}
                    disabled={bannerPromptSaving}
                    className="rounded-none text-[10px] uppercase tracking-widest"
                  >
                    Load default into editor
                  </Button>
                  <Button
                    onClick={() => void saveBannerPrompt()}
                    disabled={
                      bannerPromptSaving ||
                      bannerPromptDraft.length < 20 ||
                      bannerPromptDraft.length > 4000
                    }
                    className="rounded-none text-[10px] uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90"
                  >
                    {bannerPromptSaving ? "Saving…" : "Save template"}
                  </Button>
                </div>
              </div>
              {bannerPromptStatus && (
                <div
                  className={`text-xs ${
                    bannerPromptStatus.ok ? "text-primary" : "text-red-400"
                  }`}
                >
                  {bannerPromptStatus.message}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground font-light leading-relaxed pt-2 border-t border-foreground/10">
                Saved templates take effect on the next email send (manual run or scheduled).
                The Preview button re-runs image generation.
              </p>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {state && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="border border-foreground/15 bg-card px-4 py-3">
            <div className="section-label text-[10px]">Subscribers</div>
            <div className="text-xl font-serif mt-1">{state.activeSubscribers}</div>
            <div className="text-[10px] text-muted-foreground mt-1">active</div>
          </div>
          <div className="border border-foreground/15 bg-card px-4 py-3">
            <div className="section-label text-[10px]">Top candidates</div>
            <div className="text-xl font-serif mt-1">{state.topCandidateCount}</div>
            <div className="text-[10px] text-muted-foreground mt-1">in last 24h</div>
          </div>
          <div className="border border-foreground/15 bg-card px-4 py-3">
            <div className="section-label text-[10px]">Schedule</div>
            <div className="text-xl font-serif mt-1">
              {cfg ? `${String(cfg.hourPt).padStart(2, "0")}:${String(cfg.minutePt).padStart(2, "0")}` : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">{cfg?.timezone ?? ""}</div>
          </div>
          <div className="border border-foreground/15 bg-card px-4 py-3">
            <div className="section-label text-[10px]">Last sent</div>
            <div className="text-xl font-serif mt-1">{state.lastSentPtDate ?? "—"}</div>
            <div className="text-[10px] text-muted-foreground mt-1">PT date</div>
          </div>
        </div>
      )}

      {sendResult && (
        <div className={`border p-3 text-xs ${sendResult.ok ? "border-primary/40 text-primary" : "border-red-400/40 text-red-400"}`}>
          {sendResult.message}
        </div>
      )}

      {runResults && runResults.length > 0 && (
        <div className="border border-foreground/15 bg-card">
          <div className="px-4 py-2 border-b border-foreground/10 section-label text-[10px]">
            Per-recipient results
          </div>
          <div className="max-h-64 overflow-y-auto text-xs font-mono">
            {runResults.map((r) => (
              <div
                key={r.recipient}
                className="flex items-start gap-3 px-4 py-1.5 border-b border-foreground/5 last:border-b-0"
              >
                <span className={r.ok ? "text-primary" : "text-red-400"}>
                  {r.ok ? "✓" : "✗"}
                </span>
                <span className="flex-1 break-all">{r.recipient}</span>
                {!r.ok && r.error && (
                  <span className="text-red-400 truncate" title={r.error}>{r.error}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border border-foreground/15 bg-card p-4">
        <div className="section-label text-[10px] mb-2">Send a test to me</div>
        <p className="text-xs text-muted-foreground font-light mb-3 max-w-xl">
          Sends today's composed top-10 to one address only. Bypasses the
          subscribers table and the once-per-day lock — useful for verifying
          deliverability without disturbing the scheduled run. Subject is
          prefixed with <code className="font-mono">[TEST]</code>.
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={testSending}
            className="flex-1 min-w-[240px] bg-background border border-foreground/20 px-3 py-2 text-xs font-mono focus:outline-none focus:border-foreground/50"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!ready || testSending || !testEmail.trim()}
            onClick={() => void sendTest()}
            className="rounded-none text-[10px] uppercase tracking-widest"
          >
            <Send className="w-3 h-3" /> {testSending ? "Sending…" : "Send test"}
          </Button>
        </div>
        {testResult && (
          <div
            className={`mt-3 border p-3 text-xs space-y-1 ${testResult.ok ? "border-primary/40 text-primary" : "border-red-400/40 text-red-400"}`}
          >
            {testResult.ok ? (
              <>
                <div>
                  Sent "{testResult.subject}" to {testResult.recipient}. Banner {testResult.bannerGenerated ? "generated" : "skipped"}, polish {testResult.polishApplied ? "applied" : "skipped"}.
                </div>
                <div className="font-mono text-[10px] text-foreground/70">
                  Polish: {testResult.diagnostics.polishStatus}
                  {testResult.diagnostics.polishError ? ` (${testResult.diagnostics.polishError.slice(0, 200)})` : ""}
                  {" · "}commentary {testResult.diagnostics.finalCommentaryCount}/{testResult.diagnostics.headlineCount}
                  {" "}(polish {testResult.diagnostics.polishCommentaryCount}, fallback {testResult.diagnostics.fallbackCommentaryCount})
                  {testResult.diagnostics.fallbackError ? ` · fallback err: ${testResult.diagnostics.fallbackError.slice(0, 100)}` : ""}
                </div>
              </>
            ) : (
              <div>
                Test send failed{testResult.recipient ? ` for ${testResult.recipient}` : ""}: {testResult.error}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border border-foreground/15 bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left bg-background/40">
            <tr className="border-b border-foreground/10">
              <th className="px-4 py-3 section-label">Agent</th>
              <th className="px-4 py-3 section-label">Pipeline</th>
              <th className="px-4 py-3 section-label">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-foreground/10 hover:bg-background/40">
              <td className="px-4 py-3">
                <div>Daily top-10 dispatch</div>
                <div className="text-[11px] text-muted-foreground font-light max-w-md">
                  Top-10 select → image gen → LLM polish (subject + intro + commentary edits) → Resend send
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground text-xs space-y-0.5">
                <div>Resend: {cfg?.hasResendKey ? "✓" : <span className="text-red-400">missing key</span>}</div>
                <div>From: {cfg?.hasFromEmail ? "✓" : <span className="text-red-400">missing</span>}</div>
                <div>LLM: {cfg?.hasLlmKey ? "✓ (image + polish)" : <span className="text-amber-400">disabled — fallback subject/intro, no banner</span>}</div>
              </td>
              <td className="px-4 py-3">
                <span className={`text-[10px] uppercase tracking-widest px-2 py-1 border ${ready ? "border-primary/40 text-primary" : "border-red-400/40 text-red-400"}`}>
                  {statusLabel}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="inline-flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!ready || previewing}
                    onClick={() => void openPreview()}
                    className="rounded-none text-[10px] uppercase tracking-widest"
                  >
                    <Eye className="w-3 h-3" /> {previewing ? "…" : "Preview"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!ready || sending}
                    onClick={() => void sendNow()}
                    className="rounded-none text-[10px] uppercase tracking-widest"
                  >
                    <Send className="w-3 h-3" /> {sending ? "Sending…" : "Send now"}
                  </Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {(preview || previewError) && (
        <div className="border border-foreground/30 bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/15">
            <div>
              <div className="section-label">Email preview</div>
              {preview && (
                <div className="text-xs text-muted-foreground font-light mt-1">
                  Subject: <span className="text-foreground">{preview.subject}</span> &middot;{" "}
                  {preview.headlineCount} items &middot; banner {preview.bannerGenerated ? "generated" : "skipped"} &middot;{" "}
                  polish {preview.polishApplied ? "applied" : "skipped"}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => { setPreview(null); setPreviewError(null); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          {previewError && <div className="p-4 text-xs text-red-400">{previewError}</div>}
          {preview && (
            <iframe
              title="Email preview"
              srcDoc={preview.html}
              className="w-full bg-white"
              style={{ height: "720px", border: "0" }}
            />
          )}
        </div>
      )}
    </div>
  );
};

type DispatchArchiveItemSnapshot = {
  id: number;
  source: string;
  title: string;
  url: string;
  commentary: string | null;
  publishedAt: string;
};

type DispatchEvalDimension = { score: number; note: string };

type DispatchEvalScores = {
  introSpecificity: DispatchEvalDimension;
  lensDiversity: DispatchEvalDimension;
  cadenceVariety: DispatchEvalDimension;
  sourceTiering: DispatchEvalDimension;
  concreteness: DispatchEvalDimension;
};

type DispatchBannedPhraseHit = {
  phrase: string;
  count: number;
  locations: string[];
  /** "violation" = sentence-shape or LLM-tic phrase (drives the headline
   *  violations count). "warning" = bare-word ban (tracked but not counted).
   *  Optional for back-compat with rows scanned before the severity split —
   *  those are treated as "violation". */
  severity?: "violation" | "warning";
};

type DispatchArchiveSummary = {
  id: number;
  kind: string;
  subject: string;
  introHtml: string;
  recipientCount: number | null;
  polishApplied: boolean;
  bannerGenerated: boolean;
  feedback: string | null;
  feedbackUpdatedAt: string | null;
  evalScores: DispatchEvalScores | null;
  evalCompositeScore: string | number | null;
  evalBannedPhrasesCount: number | null;
  evalBannedPhrases: DispatchBannedPhraseHit[] | null;
  evalModel: string | null;
  evalRunAt: string | null;
  promptVersions: DispatchPromptVersionMap | null;
  createdAt: string;
  itemCount: number;
};

type DispatchPromptSlot = "polish" | "fallback" | "commentator" | "banner";

type DispatchPromptVersionMap = Partial<Record<DispatchPromptSlot, string>>;

type DispatchPromptSummary = {
  hash: string;
  slot: DispatchPromptSlot;
  contentLength: number;
  note: string | null;
  firstSeenAt: string;
  usageCount: number;
};

type DispatchPromptDetail = DispatchPromptSummary & {
  content: string;
};

type DispatchLlmCall = {
  id: number;
  dispatchArchiveId: number | null;
  kind: "polish" | "fallback" | "commentator";
  promptHash: string;
  userMessage: string;
  responseText: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  latencyMs: number | null;
  status: "ok" | "request_failed" | "parse_failed" | "missing_subject_or_intro";
  errorMessage: string | null;
  createdAt: string;
};

const PROMPT_SLOTS: { id: DispatchPromptSlot; label: string }[] = [
  { id: "polish", label: "Polish" },
  { id: "fallback", label: "Fallback" },
  { id: "commentator", label: "Commentator" },
  { id: "banner", label: "Banner" },
];

type DispatchArchiveDetail = DispatchArchiveSummary & {
  bodyHtml: string;
  headlinesSnapshot: DispatchArchiveItemSnapshot[];
};

const RUBRIC_LABELS: Record<keyof DispatchEvalScores, string> = {
  introSpecificity: "Intro specificity",
  lensDiversity: "Lens diversity",
  cadenceVariety: "Cadence variety",
  sourceTiering: "Source tiering",
  concreteness: "Concreteness",
};

const compositeNumber = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const scoreColor = (score: number | null): string => {
  if (score === null) return "text-muted-foreground";
  if (score >= 7) return "text-emerald-400";
  if (score >= 5) return "text-amber-300";
  return "text-red-400";
};

type DispatchEvalDimensionStats = {
  mean: number | null;
  min: number | null;
  max: number | null;
  n: number;
};

type DispatchEvalPromptVersionAgg = {
  hash: string;
  n: number;
  compositeMean: number | null;
  bannedMean: number | null;
};

type DispatchEvalBannedPhraseAgg = {
  phrase: string;
  severity: "violation" | "warning";
  totalCount: number;
  dispatchCount: number;
};

type DispatchEvalAggregates = {
  totals: { archived: number; evaluated: number; withFeedback: number };
  composite: DispatchEvalDimensionStats;
  bannedPerDispatch: DispatchEvalDimensionStats;
  dimensions: Record<keyof DispatchEvalScores, DispatchEvalDimensionStats>;
  byPromptVersion: {
    polish: DispatchEvalPromptVersionAgg[];
    fallback: DispatchEvalPromptVersionAgg[];
    commentator: DispatchEvalPromptVersionAgg[];
    banner: DispatchEvalPromptVersionAgg[];
  };
  topBannedPhrases: DispatchEvalBannedPhraseAgg[];
  trend: Array<{
    id: number;
    createdAt: string;
    composite: number | null;
    banned: number | null;
  }>;
};

const EvalTrendStrip = ({
  trend,
}: {
  trend: DispatchEvalAggregates["trend"];
}) => {
  // Pre-filter once, memoize the geometry so re-renders of the parent
  // (driven by feedback drafts, expanded row state, etc) don't rebuild the
  // bar list. The aggregate endpoint already returns points in oldest →
  // newest order, so no reverse here.
  const points = useMemo(
    () => trend.filter((p) => p.composite !== null),
    [trend],
  );
  if (points.length < 2) return null;
  const max = 10;
  const width = 720;
  const height = 80;
  const barWidth = Math.max(2, Math.floor(width / points.length) - 2);
  const latest = points[points.length - 1]?.composite ?? null;
  return (
    <div className="border border-foreground/15 bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="section-label">Composite trend</div>
          <div className="text-[11px] text-muted-foreground font-light mt-0.5">
            Mean of the five rubric scores per dispatch — oldest → newest,
            full archive.
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {points.length} evaluated · latest{" "}
          <span className={scoreColor(latest)}>
            {latest?.toFixed(2) ?? "—"}
          </span>
          /10
        </div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-20"
        preserveAspectRatio="none"
      >
        <line
          x1={0}
          x2={width}
          y1={height - (height * 7) / max}
          y2={height - (height * 7) / max}
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeDasharray="4 4"
        />
        {points.map((p, i) => {
          const score = p.composite ?? 0;
          const h = Math.max(2, (score / max) * (height - 4));
          const x = i * (width / points.length) + 1;
          const y = height - h;
          const color =
            score >= 7 ? "#34d399" : score >= 5 ? "#fbbf24" : "#f87171";
          return (
            <g key={p.id}>
              <title>{`#${p.id}\n${score.toFixed(2)}/10 · ${p.banned ?? 0} banned hits`}</title>
              <rect x={x} y={y} width={barWidth} height={h} fill={color} fillOpacity={0.75} />
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const EvalAggregatePanel = ({
  aggregates,
}: {
  aggregates: DispatchEvalAggregates | null;
}) => {
  if (!aggregates) return null;
  const { totals, composite, bannedPerDispatch, dimensions, byPromptVersion, topBannedPhrases } =
    aggregates;
  // Sorted weakest → strongest so the dimensions most in need of fine-tune
  // examples lead the eye.
  const dimRows = (Object.keys(RUBRIC_LABELS) as Array<keyof DispatchEvalScores>)
    .map((k) => ({ key: k, label: RUBRIC_LABELS[k], stats: dimensions[k] }))
    .sort((a, b) => (a.stats.mean ?? 99) - (b.stats.mean ?? 99));
  // Best prompt per slot (highest composite mean with n >= 2 — drop single-row
  // hashes since one composite isn't signal). The server already orders by
  // composite_mean desc within each slot.
  const bestPromptPerSlot = (
    ["polish", "fallback", "commentator", "banner"] as const
  )
    .map((slot) => {
      const list = byPromptVersion[slot];
      const candidate = list.find((p) => p.n >= 2 && p.compositeMean !== null) ?? list[0];
      return candidate ? { slot, agg: candidate } : null;
    })
    .filter((v): v is { slot: "polish" | "fallback" | "commentator" | "banner"; agg: DispatchEvalPromptVersionAgg } => v !== null);
  return (
    <div className="border border-foreground/15 bg-card p-4 space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="section-label">Aggregate signals</div>
          <div className="text-[11px] text-muted-foreground font-light mt-0.5">
            Rolled up across the full archive. Shapes the fine-tuning
            dataset: weakest dimensions to target, top prompt versions to
            anchor on, leaked phrases to mine as negatives.
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground text-right">
          <div>
            {totals.archived} archived · {totals.evaluated} evaluated
          </div>
          <div className="text-primary/80 mt-0.5">
            {totals.withFeedback} with feedback
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Composite & banned (fleet)
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">Composite mean</span>
              <span className={`font-mono ${scoreColor(composite.mean)}`}>
                {composite.mean !== null ? composite.mean.toFixed(2) : "—"}/10
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">Range</span>
              <span className="font-mono text-muted-foreground">
                {composite.min !== null && composite.max !== null
                  ? `${composite.min.toFixed(1)}–${composite.max.toFixed(1)}`
                  : "—"}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">Banned/send mean</span>
              <span
                className={`font-mono ${
                  bannedPerDispatch.mean === null
                    ? "text-muted-foreground"
                    : bannedPerDispatch.mean <= 1
                      ? "text-emerald-400"
                      : bannedPerDispatch.mean <= 3
                        ? "text-amber-300"
                        : "text-red-400"
                }`}
              >
                {bannedPerDispatch.mean !== null
                  ? bannedPerDispatch.mean.toFixed(2)
                  : "—"}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">Banned range</span>
              <span className="font-mono text-muted-foreground">
                {bannedPerDispatch.min !== null && bannedPerDispatch.max !== null
                  ? `${bannedPerDispatch.min}–${bannedPerDispatch.max}`
                  : "—"}
              </span>
            </div>
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Rubric dimensions (weakest first)
          </div>
          <div className="space-y-1">
            {dimRows.map((d) => (
              <div key={d.key} className="flex items-baseline justify-between text-xs">
                <span className="text-muted-foreground">{d.label}</span>
                <span className="flex items-baseline gap-2">
                  <span className={`font-mono ${scoreColor(d.stats.mean)}`}>
                    {d.stats.mean !== null ? d.stats.mean.toFixed(2) : "—"}
                  </span>
                  <span className="font-mono text-muted-foreground/70 text-[10px]">
                    {d.stats.min !== null && d.stats.max !== null
                      ? `(${d.stats.min.toFixed(1)}–${d.stats.max.toFixed(1)})`
                      : ""}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Best prompt per slot
          </div>
          {bestPromptPerSlot.length === 0 ? (
            <div className="text-[11px] text-muted-foreground">
              Not enough evaluated dispatches to compare prompt versions yet.
            </div>
          ) : (
            <div className="space-y-1 text-xs">
              {bestPromptPerSlot.map(({ slot, agg }) => (
                <div key={slot} className="flex items-baseline justify-between">
                  <span className="text-muted-foreground capitalize">{slot}</span>
                  <span className="flex items-baseline gap-2">
                    <span className="font-mono text-primary/80">
                      {agg.hash.slice(0, 10)}
                    </span>
                    <span className={`font-mono ${scoreColor(agg.compositeMean)}`}>
                      {agg.compositeMean !== null ? agg.compositeMean.toFixed(2) : "—"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">n={agg.n}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Top leaked phrases
          </div>
          {topBannedPhrases.length === 0 ? (
            <div className="text-[11px] text-muted-foreground">
              No banned phrases recorded across the archive yet.
            </div>
          ) : (
            <ul className="space-y-1 text-xs max-h-40 overflow-auto pr-1">
              {topBannedPhrases.slice(0, 12).map((p) => (
                <li
                  key={`${p.phrase}:${p.severity}`}
                  className="flex items-baseline justify-between"
                >
                  <span
                    className={`font-mono ${p.severity === "violation" ? "text-red-300" : "text-amber-300/90"}`}
                  >
                    "{p.phrase}"
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {p.totalCount}× · {p.dispatchCount} sends
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

const formatTokensMaybe = (n: number | null): string =>
  n === null ? "—" : n.toLocaleString();

const callStatusColor = (status: DispatchLlmCall["status"]): string =>
  status === "ok"
    ? "text-emerald-400"
    : status === "missing_subject_or_intro"
      ? "text-amber-300"
      : "text-red-400";

const DispatchLlmTrace = ({
  archiveId,
  state,
  openCallId,
  onToggle,
}: {
  archiveId: number;
  state: DispatchLlmCall[] | "loading" | "error" | undefined;
  openCallId: number | null;
  onToggle: (id: number | null) => void;
}) => {
  return (
    <div className="border-t border-foreground/10 p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="section-label">LLM trace</div>
        <div className="text-[10px] text-muted-foreground">
          Raw input + output captured per call · archive #{archiveId}
        </div>
      </div>
      {state === "loading" && (
        <div className="text-xs text-muted-foreground">Loading…</div>
      )}
      {state === "error" && (
        <div className="text-xs text-red-400">Failed to load LLM calls.</div>
      )}
      {Array.isArray(state) && state.length === 0 && (
        <div className="text-xs text-muted-foreground">
          No LLM calls captured for this dispatch (composed before tracing was
          enabled, or fallback didn't fire).
        </div>
      )}
      {Array.isArray(state) && state.length > 0 && (
        <div className="space-y-2">
          {state.map((c) => {
            const isOpen = openCallId === c.id;
            return (
              <div key={c.id} className="border border-foreground/15 bg-background/40">
                <button
                  type="button"
                  onClick={() => onToggle(isOpen ? null : c.id)}
                  className="w-full px-3 py-2 flex items-center gap-3 text-left hover:bg-background/60"
                >
                  <span className="text-[10px] uppercase tracking-widest w-20">
                    {c.kind}
                  </span>
                  <span
                    className={`text-[10px] uppercase tracking-widest w-32 ${callStatusColor(c.status)}`}
                  >
                    {c.status}
                  </span>
                  <span className="text-[10px] text-primary/80 font-mono">
                    p:{c.promptHash.slice(0, 7)}
                  </span>
                  <span className="flex-1 text-[10px] text-muted-foreground font-mono truncate">
                    {c.model}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {formatTokensMaybe(c.promptTokens)} in ·{" "}
                    {formatTokensMaybe(c.completionTokens)} out
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono w-16 text-right">
                    {c.latencyMs !== null ? `${c.latencyMs}ms` : "—"}
                  </span>
                  <ChevronRight
                    className={`w-3 h-3 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                  />
                </button>
                {isOpen && (
                  <div className="border-t border-foreground/10 grid grid-cols-1 lg:grid-cols-2 gap-px bg-foreground/10">
                    <div className="bg-card p-3 space-y-1">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        User message
                      </div>
                      <pre className="text-[11px] font-mono whitespace-pre-wrap leading-relaxed max-h-[480px] overflow-auto">
                        {c.userMessage}
                      </pre>
                    </div>
                    <div className="bg-card p-3 space-y-1">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        Raw response{c.status !== "ok" ? ` (${c.status})` : ""}
                      </div>
                      <pre className="text-[11px] font-mono whitespace-pre-wrap leading-relaxed max-h-[480px] overflow-auto">
                        {c.responseText || c.errorMessage || "(empty)"}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const FeedbackTab = ({ token }: { token: string }) => {
  const [items, setItems] = useState<DispatchArchiveSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [detail, setDetail] = useState<DispatchArchiveDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<{ id: number; ok: boolean; message: string } | null>(null);
  const [evalRunningId, setEvalRunningId] = useState<number | null>(null);
  const [evalStatus, setEvalStatus] = useState<{ id: number; ok: boolean; message: string } | null>(null);
  const [llmCalls, setLlmCalls] = useState<Record<number, DispatchLlmCall[] | "loading" | "error">>({});
  const [openCallId, setOpenCallId] = useState<number | null>(null);
  const [aggregates, setAggregates] = useState<DispatchEvalAggregates | null>(null);

  const loadAggregates = useCallback(async () => {
    try {
      const res = await apiFetch(token, "/admin/dispatch-archive/eval-aggregates");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DispatchEvalAggregates;
      setAggregates(json);
    } catch {
      // Non-fatal — the row list still renders without aggregates.
    }
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fire list + aggregates in parallel. Aggregates roll up the full
      // archive server-side, so they don't depend on the (capped) list
      // response and don't need to wait on it.
      const [listRes] = await Promise.all([
        apiFetch(token, "/admin/dispatch-archive?limit=100"),
        loadAggregates(),
      ]);
      if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`);
      const json = (await listRes.json()) as { items: DispatchArchiveSummary[] };
      setItems(json.items);
      // Seed drafts with persisted feedback so the textarea reflects current state.
      const seed: Record<number, string> = {};
      for (const it of json.items) seed[it.id] = it.feedback ?? "";
      setDrafts((prev) => ({ ...seed, ...prev }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load archive");
    } finally {
      setLoading(false);
    }
  }, [token, loadAggregates]);

  useEffect(() => { void load(); }, [load]);

  const loadLlmCalls = async (id: number) => {
    if (llmCalls[id] !== undefined && llmCalls[id] !== "error") return;
    setLlmCalls((prev) => ({ ...prev, [id]: "loading" }));
    try {
      const res = await apiFetch(token, `/admin/dispatch-archive/${id}/llm-calls`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { items: DispatchLlmCall[] };
      setLlmCalls((prev) => ({ ...prev, [id]: json.items }));
    } catch {
      setLlmCalls((prev) => ({ ...prev, [id]: "error" }));
    }
  };

  const openDetail = async (id: number) => {
    if (expanded === id) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(id);
    setDetail(null);
    setDetailLoading(true);
    // Fire LLM calls fetch in parallel with the detail fetch.
    void loadLlmCalls(id);
    try {
      const res = await apiFetch(token, `/admin/dispatch-archive/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { item: DispatchArchiveDetail };
      setDetail(json.item);
    } catch (err) {
      setSaveStatus({
        id,
        ok: false,
        message: err instanceof Error ? err.message : "Failed to load detail",
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const saveFeedback = async (id: number) => {
    const value = drafts[id] ?? "";
    setSavingId(id);
    setSaveStatus(null);
    try {
      const res = await apiFetch(token, `/admin/dispatch-archive/${id}/feedback`, {
        method: "PUT",
        body: JSON.stringify({ feedback: value }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        feedback?: string | null;
        feedbackUpdatedAt?: string | null;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? {
                ...it,
                feedback: json.feedback ?? null,
                feedbackUpdatedAt: json.feedbackUpdatedAt ?? null,
              }
            : it,
        ),
      );
      setSaveStatus({ id, ok: true, message: "Saved." });
    } catch (err) {
      setSaveStatus({
        id,
        ok: false,
        message: err instanceof Error ? err.message : "Save failed",
      });
    } finally {
      setSavingId(null);
    }
  };

  const runEval = async (id: number) => {
    setEvalRunningId(id);
    setEvalStatus(null);
    try {
      const res = await apiFetch(token, `/admin/dispatch-archive/${id}/eval`, {
        method: "POST",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        composite?: number;
        bannedCount?: number;
        evalScores?: DispatchEvalScores | null;
        evalBannedPhrases?: DispatchBannedPhraseHit[] | null;
        evalRunAt?: string | null;
        evalModel?: string | null;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? {
                ...it,
                evalScores: json.evalScores ?? null,
                evalCompositeScore:
                  typeof json.composite === "number" ? json.composite : null,
                evalBannedPhrasesCount: json.bannedCount ?? null,
                evalBannedPhrases: json.evalBannedPhrases ?? null,
                evalRunAt: json.evalRunAt ?? null,
                evalModel: json.evalModel ?? null,
              }
            : it,
        ),
      );
      if (detail && detail.id === id) {
        setDetail({
          ...detail,
          evalScores: json.evalScores ?? null,
          evalCompositeScore:
            typeof json.composite === "number" ? json.composite : null,
          evalBannedPhrasesCount: json.bannedCount ?? null,
          evalBannedPhrases: json.evalBannedPhrases ?? null,
          evalRunAt: json.evalRunAt ?? null,
          evalModel: json.evalModel ?? null,
        });
      }
      setEvalStatus({
        id,
        ok: true,
        message: `Composite ${json.composite?.toFixed(2) ?? "—"}/10 · ${json.bannedCount ?? 0} hits`,
      });
      // Refresh aggregates so the dashboard reflects the new score without
      // forcing a full archive reload.
      void loadAggregates();
    } catch (err) {
      setEvalStatus({
        id,
        ok: false,
        message: err instanceof Error ? err.message : "Eval failed",
      });
    } finally {
      setEvalRunningId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif">Dispatch eval &amp; feedback</h2>
          <p className="text-sm text-muted-foreground font-light mt-1 max-w-2xl">
            Every composed dispatch (real send or admin test) is logged, scored
            against a 5-dimension rubric, and scanned for banned phrases. Click
            a row to read the body, see the rubric breakdown, and leave
            freeform feedback — it accumulates as a dataset for tuning the
            dispatch prompt.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-none text-[10px] uppercase tracking-widest"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {error && (
        <div className="border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {items.length === 0 && !loading && (
        <div className="border border-foreground/15 bg-card px-4 py-6 text-sm text-muted-foreground">
          No dispatches archived yet. Once a real send or a test send runs,
          it will appear here.
        </div>
      )}

      <EvalAggregatePanel aggregates={aggregates} />
      <EvalTrendStrip trend={aggregates?.trend ?? []} />

      <div className="space-y-3">
        {items.map((it) => {
          const isOpen = expanded === it.id;
          const draft = drafts[it.id] ?? "";
          const dirty = draft !== (it.feedback ?? "");
          const status = saveStatus?.id === it.id ? saveStatus : null;
          const evStatus = evalStatus?.id === it.id ? evalStatus : null;
          const composite = compositeNumber(it.evalCompositeScore);
          const banned = it.evalBannedPhrasesCount;
          return (
            <div key={it.id} className="border border-foreground/15 bg-card">
              <button
                type="button"
                onClick={() => void openDetail(it.id)}
                className="w-full px-4 py-3 flex items-center gap-4 text-left hover:bg-background/40"
              >
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground w-16">
                  {it.kind === "test"
                    ? "Test"
                    : it.kind === "preview"
                      ? "Preview"
                      : "Send"}
                </span>
                <span className="text-xs text-muted-foreground font-mono w-44 shrink-0">
                  {formatDate(it.createdAt)}
                </span>
                <span className="flex-1 text-sm font-serif truncate">{it.subject}</span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground hidden sm:inline">
                  {it.itemCount} items
                </span>
                <span
                  className="text-[10px] uppercase tracking-widest font-mono w-20 text-right text-primary/80"
                  title={`Polish prompt: ${it.promptVersions?.polish ?? "—"}`}
                >
                  {it.promptVersions?.polish
                    ? `p:${it.promptVersions.polish.slice(0, 7)}`
                    : "p:—"}
                </span>
                <span
                  className={`text-[10px] uppercase tracking-widest font-mono w-16 text-right ${scoreColor(composite)}`}
                  title="Composite rubric score (0-10)"
                >
                  {composite !== null ? `${composite.toFixed(1)}/10` : "—"}
                </span>
                <span
                  className={`text-[10px] uppercase tracking-widest font-mono w-16 text-right ${
                    banned === null
                      ? "text-muted-foreground"
                      : banned === 0
                        ? "text-emerald-400"
                        : banned <= 3
                          ? "text-amber-300"
                          : "text-red-400"
                  }`}
                  title="Banned-phrase hits (lower is better)"
                >
                  {banned === null ? "—" : `${banned} hits`}
                </span>
                {it.feedback ? (
                  <span className="text-[10px] uppercase tracking-widest text-primary w-20 text-right">
                    Feedback ✓
                  </span>
                ) : (
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 w-20 text-right">
                    —
                  </span>
                )}
                <ChevronRight
                  className={`w-3 h-3 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                />
              </button>

              {isOpen && (
                <div className="border-t border-foreground/10">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                  <div className="lg:border-r border-foreground/10 p-4 space-y-4 max-h-[640px] overflow-auto">
                    <div className="section-label">Dispatch</div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        Subject
                      </div>
                      <div className="text-sm font-serif mt-1">{it.subject}</div>
                    </div>
                    {detailLoading && (
                      <div className="text-xs text-muted-foreground">Loading…</div>
                    )}
                    {detail && detail.id === it.id && (
                      <>
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                            Intro
                          </div>
                          <div className="text-sm font-light mt-1 leading-relaxed whitespace-pre-line">
                            {htmlToText(detail.introHtml)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                            Items ({detail.headlinesSnapshot.length})
                          </div>
                          <ol className="space-y-3">
                            {detail.headlinesSnapshot.map((h, i) => (
                              <li key={h.id} className="border-l-2 border-foreground/15 pl-3">
                                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                                  {String(i + 1).padStart(2, "0")} · {h.source}
                                </div>
                                <a
                                  href={h.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sm font-serif hover:text-primary inline-flex items-baseline gap-1"
                                >
                                  {h.title}
                                  <ExternalLink className="w-3 h-3 self-center" />
                                </a>
                                {h.commentary && (
                                  <div className="text-xs text-muted-foreground font-light mt-1 leading-relaxed whitespace-pre-line">
                                    {h.commentary}
                                  </div>
                                )}
                              </li>
                            ))}
                          </ol>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="p-4 space-y-4 max-h-[640px] overflow-auto">
                    <div className="flex items-center justify-between">
                      <div className="section-label">Eval</div>
                      <div className="flex items-center gap-2">
                        {evStatus && (
                          <span
                            className={`text-[10px] uppercase tracking-widest ${evStatus.ok ? "text-primary" : "text-red-400"}`}
                          >
                            {evStatus.message}
                          </span>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void runEval(it.id)}
                          disabled={evalRunningId === it.id}
                          className="rounded-none text-[10px] uppercase tracking-widest"
                        >
                          <RefreshCw
                            className={`w-3 h-3 ${evalRunningId === it.id ? "animate-spin" : ""}`}
                          />{" "}
                          {it.evalRunAt ? "Re-run eval" : "Run eval"}
                        </Button>
                      </div>
                    </div>

                    {it.evalRunAt ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                          <div className="col-span-2 flex items-center justify-between border-b border-foreground/10 pb-2">
                            <span className="text-xs text-muted-foreground">
                              Composite
                            </span>
                            <span
                              className={`text-lg font-serif ${scoreColor(composite)}`}
                            >
                              {composite !== null ? composite.toFixed(2) : "—"}
                              <span className="text-xs text-muted-foreground ml-1">
                                /10
                              </span>
                            </span>
                          </div>
                          {it.evalScores &&
                            (Object.keys(RUBRIC_LABELS) as Array<keyof DispatchEvalScores>).map(
                              (key) => {
                                const dim = it.evalScores?.[key];
                                return (
                                  <div key={key} className="space-y-1">
                                    <div className="flex items-baseline justify-between">
                                      <span className="text-[11px] text-muted-foreground">
                                        {RUBRIC_LABELS[key]}
                                      </span>
                                      <span
                                        className={`text-xs font-mono ${scoreColor(dim?.score ?? null)}`}
                                      >
                                        {dim ? `${dim.score.toFixed(1)}/10` : "—"}
                                      </span>
                                    </div>
                                    {dim?.note && (
                                      <div className="text-[11px] text-muted-foreground font-light leading-snug">
                                        {dim.note}
                                      </div>
                                    )}
                                  </div>
                                );
                              },
                            )}
                        </div>
                        <div className="space-y-3">
                          {(() => {
                            // Split hits into violations (drive the headline
                            // count) and warnings (bare-word bans tracked
                            // separately). Rows scanned before the severity
                            // split lack the field — treat those as
                            // violations for back-compat.
                            const hits = it.evalBannedPhrases ?? [];
                            const violations = hits.filter(
                              (h) => (h.severity ?? "violation") === "violation",
                            );
                            const warnings = hits.filter(
                              (h) => h.severity === "warning",
                            );
                            const warningTotal = warnings.reduce((s, h) => s + h.count, 0);
                            return (
                              <>
                                <div>
                                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                                    Violations ({banned ?? 0})
                                  </div>
                                  {violations.length > 0 ? (
                                    <ul className="space-y-1">
                                      {violations.map((h) => (
                                        <li
                                          key={h.phrase}
                                          className="flex items-baseline justify-between text-[11px]"
                                        >
                                          <span className="text-red-300 font-mono">
                                            "{h.phrase}"
                                          </span>
                                          <span className="text-muted-foreground">
                                            {h.count}× · {h.locations.slice(0, 4).join(", ")}
                                            {h.locations.length > 4 ? "…" : ""}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <div className="text-[11px] text-muted-foreground">
                                      No violations detected.
                                    </div>
                                  )}
                                </div>
                                {warnings.length > 0 && (
                                  <div>
                                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                                      Warnings ({warningTotal}) ·{" "}
                                      <span className="normal-case tracking-normal text-muted-foreground/70">
                                        bare-word bans, not part of violation count
                                      </span>
                                    </div>
                                    <ul className="space-y-1">
                                      {warnings.map((h) => (
                                        <li
                                          key={h.phrase}
                                          className="flex items-baseline justify-between text-[11px]"
                                        >
                                          <span className="text-amber-300/90 font-mono">
                                            "{h.phrase}"
                                          </span>
                                          <span className="text-muted-foreground">
                                            {h.count}× · {h.locations.slice(0, 4).join(", ")}
                                            {h.locations.length > 4 ? "…" : ""}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                        <div className="text-[10px] text-muted-foreground/70 pt-1 border-t border-foreground/5">
                          Last evaluated {formatDate(it.evalRunAt)}
                          {it.evalModel ? ` · ${it.evalModel}` : ""}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        Not yet evaluated. Click "Run eval" to score against the
                        rubric.
                      </div>
                    )}

                    <div className="section-label pt-4 border-t border-foreground/10">
                      Feedback
                    </div>
                    <textarea
                      value={draft}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [it.id]: e.target.value }))
                      }
                      placeholder="What worked? What didn't? Specific phrases that leaked, items that felt off, intro framing notes…"
                      className="w-full min-h-[260px] border border-foreground/20 bg-background/40 p-3 text-sm font-light leading-relaxed focus:border-primary focus:outline-none"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] text-muted-foreground">
                        {it.feedbackUpdatedAt
                          ? `Last saved ${formatDate(it.feedbackUpdatedAt)}`
                          : dirty
                            ? "Unsaved changes"
                            : "Not yet saved"}
                      </div>
                      <div className="flex items-center gap-2">
                        {status && (
                          <span
                            className={`text-[10px] uppercase tracking-widest ${status.ok ? "text-primary" : "text-red-400"}`}
                          >
                            {status.message}
                          </span>
                        )}
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => void saveFeedback(it.id)}
                          disabled={savingId === it.id || !dirty}
                          className="rounded-none text-[10px] uppercase tracking-widest"
                        >
                          Save feedback
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
                <DispatchLlmTrace
                  archiveId={it.id}
                  state={llmCalls[it.id]}
                  openCallId={openCallId}
                  onToggle={setOpenCallId}
                />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const PromptsTab = ({ token }: { token: string }) => {
  const [slot, setSlot] = useState<DispatchPromptSlot>("polish");
  const [items, setItems] = useState<DispatchPromptSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contentCache, setContentCache] = useState<Record<string, string>>({});
  const [expandedHash, setExpandedHash] = useState<string | null>(null);
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(token, `/admin/dispatch-prompts?slot=${slot}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { items: DispatchPromptSummary[] };
      setItems(json.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load prompts");
    } finally {
      setLoading(false);
    }
  }, [slot, token]);

  useEffect(() => { void load(); }, [load]);

  const ensureContent = useCallback(
    async (hash: string) => {
      if (contentCache[hash]) return contentCache[hash];
      const res = await apiFetch(token, `/admin/dispatch-prompts/${hash}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { item: DispatchPromptDetail };
      setContentCache((prev) => ({ ...prev, [hash]: json.item.content }));
      return json.item.content;
    },
    [contentCache, token],
  );

  const toggleExpand = async (hash: string) => {
    if (expandedHash === hash) {
      setExpandedHash(null);
      return;
    }
    setExpandedHash(hash);
    try {
      await ensureContent(hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load content");
    }
  };

  const inCompare = compareA && compareB;
  const startCompare = async (hash: string) => {
    if (compareA === hash) {
      setCompareA(null);
      return;
    }
    if (compareB === hash) {
      setCompareB(null);
      return;
    }
    if (!compareA) setCompareA(hash);
    else if (!compareB) setCompareB(hash);
    else {
      setCompareA(hash);
      setCompareB(null);
    }
    try {
      await ensureContent(hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load content");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif">Prompts</h2>
          <p className="text-sm text-muted-foreground font-light mt-1 max-w-2xl">
            Content-addressed registry of every prompt that has ever driven a
            dispatch composition. Identical prompts across deploys collapse to
            one version automatically. Each archived dispatch references the
            hashes that were active when it composed.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-none text-[10px] uppercase tracking-widest"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="flex items-center gap-2 border-b border-foreground/10 pb-2">
        {PROMPT_SLOTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSlot(s.id)}
            className={`text-[10px] uppercase tracking-widest px-3 py-1.5 border ${
              slot === s.id
                ? "border-primary text-primary"
                : "border-foreground/15 text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {items.length === 0 && !loading && (
        <div className="border border-foreground/15 bg-card px-4 py-6 text-sm text-muted-foreground">
          No {slot} prompts seen yet. Once a dispatch composes, the active
          prompt is hashed and recorded here.
        </div>
      )}

      <div className="space-y-2">
        {items.map((it) => {
          const isExpanded = expandedHash === it.hash;
          const isA = compareA === it.hash;
          const isB = compareB === it.hash;
          const content = contentCache[it.hash];
          return (
            <div key={it.hash} className="border border-foreground/15 bg-card">
              <div className="px-4 py-3 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => void toggleExpand(it.hash)}
                  className="flex items-center gap-4 flex-1 text-left"
                >
                  <span className="text-[10px] uppercase tracking-widest text-primary font-mono w-20">
                    {it.hash.slice(0, 8)}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono w-44 shrink-0">
                    {formatDate(it.firstSeenAt)}
                  </span>
                  <span className="flex-1 text-xs text-muted-foreground">
                    {it.contentLength.toLocaleString()} chars
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {it.usageCount} {it.usageCount === 1 ? "use" : "uses"}
                  </span>
                  <ChevronRight
                    className={`w-3 h-3 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  />
                </button>
                <Button
                  variant={isA || isB ? "default" : "outline"}
                  size="sm"
                  onClick={() => void startCompare(it.hash)}
                  className="rounded-none text-[10px] uppercase tracking-widest"
                  title="Pick two versions to compare side-by-side"
                >
                  {isA ? "A ✓" : isB ? "B ✓" : "Compare"}
                </Button>
              </div>
              {isExpanded && (
                <div className="border-t border-foreground/10 p-4 bg-background/40">
                  <pre className="text-[11px] font-mono whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-auto">
                    {content ?? "Loading…"}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {inCompare && (
        <div className="border border-primary/40 bg-card">
          <div className="px-4 py-2 border-b border-foreground/10 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-widest text-primary">
              Compare ·{" "}
              <span className="font-mono">{compareA?.slice(0, 8)}</span> ↔{" "}
              <span className="font-mono">{compareB?.slice(0, 8)}</span>
            </div>
            <button
              type="button"
              onClick={() => { setCompareA(null); setCompareB(null); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-foreground/10">
            <pre className="bg-card p-4 text-[11px] font-mono whitespace-pre-wrap leading-relaxed max-h-[640px] overflow-auto">
              {compareA && contentCache[compareA] !== undefined
                ? contentCache[compareA]
                : "Loading…"}
            </pre>
            <pre className="bg-card p-4 text-[11px] font-mono whitespace-pre-wrap leading-relaxed max-h-[640px] overflow-auto">
              {compareB && contentCache[compareB] !== undefined
                ? contentCache[compareB]
                : "Loading…"}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

type DispatchSection = "headlines" | "judge" | "writers" | "emails" | "feedback" | "prompts";

type WorkflowNodeSpec = {
  id: DispatchSection;
  label: string;
  Icon: typeof Bot;
  description: string;
  io: string;
};

const WORKFLOW_NODES: WorkflowNodeSpec[] = [
  {
    id: "headlines",
    label: "Headline ingestion",
    Icon: Radio,
    description: "Sources that fetch AI news on a schedule",
    io: "RSS · APIs → headlines",
  },
  {
    id: "judge",
    label: "Headline judge",
    Icon: Gavel,
    description: "Scores headlines + picks the top-10",
    io: "headlines → ranked picks",
  },
  {
    id: "writers",
    label: "Writer agents",
    Icon: PenLine,
    description: "Turn headlines into blog posts",
    io: "picks → drafted posts",
  },
  {
    id: "emails",
    label: "Email agent",
    Icon: Send,
    description: "Daily top-10 dispatch email",
    io: "picks + posts → inbox",
  },
  {
    id: "feedback",
    label: "Eval & feedback",
    Icon: MessageSquare,
    description: "Rubric scores, banned-phrase scan, and operator feedback",
    io: "sends → scored dataset",
  },
  {
    id: "prompts",
    label: "Prompts",
    Icon: FileText,
    description: "Every prompt version that has driven a dispatch",
    io: "compose → content-addressed registry",
  },
];

const WorkflowNodeCard = ({
  node,
  index,
  isFirst,
  isLast,
  onClick,
}: {
  node: WorkflowNodeSpec;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onClick: () => void;
}) => {
  const { Icon, label, description, io } = node;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative w-full lg:w-56 lg:shrink-0 border-2 border-foreground/25 bg-background/90 backdrop-blur p-5 text-left flex flex-col gap-4 hover:border-primary hover:shadow-[0_0_0_4px_rgba(255,255,255,0.04)] transition-all"
    >
      <div className="flex items-center justify-between">
        <div className="p-2 border border-foreground/20 bg-card group-hover:border-primary/60 transition-colors">
          <Icon className="w-4 h-4 text-foreground/80 group-hover:text-primary transition-colors" />
        </div>
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-sans">
          Step {index + 1}
        </span>
      </div>
      <div className="space-y-1.5">
        <div className="text-base font-serif leading-tight">{label}</div>
        <p className="text-[11px] text-muted-foreground font-light leading-relaxed">
          {description}
        </p>
      </div>
      <div className="text-[10px] text-muted-foreground/80 font-mono border-t border-foreground/10 pt-2">
        {io}
      </div>
      <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/60 group-hover:text-primary inline-flex items-center gap-1 font-sans transition-colors">
        Open <ChevronRight className="w-3 h-3" />
      </span>
      {!isFirst && (
        <span
          aria-hidden
          className="hidden lg:block absolute -left-[7px] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-background border-2 border-foreground/50 group-hover:border-primary transition-colors"
        />
      )}
      {!isLast && (
        <span
          aria-hidden
          className="hidden lg:block absolute -right-[7px] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-foreground group-hover:bg-primary transition-colors"
        />
      )}
    </button>
  );
};

const WorkflowConnector = () => (
  <div className="flex items-center justify-center self-center">
    <div className="hidden lg:flex items-center w-10 xl:w-14">
      <div className="flex-1 border-t border-dashed border-foreground/40" />
      <ChevronRight className="w-4 h-4 text-foreground/60 -ml-1" />
    </div>
    <div className="lg:hidden flex flex-col items-center py-2">
      <div className="h-6 w-px border-l border-dashed border-foreground/40" />
      <ChevronDown className="w-4 h-4 text-foreground/60 -mt-1" />
    </div>
  </div>
);

const WorkflowCanvas = ({
  onSelect,
}: {
  onSelect: (id: DispatchSection) => void;
}) => (
  <div className="relative border border-foreground/15 bg-card overflow-hidden">
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }}
    />
    <div className="relative px-5 py-3 border-b border-foreground/10 flex items-center justify-between">
      <span className="section-label">Workflow canvas</span>
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-sans hidden sm:inline">
        Ingestion → Judge → Writers → Email
      </span>
    </div>
    <div className="relative px-6 py-10 lg:px-10 lg:py-14">
      <div className="flex flex-col lg:flex-row lg:items-stretch lg:justify-center lg:flex-wrap gap-y-2 lg:gap-y-6">
        {WORKFLOW_NODES.map((node, i) => (
          <Fragment key={node.id}>
            <WorkflowNodeCard
              node={node}
              index={i}
              isFirst={i === 0}
              isLast={i === WORKFLOW_NODES.length - 1}
              onClick={() => onSelect(node.id)}
            />
            {i < WORKFLOW_NODES.length - 1 && <WorkflowConnector />}
          </Fragment>
        ))}
      </div>
    </div>
  </div>
);

const DispatchView = ({ token }: { token: string }) => {
  const [section, setSection] = useState<DispatchSection | null>(null);

  if (section) {
    const active = WORKFLOW_NODES.find((n) => n.id === section)!;
    const Icon = active.Icon;
    return (
      <div className="space-y-8">
        <div>
          <button
            type="button"
            onClick={() => setSection(null)}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 mb-4"
          >
            <ArrowLeft className="w-3 h-3" /> Back to workflow
          </button>
          <div className="flex items-start gap-3">
            <div className="p-2.5 border border-foreground/20 bg-card mt-1">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="section-label">Dispatch · Workflow</div>
              <h2 className="text-3xl font-serif mt-0.5">{active.label}</h2>
              <p className="text-sm text-muted-foreground font-light mt-2 max-w-2xl">
                {active.description}
              </p>
            </div>
          </div>
        </div>

        {section === "headlines" && <AgentsTab token={token} />}
        {section === "judge" && <JudgeTab token={token} />}
        {section === "writers" && <WriterAgentsTab token={token} />}
        {section === "emails" && <EmailAgentsTab token={token} />}
        {section === "feedback" && <FeedbackTab token={token} />}
        {section === "prompts" && <PromptsTab token={token} />}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="section-label">Dispatch</div>
        <h2 className="text-3xl font-serif mt-1">Workflows and Agents</h2>
        <p className="text-sm text-muted-foreground font-light mt-2 max-w-2xl">
          The full pipeline that ingests AI news, writes posts about it, and sends email out the door. Click any node to open it.
        </p>
      </div>

      <WorkflowCanvas onSelect={setSection} />
    </div>
  );
};

type View = "home" | "products" | "dispatch" | "leads";

type Tile<T extends string> = {
  id: T;
  label: string;
  description: string;
  Icon: typeof Bot;
};

const HOME_TILES: Tile<"products" | "leads">[] = [
  {
    id: "products",
    label: "Products",
    description: "All products — Dispatch news pipeline and more to come.",
    Icon: Bot,
  },
  {
    id: "leads",
    label: "Leads",
    description: "Free consultation requests and Dispatch newsletter subscribers.",
    Icon: Mail,
  },
];

const PRODUCT_TILES: Tile<"dispatch">[] = [
  {
    id: "dispatch",
    label: "Dispatch",
    description: "News pipeline — headline ingestion, writers, and email.",
    Icon: Radio,
  },
];

const TileGrid = <T extends string>({
  tiles,
  onSelect,
}: {
  tiles: Tile<T>[];
  onSelect: (id: T) => void;
}) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {tiles.map(({ id, label, description, Icon }) => (
      <button
        key={id}
        type="button"
        onClick={() => onSelect(id)}
        className="group aspect-square border border-foreground/15 bg-card p-6 text-left flex flex-col justify-between hover:border-primary/60 hover:bg-background/60 transition-colors"
      >
        <Icon className="w-8 h-8 text-foreground/80 group-hover:text-primary transition-colors" />
        <div>
          <div className="flex items-center justify-between">
            <div className="text-lg font-serif">{label}</div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
          <p className="text-xs text-muted-foreground font-light mt-2 leading-relaxed">
            {description}
          </p>
        </div>
      </button>
    ))}
  </div>
);

type VeniceUsageBucket = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  callCount: number;
};

type VeniceUsage = {
  total: VeniceUsageBucket;
  breakdown: Record<string, VeniceUsageBucket>;
  note?: string;
};

// Friendly label + per-call unit name for each known caller. Unknown callers
// fall through to a humanized version of the raw key — keeps the card from
// breaking when a new Venice caller starts logging before this UI is updated.
const VENICE_CALLER_META: Record<
  string,
  { label: string; unit: string }
> = {
  writer: { label: "Writer agent", unit: "posts" },
  judge: { label: "Headline judge", unit: "batches" },
  commentator: { label: "Commentator", unit: "batches" },
  email_polish: { label: "Email polish", unit: "sends" },
  email_fallback: { label: "Email fallback", unit: "calls" },
  image_gen: { label: "Banner image gen", unit: "images" },
  sms_bot: { label: "SMS bot", unit: "replies" },
};

const humanizeCaller = (key: string): string =>
  key
    .split("_")
    .map((s) => (s.length ? s[0]!.toUpperCase() + s.slice(1) : s))
    .join(" ");

const VeniceUsageCard = ({ token }: { token: string }) => {
  const [usage, setUsage] = useState<VeniceUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(token, "/admin/usage/venice");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setUsage((await res.json()) as VeniceUsage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Venice usage");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const total = usage?.total;
  const breakdownEntries = usage
    ? Object.entries(usage.breakdown).sort(
        (a, b) => b[1].costUsd - a[1].costUsd,
      )
    : [];

  return (
    <div className="border border-foreground/15 bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/10">
        <div>
          <div className="section-label">Venice API spend</div>
          <div className="text-[11px] text-muted-foreground font-light mt-0.5">
            Cumulative tokens and estimated USD across every Venice caller.
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-none text-[10px] uppercase tracking-widest"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>
      {error && <div className="px-4 py-3 text-xs text-red-400">{error}</div>}
      <div className="grid grid-cols-2 gap-px bg-foreground/10">
        <div className="bg-card px-4 py-3">
          <div className="section-label text-[10px]">Total tokens</div>
          <div className="text-2xl font-serif mt-1">
            {total ? formatTokens(total.totalTokens) : "—"}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {total
              ? `${formatTokens(total.promptTokens)} in · ${formatTokens(total.completionTokens)} out`
              : ""}
          </div>
        </div>
        <div className="bg-card px-4 py-3">
          <div className="section-label text-[10px]">Total cost</div>
          <div className="text-2xl font-serif mt-1">
            {total ? formatUsd(total.costUsd) : "—"}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {total ? `${total.callCount.toLocaleString()} calls` : ""}
          </div>
        </div>
      </div>
      {breakdownEntries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-foreground/10 border-t border-foreground/10">
          {breakdownEntries.map(([key, bucket]) => {
            const meta = VENICE_CALLER_META[key];
            const label = meta?.label ?? humanizeCaller(key);
            const unit = meta?.unit ?? "calls";
            return (
              <div key={key} className="bg-card px-4 py-3">
                <div className="section-label text-[10px]">{label}</div>
                <div className="text-xl font-serif mt-1">
                  {formatUsd(bucket.costUsd)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {bucket.totalTokens > 0
                    ? `${formatTokens(bucket.totalTokens)} tok · ${bucket.callCount.toLocaleString()} ${unit}`
                    : `${bucket.callCount.toLocaleString()} ${unit}`}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {usage?.note && (
        <div className="px-4 py-2 text-[10px] text-muted-foreground font-light border-t border-foreground/10">
          {usage.note}
        </div>
      )}
    </div>
  );
};

const Home = ({ token, onSelect }: { token: string; onSelect: (view: "products" | "leads") => void }) => (
  <div className="space-y-8">
    <div>
      <div className="section-label">Admin</div>
      <h1 className="text-3xl font-serif mt-1">Control room</h1>
      <p className="text-sm text-muted-foreground font-light mt-2 max-w-2xl">
        Pick a surface to manage.
      </p>
    </div>
    <VeniceUsageCard token={token} />
    <TileGrid tiles={HOME_TILES} onSelect={onSelect} />
  </div>
);

const ProductsHome = ({ onSelect }: { onSelect: (view: "dispatch") => void }) => (
  <div className="space-y-8">
    <div>
      <div className="section-label">Products</div>
      <h1 className="text-3xl font-serif mt-1">Product lineup</h1>
      <p className="text-sm text-muted-foreground font-light mt-2 max-w-2xl">
        Each tile is a product — the autonomous agents that power it live inside.
      </p>
    </div>
    <TileGrid tiles={PRODUCT_TILES} onSelect={onSelect} />
  </div>
);

const VIEW_LABELS: Record<Exclude<View, "home">, string> = {
  products: "Products",
  dispatch: "Dispatch",
  leads: "Leads",
};

const breadcrumbFor = (view: View): Exclude<View, "home">[] => {
  if (view === "home") return [];
  if (view === "dispatch") return ["products", "dispatch"];
  return [view];
};

const parentOf = (view: View): View => {
  if (view === "dispatch") return "products";
  return "home";
};

const Admin = () => {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY));
  const [view, setView] = useState<View>("home");

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex,nofollow,noarchive";
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  if (!token) {
    return <Login onAuthed={setToken} />;
  }

  const signOut = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
  };

  const crumbs = breadcrumbFor(view);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-foreground/15 bg-background/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="font-wordmark text-lg tracking-[0.06em] hover:text-foreground/70">
              DeerPark<span className="text-foreground/50 font-light">.io</span>
            </Link>
            <button
              type="button"
              onClick={() => setView("home")}
              className="section-label hover:text-foreground ml-3"
            >
              Admin
            </button>
            {crumbs.map((crumb, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <span key={crumb} className="text-xs inline-flex items-center gap-2 min-w-0">
                  <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                  {isLast ? (
                    <span className="text-foreground">{VIEW_LABELS[crumb]}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setView(crumb)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {VIEW_LABELS[crumb]}
                    </button>
                  )}
                </span>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            {view !== "home" && (
              <button
                type="button"
                onClick={() => setView(parentOf(view))}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 mr-3"
              >
                <ArrowLeft className="w-3 h-3" /> Back
              </button>
            )}
            <Link href="/" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
              <ArrowLeft className="w-3 h-3" /> Site
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 ml-3"
            >
              <LogOut className="w-3 h-3" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {view === "home" && <Home token={token} onSelect={setView} />}
        {view === "products" && <ProductsHome onSelect={setView} />}
        {view === "dispatch" && <DispatchView token={token} />}
        {view === "leads" && <LeadsTab token={token} />}
      </main>
    </div>
  );
};

export default Admin;
