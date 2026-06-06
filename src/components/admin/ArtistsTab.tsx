import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  ChevronLeft, ChevronRight, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { getVerificationQueue, processVerificationAction } from "@/lib/admin-queues.functions";

type ArtistRow = {
  id: string;
  application_id: string | null;
  verification_type: string;
  status: string;
  assigned_to: string | null;
  social_verified: boolean;
  created_at: string;
  verified_at: string | null;
  contract_id: string | null;
  artist: { legal_name: string; stage_name: string; email: string } | null;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  verified: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  manual_review: "bg-purple-100 text-purple-800",
};

export function ArtistsTab() {
  const [rows, setRows] = useState<ArtistRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<ArtistRow | null>(null);
  const [note, setNote] = useState("");
  const [acting, setActing] = useState(false);
  const LIMIT = 25;

  const callGetQueue = useServerFn(getVerificationQueue);
  const callAction = useServerFn(processVerificationAction);

  const load = useCallback(async (pg: number, status: string) => {
    setLoading(true);
    try {
      const res = await callGetQueue({ data: { page: pg, limit: LIMIT, status: status !== "all" ? status : undefined } });
      setRows((res as { rows: ArtistRow[] }).rows);
      setTotal((res as { total: number }).total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load verification queue");
    } finally {
      setLoading(false);
    }
  }, [callGetQueue]);

  useEffect(() => { load(page, statusFilter); }, [page, statusFilter, load]);

  async function doAction(action: "verify" | "fail" | "manual_review" | "note") {
    if (!selectedId) return;
    setActing(true);
    try {
      await callAction({ data: { id: selectedId, action, note: note || undefined } });
      toast.success(action === "verify" ? "Artist verified — contract activated" : `Action "${action}" applied`);
      setNote("");
      load(page, statusFilter);
      // Update selected row's status inline
      setSelectedRow((r) => r ? { ...r, status: action === "verify" ? "verified" : action === "fail" ? "failed" : action === "manual_review" ? "manual_review" : r.status } : r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActing(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Artist Verification</h2>
          <p className="text-sm text-muted-foreground">Verify artist identity and activate contracts</p>
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(v) => { setPage(1); setStatusFilter(v); }}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="manual_review">Manual Review</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => load(page, statusFilter)} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                {["Artist", "Email", "Type", "Status", "Social", "Submitted"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && <tr><td colSpan={6} className="px-4 py-12 text-center"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground text-sm">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No artists in this verification state
                </td></tr>
              )}
              {!loading && rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/20 cursor-pointer transition" onClick={() => { setSelectedId(r.id); setSelectedRow(r); }}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.artist?.stage_name ?? r.artist?.legal_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.artist?.legal_name ?? r.application_id ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{r.artist?.email ?? "—"}</td>
                  <td className="px-4 py-3 text-xs capitalize">{r.verification_type}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {r.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.social_verified
                      ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                      : <XCircle className="h-4 w-4 text-muted-foreground/40" />}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="border-t border-border px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{total} total</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-xs px-2">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedId} onOpenChange={(o) => { if (!o) { setSelectedId(null); setSelectedRow(null); } }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-4"><SheetTitle>Artist Verification</SheetTitle></SheetHeader>
          {selectedRow && (
            <div className="space-y-5">
              <div>
                <p className="font-bold text-base">{selectedRow.artist?.stage_name ?? selectedRow.artist?.legal_name ?? "Artist"}</p>
                <p className="text-xs text-muted-foreground">{selectedRow.artist?.email}</p>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold mt-1 ${STATUS_COLORS[selectedRow.status] ?? ""}`}>{selectedRow.status.replace("_", " ")}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><p className="text-muted-foreground">Legal Name</p><p className="font-semibold">{selectedRow.artist?.legal_name ?? "—"}</p></div>
                <div><p className="text-muted-foreground">Type</p><p className="font-semibold capitalize">{selectedRow.verification_type}</p></div>
                <div><p className="text-muted-foreground">Social Verified</p><p className="font-semibold">{selectedRow.social_verified ? "Yes" : "No"}</p></div>
                <div><p className="text-muted-foreground">Application</p><p className="font-semibold">{selectedRow.application_id ?? "—"}</p></div>
              </div>
              <Separator />
              <div className="space-y-3">
                <p className="font-semibold text-sm">Actions</p>
                <div className="space-y-2">
                  <Label className="text-xs">Note</Label>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note…" rows={2} className="resize-none text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["verify", "fail", "manual_review", "note"] as const).map((action) => (
                    <button key={action} type="button" disabled={acting} onClick={() => doAction(action)}
                      className={`h-9 rounded-lg border text-xs font-semibold transition disabled:opacity-40 capitalize ${
                        action === "verify" ? "border-green-300 text-green-700 hover:bg-green-50"
                        : action === "fail" ? "border-red-300 text-red-700 hover:bg-red-50"
                        : "border-border hover:border-primary/50 hover:bg-primary/5"
                      }`}>
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
