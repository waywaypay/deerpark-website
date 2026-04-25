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
  enabled: boolean;
};

type EmailAgent = {
  id: string;
  displayName: string;
  description: string;
  enabled: boolean;
};

const PLACEHOLDER_WRITER_AGENTS: WriterAgent[] = [];
const PLACEHOLDER_EMAIL_AGENTS: EmailAgent[] = [];

const WriterAgentsTab = () => {
  const [agents] = useState<WriterAgent[]>(PLACEHOLDER_WRITER_AGENTS);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif">Writer agents</h2>
          <p className="text-sm text-muted-foreground font-light mt-1">
            Agents that turn ingested headlines into long-form blog posts.
          </p>
        </div>
        <Button
          disabled
          className="rounded-none text-xs uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90"
        >
          <PenLine className="w-3.5 h-3.5" /> New writer agent
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
                  No writer agents configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
      {section === "writers" && <WriterAgentsTab />}
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
