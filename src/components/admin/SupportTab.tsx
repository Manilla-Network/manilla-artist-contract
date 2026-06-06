import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2, Search, RefreshCw, AlertTriangle, CheckCircle2, Clock,
  ChevronLeft, ChevronRight, XCircle, MessageSquare, User, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { getSupportTickets, getSupportTicketDetail, processSupportAction, getSupportStats } from "@/lib/support.functions";

type Ticket = {
  id: string;
  ticket_number: string;
  type: string;
  priority: string;
  subject: string;
  reporter_email: string;
  reporter_name: string | null;
  status: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-gray-100 text-gray-700",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  in_progress: "bg-purple-100 text-purple-800",
  waiting: "bg-yellow-100 text-yellow-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-700",
};

export function SupportTab() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState({ search: "", status: "all", priority: "all" });
  const [draftSearch, setDraftSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ ticket: Record<string, unknown>; artist: Record<string, unknown> | null; audit: unknown[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionNote, setActionNote] = useState("");
  const [acting, setActing] = useState(false);
  const LIMIT = 25;

  const callGetTickets = useServerFn(getSupportTickets);
  const callGetDetail = useServerFn(getSupportTicketDetail);
  const callAction = useServerFn(processSupportAction);
  const callGetStats = useServerFn(getSupportStats);

  const load = useCallback(async (pg: number, f: typeof filters) => {
    setLoading(true);
    try {
      const [ticketsRes, statsRes] = await Promise.all([
        callGetTickets({ data: { page: pg, limit: LIMIT, search: f.search || undefined, status: f.status !== "all" ? f.status : undefined, priority: f.priority !== "all" ? f.priority : undefined } }),
        callGetStats({ data: {} }),
      ]);
      setTickets((ticketsRes as { rows: Ticket[] }).rows);
      setTotal((ticketsRes as { total: number }).total);
      setStats(statsRes as Record<string, number>);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, [callGetTickets, callGetStats]);

  useEffect(() => { load(page, filters); }, [page, filters, load]);

  async function openDetail(id: string) {
    setSelectedId(id);
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await callGetDetail({ data: { id } });
      setDetail(res as { ticket: Record<string, unknown>; artist: Record<string, unknown> | null; audit: unknown[] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load ticket");
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function doAction(action: "in_progress" | "waiting" | "resolve" | "close" | "escalate") {
    if (!selectedId) return;
    setActing(true);
    try {
      await callAction({ data: { id: selectedId, action, note: actionNote || undefined, resolution: action === "resolve" ? actionNote || undefined : undefined } });
      toast.success(`Ticket ${action === "resolve" ? "resolved" : action === "close" ? "closed" : "updated"}`);
      setActionNote("");
      load(page, filters);
      const refreshed = await callGetDetail({ data: { id: selectedId } });
      setDetail(refreshed as { ticket: Record<string, unknown>; artist: Record<string, unknown> | null; audit: unknown[] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActing(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const ticket = detail?.ticket;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Support Queue</h2>
          <p className="text-sm text-muted-foreground">Manage artist and platform support requests</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(page, filters)} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { key: "open", label: "Open" },
          { key: "in_progress", label: "In Progress" },
          { key: "waiting", label: "Waiting" },
          { key: "resolved", label: "Resolved" },
          { key: "critical", label: "Critical" },
          { key: "high", label: "High" },
        ].map(({ key, label }) => (
          <div key={key} className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold">{stats[key] ?? 0}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px] space-y-1">
          <Label className="text-xs">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input value={draftSearch} onChange={(e) => {
              setDraftSearch(e.target.value);
              setTimeout(() => setFilters((f) => ({ ...f, search: e.target.value })), 400);
            }} placeholder="Search tickets…" className="h-9 pl-9" />
          </div>
        </div>
        <div className="w-36 space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="waiting">Waiting</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-36 space-y-1">
          <Label className="text-xs">Priority</Label>
          <Select value={filters.priority} onValueChange={(v) => setFilters((f) => ({ ...f, priority: v }))}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">Ticket</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">Subject</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">Priority</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">Assigned</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr><td colSpan={6} className="px-4 py-12 text-center"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></td></tr>
              )}
              {!loading && tickets.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground text-sm">No tickets found. All clear! 🎉</td></tr>
              )}
              {!loading && tickets.map((t) => (
                <tr key={t.id} className="hover:bg-muted/20 cursor-pointer transition" onClick={() => openDetail(t.id)}>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.ticket_number}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{t.subject}</div>
                    <div className="text-xs text-muted-foreground">{t.reporter_email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${PRIORITY_COLORS[t.priority] ?? "bg-gray-100 text-gray-700"}`}>
                      {t.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_COLORS[t.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {t.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{t.assigned_to ? <span className="font-semibold text-foreground">{t.assigned_to.split("@")[0]}</span> : <span className="text-muted-foreground/50">Unassigned</span>}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="border-t border-border px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{total} total tickets</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-xs px-2">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedId} onOpenChange={(o) => { if (!o) setSelectedId(null); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Support Ticket</SheetTitle>
          </SheetHeader>
          {detailLoading && <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
          {!detailLoading && ticket && (
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-base">{ticket.subject as string}</p>
                  <p className="text-xs font-mono text-muted-foreground">{ticket.ticket_number as string}</p>
                </div>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${PRIORITY_COLORS[ticket.priority as string] ?? ""}`}>{ticket.priority as string}</span>
              </div>
              <div className="rounded-xl border border-border p-4 space-y-2 text-sm">
                <p className="font-semibold text-muted-foreground">Description</p>
                <p className="text-foreground whitespace-pre-wrap">{ticket.description as string}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><p className="text-muted-foreground">Reporter</p><p className="font-semibold">{ticket.reporter_email as string}</p></div>
                <div><p className="text-muted-foreground">Type</p><p className="font-semibold capitalize">{ticket.type as string}</p></div>
                <div><p className="text-muted-foreground">Status</p><span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_COLORS[ticket.status as string] ?? ""}`}>{(ticket.status as string).replace("_", " ")}</span></div>
                <div><p className="text-muted-foreground">Assigned To</p><p className="font-semibold">{(ticket.assigned_to as string) ?? "—"}</p></div>
              </div>
              <Separator />
              <div className="space-y-3">
                <p className="font-semibold text-sm">Actions</p>
                <div className="space-y-2">
                  <Label className="text-xs">Note / Resolution</Label>
                  <Textarea value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder="Add a note or resolution…" rows={3} className="resize-none text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["in_progress", "waiting", "resolve", "close", "escalate"] as const).map((action) => (
                    <button key={action} type="button" disabled={acting} onClick={() => doAction(action)}
                      className="h-9 rounded-lg border border-border text-xs font-semibold hover:border-primary/50 hover:bg-primary/5 transition disabled:opacity-40 capitalize">
                      {acting ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : action.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
