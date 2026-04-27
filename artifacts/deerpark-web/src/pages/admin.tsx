import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
  id: number;
  name: string;
  email: string;
  company: string;
  challenge: string;
  createdAt: string;
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
  const [expanded, setExpanded] = useState<number | null>(null);

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
      [l.name, l.email, l.company, l.challenge].some((v) => v.toLowerCase().includes(q)),
    );
  }, [leads, filter]);

  const exportCsv = () => {
    if (!leads || leads.length === 0) return;
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = ["id", "createdAt", "name", "email", "company", "challenge"];
    const rows = leads.map((l) =>
      [l.id, l.createdAt, l.name, l.email, l.company, l.challenge].map((v) => escape(String(v))).join(","),
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

  const copyEmails = async () => {
    if (!filtered.length) return;
    const list = filtered.map((l) => l.email).join(", ");
    await navigator.clipboard.writeText(list);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-serif">Scorecard inquiries</h2>
          <p className="text-sm text-muted-foreground font-light mt-1">
            Submissions from the lead-capture form on the homepage.
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
            onClick={() => void copyEmails()}
            disabled={!filtered.length}
            className="rounded-none text-xs uppercase tracking-widest"
          >
            Copy emails
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
              <th className="px-4 py-3 section-label">Name</th>
              <th className="px-4 py-3 section-label">Email</th>
              <th className="px-4 py-3 section-label">Company</th>
              <th className="px-4 py-3 section-label">Challenge</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr
                key={l.id}
                className="border-b border-foreground/10 hover:bg-background/40 cursor-pointer"
                onClick={() => setExpanded((id) => (id === l.id ? null : l.id))}
              >
                <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDate(l.createdAt)}</td>
                <td className="px-4 py-3">{l.name}</td>
                <td className="px-4 py-3">
                  <a
                    href={`mailto:${l.email}`}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:underline underline-offset-4"
                  >
                    {l.email}
                  </a>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{l.company}</td>
                <td className="px-4 py-3 text-muted-foreground max-w-md">
                  <div className={expanded === l.id ? "whitespace-pre-wrap" : "truncate"}>
                    {l.challenge}
                  </div>
                </td>
              </tr>
            ))}
            {leads && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground text-sm">
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

type EmailAgent = {
  id: string;
  displayName: string;
  description: string;
  enabled: boolean;
};

const PLACEHOLDER_EMAIL_AGENTS: EmailAgent[] = [];

const WRITER_MODES = [
  { id: "auto", label: "Auto (agent picks)" },
  { id: "digest", label: "Digest" },
  { id: "deep_dive", label: "Deep dive" },
  { id: "free_pick", label: "Free pick" },
] as const;

type WriterModeId = (typeof WRITER_MODES)[number]["id"];

const WriterAgentsTab = ({ token }: { token: string }) => {
  const [agents, setAgents] = useState<WriterAgent[] | null>(null);
  const [posts, setPosts] = useState<AdminPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [runMode, setRunMode] = useState<WriterModeId>("auto");
  const [lastRun, setLastRun] = useState<{ ok: boolean; message: string } | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<number | null>(null);

  // Prompt editor state
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
            status: "idle" | "running" | "ok" | "error";
            postId: number | null;
            error: string | null;
          };
        };
        const s = stJson.status;
        if (s.status === "ok") {
          setLastRun({ ok: true, message: `Wrote post #${s.postId}` });
          await load();
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

  const openPromptEditor = async () => {
    setPromptOpen(true);
    setPromptStatus(null);
    setPromptLoading(true);
    try {
      const res = await apiFetch(token, "/admin/writers/daily-writer/prompt");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        prompt: string;
        isCustom: boolean;
        defaultPrompt: string;
      };
      setPromptDraft(json.prompt);
      setPromptIsCustom(json.isCustom);
      setPromptDefault(json.defaultPrompt);
    } catch (err) {
      setPromptStatus({
        ok: false,
        message: err instanceof Error ? err.message : "Failed to load prompt",
      });
    } finally {
      setPromptLoading(false);
    }
  };

  const savePrompt = async () => {
    setPromptSaving(true);
    setPromptStatus(null);
    try {
      const res = await apiFetch(token, "/admin/writers/daily-writer/prompt", {
        method: "PUT",
        body: JSON.stringify({ prompt: promptDraft }),
      });
      const json = (await res.json()) as { error?: string };
      if (res.ok) {
        setPromptIsCustom(true);
        setPromptStatus({ ok: true, message: "Prompt saved. Next run will use it." });
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

  const resetPromptToDefault = async () => {
    if (!confirm("Reset to the built-in default prompt? Your custom edits will be deleted.")) return;
    setPromptSaving(true);
    setPromptStatus(null);
    try {
      const res = await apiFetch(token, "/admin/writers/daily-writer/prompt", { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPromptDraft(promptDefault);
      setPromptIsCustom(false);
      setPromptStatus({ ok: true, message: "Reset to default." });
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
                Controls voice, format, and rules for the Daily Writer.{" "}
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
                    disabled={
                      promptSaving ||
                      promptDraft.length < 200 ||
                      promptDraft.length > 20_000
                    }
                    className="rounded-none text-[10px] uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90"
                  >
                    {promptSaving ? "Saving…" : "Save prompt"}
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

const EmailAgentsTab = () => {
  const [agents] = useState<EmailAgent[]>(PLACEHOLDER_EMAIL_AGENTS);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif">Email agents</h2>
          <p className="text-sm text-muted-foreground font-light mt-1">
            Agents that draft and send outbound emails based on ingested signals.
          </p>
        </div>
        <Button
          disabled
          className="rounded-none text-xs uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90"
        >
          <Send className="w-3.5 h-3.5" /> New email agent
        </Button>
      </div>

      <div className="border border-foreground/15 bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left bg-background/40">
            <tr className="border-b border-foreground/10">
              <th className="px-4 py-3 section-label">Agent</th>
              <th className="px-4 py-3 section-label">Description</th>
              <th className="px-4 py-3 section-label">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id} className="border-b border-foreground/10 hover:bg-background/40">
                <td className="px-4 py-3">{a.displayName}</td>
                <td className="px-4 py-3 text-muted-foreground">{a.description}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] uppercase tracking-widest px-2 py-1 border ${a.enabled ? "border-primary/40 text-primary" : "border-foreground/20 text-muted-foreground"}`}>
                    {a.enabled ? "Enabled" : "Disabled"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    className="rounded-none text-[10px] uppercase tracking-widest"
                  >
                    <Play className="w-3 h-3" /> Run
                  </Button>
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground text-sm">
                  No email agents configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

type DispatchSection = "headlines" | "writers" | "emails";

const DispatchView = ({ token }: { token: string }) => {
  const [section, setSection] = useState<DispatchSection>("headlines");

  const sections: { id: DispatchSection; label: string; Icon: typeof Bot; description: string }[] = [
    { id: "headlines", label: "Headline ingestion", Icon: Radio, description: "Sources that fetch AI news on a schedule" },
    { id: "writers", label: "Writer agents", Icon: PenLine, description: "Turn headlines into blog posts" },
    { id: "emails", label: "Email agents", Icon: Send, description: "Draft and send outbound emails" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <div className="section-label">Dispatch</div>
        <h2 className="text-3xl font-serif mt-1">News agents</h2>
        <p className="text-sm text-muted-foreground font-light mt-2 max-w-2xl">
          The full pipeline that ingests AI news, writes posts about it, and sends email out the door.
        </p>
      </div>

      <div className="flex gap-1 border-b border-foreground/15 -mb-px">
        {sections.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={`px-4 py-2.5 text-xs uppercase tracking-widest border-b-2 inline-flex items-center gap-2 ${
              section === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {section === "headlines" && <AgentsTab token={token} />}
      {section === "writers" && <WriterAgentsTab token={token} />}
      {section === "emails" && <EmailAgentsTab />}
    </div>
  );
};

type View = "home" | "agents" | "dispatch" | "leads";

type Tile<T extends string> = {
  id: T;
  label: string;
  description: string;
  Icon: typeof Bot;
};

const HOME_TILES: Tile<"agents" | "leads">[] = [
  {
    id: "agents",
    label: "Agents",
    description: "All autonomous agents — Dispatch news pipeline and more to come.",
    Icon: Bot,
  },
  {
    id: "leads",
    label: "Scorecard leads",
    description: "Submissions from the homepage lead-capture form.",
    Icon: Mail,
  },
];

const AGENT_TILES: Tile<"dispatch">[] = [
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

const Home = ({ onSelect }: { onSelect: (view: "agents" | "leads") => void }) => (
  <div className="space-y-8">
    <div>
      <div className="section-label">Admin</div>
      <h1 className="text-3xl font-serif mt-1">Control room</h1>
      <p className="text-sm text-muted-foreground font-light mt-2 max-w-2xl">
        Pick a surface to manage.
      </p>
    </div>
    <TileGrid tiles={HOME_TILES} onSelect={onSelect} />
  </div>
);

const AgentsHome = ({ onSelect }: { onSelect: (view: "dispatch") => void }) => (
  <div className="space-y-8">
    <div>
      <div className="section-label">Agents</div>
      <h1 className="text-3xl font-serif mt-1">Agent groups</h1>
      <p className="text-sm text-muted-foreground font-light mt-2 max-w-2xl">
        Each tile is a family of agents working toward one outcome.
      </p>
    </div>
    <TileGrid tiles={AGENT_TILES} onSelect={onSelect} />
  </div>
);

const VIEW_LABELS: Record<Exclude<View, "home">, string> = {
  agents: "Agents",
  dispatch: "Dispatch",
  leads: "Scorecard leads",
};

const breadcrumbFor = (view: View): Exclude<View, "home">[] => {
  if (view === "home") return [];
  if (view === "dispatch") return ["agents", "dispatch"];
  return [view];
};

const parentOf = (view: View): View => {
  if (view === "dispatch") return "agents";
  return "home";
};

const Admin = () => {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY));
  const [view, setView] = useState<View>("home");

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
        {view === "home" && <Home onSelect={setView} />}
        {view === "agents" && <AgentsHome onSelect={setView} />}
        {view === "dispatch" && <DispatchView token={token} />}
        {view === "leads" && <LeadsTab token={token} />}
      </main>
    </div>
  );
};

export default Admin;
