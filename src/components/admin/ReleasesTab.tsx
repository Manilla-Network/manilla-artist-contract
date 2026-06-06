import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2, Search, RefreshCw, Music, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, Clock, Link,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  getReleaseQueue, getReleaseDetail, processReleaseAction, getReleaseQueueStats,
} from "@/lib/admin-queues.functions";

type Release = {
  id: string;
  release_id: string;
  application_id: string | null;
  release_title: string;
  release_type: string | null;
  genre: string | null;
  status: string;
  assigned_to: string | null;
  submitted_at: string;
  fanlink_url: string | null;
  artwork_url: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  under_review: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  changes_requested: "bg-orange-100 text-orange-800",
  live: "bg-emerald-100 text-emerald-800",
};

export function ReleasesTab() {
  const [rows, setRows] = useState<Release[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState({ search: "", status: "all" });
  const [draftSearch, setDraftSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ release: Record<string, unknown>; audit: unknown[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [note, setNote] = useState("");
  const [acting, setActing] = useState(false);
  const LIMIT = 25;

  const callGetQueue = useServerFn(getReleaseQueue);
  const callGetDetail = useServerFn(getReleaseDetail);
  const callAction = useServerFn(processReleaseAction);
  const callGetStats = useServerFn(getReleaseQueueStats);

  const load = useCallback(async (pg: number, f: typeof filters) => {
    setLoading(true);
    try {
      const [queueRes, statsRes] = await Promise.all([
        callGetQueue({ data: { page: pg, limit: LIMIT, search: f.search || undefined, status: f.status !== "all" ? f.status : undefined } }),
        callGetStats({ data: {} }),
      ]);
      setRows((queueRes as { rows: Release[] }).rows);
      setTotal((queueRes as { total: number }).total);
      setStats(statsRes as Record<string, number>);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load releases");
    } finally {
      setLoading(false);
    }
  }, [callGetQueue, callGetStats]);

  useEffect(() => { load(page, filters); }, [page, filters, load]);

  async function openDetail(id: string) {
    setSelectedId(id);
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await callGetDetail({ data: { id } });
      setDetail(res as { release: Record<string, unknown>; audit: unknown[] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load release");
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function doAction(action: "approve" | "reject" | "request_changes" | "escalate" | "note") {
    if (!selectedId) return;
    setActing(true);
    try {
      const res = await callAction({ data: { id: selectedId, action, note: note || undefined } });
      const r = res as { success: boolean; new_status: string; fanlink_url: string | null };
      toast.success(action === "approve" ? `Release approved${r.fanlink_url ? ` · fanlink: ${r.fanlink_url}` : ""}` : `Action "${action}" applied`);
      setNote("");
      load(page, filters);
      const refreshed = await callGetDetail({ data: { id: selectedId } });
      setDetail(refreshed as { release: Record<string, unknown>; audit: unknown[] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActing(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const release = detail?.release;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Release Queue</h2>
          <p className="text-sm text-muted-foreground">Review and approve artist releases for distribution</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(page, filters)} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { key: "pending", label: "Pending" },
          { key: "under_review", label: "Under Review" },
          { key: "approved", label: "Approved" },
          { key: "rejected", label: "Rejected" },
          { key: "changes_requested", label: "Changes" },
          { key: "live", label: "Live" },
        ].map(({ key, label }) => (
          <div key={key} className="rounded-xl border border-border bg-card p-3 text-center cursor-pointer hover:border-primary/40 transition" onClick={() => setFilters({ ...filters, status: key })}>
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
            }} placeholder="Title, release ID, application ID…" className="h-9 pl-9" />
          </div>
        </div>
        <div className="w-40 space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="under_review">Under Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="changes_requested">Changes Requested</SelectItem>
              <SelectItem value="live">Live</SelectItem>
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
                {["Release ID", "Title", "Type", "Genre", "Status", "Fanlink", "Submitted"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && <tr><td colSpan={7} className="px-4 py-12 text-center"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                  <Music className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No releases in this queue
                </td></tr>
              )}
              {!loading && rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/20 cursor-pointer transition" onClick={() => openDetail(r.id)}>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.release_id}</td>
                  <td className="px-4 py-3 font-medium">{r.release_title}</td>
                  <td className="px-4 py-3 text-xs capitalize">{r.release_type ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">{r.genre ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {r.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.fanlink_url
                      ? <a href={r.fanlink_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-primary flex items-center gap-1 hover:underline"><Link className="h-3 w-3" />View</a>
                      : <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.submitted_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="border-t border-border px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{total} total releases</span>
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
          <SheetHeader className="mb-4"><SheetTitle>Release Detail</SheetTitle></SheetHeader>
          {detailLoading && <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
          {!detailLoading && release && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                {(release.artwork_url as string) && (
                  <img src={release.artwork_url as string} alt="" className="h-16 w-16 rounded-lg object-cover border border-border shrink-0" />
                )}
                <div>
                  <p className="font-bold text-base">{release.release_title as string}</p>
                  <p className="text-xs font-mono text-muted-foreground">{release.release_id as string}</p>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold mt-1 ${STATUS_COLORS[release.status as string] ?? ""}`}>{(release.status as string).replace("_", " ")}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  ["Type", release.release_type],
                  ["Genre", release.genre],
                  ["Application", release.application_id],
                  ["Assigned To", release.assigned_to],
                  ["Reviewed By", release.reviewed_by],
                  ["Fanlink", release.fanlink_url],
                ].map(([k, v]) => v ? (
                  <div key={k as string}><p className="text-muted-foreground">{k as string}</p><p className="font-semibold truncate">{v as string}</p></div>
                ) : null)}
              </div>

              <Separator />
              <div className="space-y-3">
                <p className="font-semibold text-sm">Review Actions</p>
                <div className="space-y-2">
                  <Label className="text-xs">Internal Note</Label>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add note…" rows={2} className="resize-none text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["approve", "reject", "request_changes", "escalate", "note"] as const).map((action) => (
                    <button key={action} type="button" disabled={acting} onClick={() => doAction(action)}
                      className={`h-9 rounded-lg border text-xs font-semibold transition disabled:opacity-40 capitalize ${
                        action === "approve" ? "border-green-300 text-green-700 hover:bg-green-50"
                        : action === "reject" ? "border-red-300 text-red-700 hover:bg-red-50"
                        : "border-border hover:border-primary/50 hover:bg-primary/5"
                      }`}>
                      {acting ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : action.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>

              {Array.isArray(detail?.audit) && detail.audit.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="font-semibold text-sm">Audit Trail</p>
                    {(detail.audit as Record<string, unknown>[]).slice(0, 10).map((a) => (
                      <div key={a.id as string} className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
                        <div className="flex justify-between gap-2">
                          <span className="font-semibold">{a.event as string}</span>
                          <span className="text-muted-foreground">{new Date(a.created_at as string).toLocaleDateString("en-GB")}</span>
                        </div>
                        <div className="text-muted-foreground mt-0.5">{a.actor as string}{(a.note as string) ? ` — ${a.note}` : ""}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
