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
  ChevronRight,
  ChevronDown,
  Gavel,
  Activity,
  Cpu,
  Signal,
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
  source: "consultation";
  sourceDetail: string | null;
  createdAt: string;
  name: string | null;
  contact: string;
  contactType: "email" | "sms";
  company: string | null;
  challenge: string | null;
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
            Everyone who's reached out — free consultation requests.
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
            {filtered.map((l) => (
              <tr
                key={l.id}
                className="border-b border-foreground/10 hover:bg-background/40 cursor-pointer"
                onClick={() => setExpanded((id) => (id === l.id ? null : l.id))}
              >
                <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDate(l.createdAt)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-[10px] uppercase tracking-widest border px-1.5 py-0.5 border-primary/40 text-primary">
                    Consultation
                  </span>
                  {l.sourceDetail && (
                    <span className="ml-2 text-[10px] uppercase tracking-widest text-muted-foreground border border-foreground/15 px-1.5 py-0.5">
                      {l.sourceDetail}
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
            ))}
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
            scored items into the top-10 feed. Edit the prompt to change what the judge calls
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
  judge: { label: "Headline judge", unit: "batches" },
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

// Re-renders the caller every `intervalMs`. Used to keep the mission-control
// clocks and "last run X ago" labels ticking without re-fetching data.
const useTick = (intervalMs = 1000) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
};

const pad2 = (n: number) => String(n).padStart(2, "0");

const formatUtcClock = (d: Date): string =>
  `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ` +
  `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}Z`;

const formatPtClock = (d: Date): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} PT`;
};

const ageMs = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Date.now() - t;
};

const ageLabel = (iso: string | null | undefined): string => {
  const ms = ageMs(iso);
  if (ms === null) return "no data";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
};

type SubsystemState = "nominal" | "warn" | "fault" | "idle" | "unknown";

const stateForAge = (
  iso: string | null | undefined,
  warnAfterH: number,
  faultAfterH: number,
): SubsystemState => {
  const ms = ageMs(iso);
  if (ms === null) return "unknown";
  const h = ms / 3_600_000;
  if (h >= faultAfterH) return "fault";
  if (h >= warnAfterH) return "warn";
  return "nominal";
};

const STATE_DOT: Record<SubsystemState, string> = {
  nominal: "bg-primary",
  warn: "bg-amber-400",
  fault: "bg-red-400",
  idle: "bg-foreground/40",
  unknown: "bg-foreground/30",
};

const STATE_LABEL: Record<SubsystemState, string> = {
  nominal: "Nominal",
  warn: "Stale",
  fault: "Fault",
  idle: "Idle",
  unknown: "—",
};

const STATE_TEXT: Record<SubsystemState, string> = {
  nominal: "text-primary",
  warn: "text-amber-400",
  fault: "text-red-400",
  idle: "text-muted-foreground",
  unknown: "text-muted-foreground",
};

const MissionHeader = () => {
  useTick(1000);
  const now = new Date();
  return (
    <div className="border border-foreground/15 bg-card">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-foreground/10">
        <div className="bg-card px-4 py-3 flex items-center gap-3">
          <span className="relative inline-flex w-2.5 h-2.5">
            <span className="inline-block w-2.5 h-2.5 bg-primary rounded-full" />
            <span className="absolute inset-0 inline-block w-2.5 h-2.5 bg-primary rounded-full animate-ping opacity-60" />
          </span>
          <div className="min-w-0">
            <div className="section-label">All systems operational</div>
            <div className="text-[10px] text-muted-foreground mt-0.5 font-mono truncate">
              deerpark.io // mission control
            </div>
          </div>
        </div>
        <div className="bg-card px-4 py-3">
          <div className="section-label text-[10px] inline-flex items-center gap-1.5">
            <Signal className="w-3 h-3" /> UTC
          </div>
          <div className="text-sm font-mono mt-1 tracking-wider">{formatUtcClock(now)}</div>
        </div>
        <div className="bg-card px-4 py-3">
          <div className="section-label text-[10px] inline-flex items-center gap-1.5">
            <Signal className="w-3 h-3" /> Pacific
          </div>
          <div className="text-sm font-mono mt-1 tracking-wider">{formatPtClock(now)}</div>
        </div>
      </div>
    </div>
  );
};

type SubsystemSnapshot = {
  key: string;
  label: string;
  Icon: typeof Bot;
  state: SubsystemState;
  primary: string;
  detail: string;
  lastAt: string | null;
};

const SubsystemPanel = ({ s }: { s: SubsystemSnapshot }) => {
  useTick(15_000);
  const Icon = s.Icon;
  return (
    <div className="bg-card px-4 py-4 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-foreground/70 shrink-0" />
          <div className="section-label text-[10px] truncate">{s.label}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`inline-block w-2 h-2 rounded-full ${STATE_DOT[s.state]}`} />
          <span className={`text-[10px] uppercase tracking-widest ${STATE_TEXT[s.state]}`}>
            {STATE_LABEL[s.state]}
          </span>
        </div>
      </div>
      <div className="text-xl font-serif mt-3">{s.primary}</div>
      <div className="text-[10px] text-muted-foreground mt-1 font-mono">{s.detail}</div>
      <div className="text-[10px] text-muted-foreground mt-3 font-mono">
        last: {ageLabel(s.lastAt)}
      </div>
    </div>
  );
};

const SubsystemStatusGrid = ({ token }: { token: string }) => {
  const [snapshots, setSnapshots] = useState<SubsystemSnapshot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [aRes, jRes] = await Promise.all([
        apiFetch(token, "/admin/agents"),
        apiFetch(token, "/admin/judge/spec"),
      ]);

      const agents = aRes.ok ? ((await aRes.json()) as { items: Agent[] }).items : [];
      const judge = jRes.ok ? ((await jRes.json()) as JudgeSpec) : null;

      const enabledAgents = agents.filter((a) => a.enabled);
      const ingestLast = enabledAgents
        .map((a) => a.latestIngestedAt)
        .filter((v): v is string => !!v)
        .sort()
        .at(-1) ?? null;
      const totalHeadlines = agents.reduce((sum, a) => sum + a.headlineCount, 0);

      const judgeLast = judge?.lastRun?.finishedAt ?? null;
      const judgeScored = judge?.stats?.scored ?? 0;
      const judgeTotal = judge?.stats?.total ?? 0;

      const next: SubsystemSnapshot[] = [
        {
          key: "ingest",
          label: "Ingest",
          Icon: Radio,
          state: enabledAgents.length === 0 ? "idle" : stateForAge(ingestLast, 1, 6),
          primary: `${enabledAgents.length}/${agents.length}`,
          detail: `${totalHeadlines.toLocaleString()} headlines · sources online`,
          lastAt: ingestLast,
        },
        {
          key: "judge",
          label: "Judge",
          Icon: Gavel,
          state: !judge?.judge.configured
            ? "fault"
            : stateForAge(judgeLast, 24, 96),
          primary: `${judgeScored.toLocaleString()}`,
          detail: `of ${judgeTotal.toLocaleString()} scored · ${judge?.judge.model ?? "—"}`,
          lastAt: judgeLast,
        },
      ];

      setSnapshots(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subsystem status");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="border border-foreground/15 bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/10">
        <div>
          <div className="section-label inline-flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" /> Subsystems
          </div>
          <div className="text-[11px] text-muted-foreground font-light mt-0.5">
            Live state of every AI agent. Auto-refreshes every 30s.
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
        {snapshots
          ? snapshots.map((s) => <SubsystemPanel key={s.key} s={s} />)
          : Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="bg-card px-4 py-4">
                <div className="section-label text-[10px] text-muted-foreground">Loading…</div>
                <div className="h-5 mt-3 bg-foreground/5" />
                <div className="h-3 mt-2 bg-foreground/5 w-2/3" />
              </div>
            ))}
      </div>
    </div>
  );
};

const Home = ({ token, onSelect }: { token: string; onSelect: (view: "products" | "leads") => void }) => (
  <div className="space-y-6">
    <div className="flex items-end justify-between gap-3 flex-wrap">
      <div>
        <div className="section-label inline-flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5" /> DeerPark // Mission Control
        </div>
        <h1 className="text-3xl font-serif mt-1">All systems</h1>
        <p className="text-sm text-muted-foreground font-light mt-2 max-w-2xl">
          Real-time status of the AI agents in the pipeline — headline ingest and the
          relevance judge. Auto-refreshes in the background.
        </p>
      </div>
    </div>

    <MissionHeader />
    <SubsystemStatusGrid token={token} />
    <VeniceUsageCard token={token} />

    <div>
      <div className="section-label mb-3 inline-flex items-center gap-2">
        <ChevronRight className="w-3.5 h-3.5" /> Consoles
      </div>
      <TileGrid tiles={HOME_TILES} onSelect={onSelect} />
    </div>
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

type DispatchSection = "headlines" | "judge";

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
        Ingestion → Judge
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
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="section-label">Dispatch</div>
        <h2 className="text-3xl font-serif mt-1">Workflows and Agents</h2>
        <p className="text-sm text-muted-foreground font-light mt-2 max-w-2xl">
          The pipeline that ingests AI news and ranks it into the on-site feed. Click any node to open it.
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
    description: "Free consultation requests.",
    Icon: Mail,
  },
];

const PRODUCT_TILES: Tile<"dispatch">[] = [
  {
    id: "dispatch",
    label: "Dispatch",
    description: "News pipeline — headline ingestion and the relevance judge.",
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
