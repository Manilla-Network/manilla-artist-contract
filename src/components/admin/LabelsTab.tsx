import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, Building2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { getLabelQueue, processLabelAction } from "@/lib/admin-queues.functions";

type LabelRow = {
  id: string;
  label_id: string;
  label_name: string;
  label_email: string;
  contact_name: string | null;
  country: string | null;
  roster_size: number | null;
  status: string;
  tier: string | null;
  assigned_to: string | null;
  submitted_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  under_review: "bg-blue-100 text-blue-800",
  due_diligence: "bg-purple-100 text-purple-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  active: "bg-emerald-100 text-emerald-800",
};

const TIER_COLORS: Record<string, string> = {
  standard: "bg-gray-100 text-gray-700",
  premium: "bg-blue-100 text-blue-800",
  enterprise: "bg-purple-100 text-purple-800",
};

export function LabelsTab() {
  const [rows, setRows] = useState<LabelRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<LabelRow | null>(null);
  const [note, setNote] = useState("");
  const [tier, setTier] = useState<"standard" | "premium" | "enterprise">("standard");
  const [acting, setActing] = useState(false);
  const LIMIT = 25;

  const callGetQueue = useServerFn(getLabelQueue);
  const callAction = useServerFn(processLabelAction);

  const load = useCallback(async (pg: number, status: string) => {
    setLoading(true);
    try {
      const res = await callGetQueue({ data: { page: pg, limit: LIMIT, status: status !== "all" ? status : undefined } });
      setRows((res as { rows: LabelRow[] }).rows);
      setTotal((res as { total: number }).total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load label queue");
    } finally {
      setLoading(false);
    }
  }, [callGetQueue]);

  useEffect(() => { load(page, statusFilter); }, [page, statusFilter, load]);

  async function doAction(action: "approve" | "reject" | "due_diligence" | "note") {
    if (!selectedId) return;
    setActing(true);
    try {
      await callAction({ data: { id: selectedId, action, note: note || undefined, tier: action === "approve" ? tier : undefined } });
      toast.success(action === "approve" ? `Label approved as ${tier}` : `Action "${action}" applied`);
      setNote("");
      load(page, statusFilter);
      setSelectedRow((r) => r ? { ...r, status: action === "approve" ? "approved" : action === "reject" ? "rejected" : action === "due_diligence" ? "due_diligence" : r.status } : r);
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
          <h2 className="text-lg font-bold">Label Queue</h2>
          <p className="text-sm text-muted-foreground">Review and onboard record labels and distributors</p>
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(v) => { setPage(1); setStatusFilter(v); }}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="under_review">Under Review</SelectItem>
              <SelectItem value="due_diligence">Due Diligence</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="active">Active</SelectItem>
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
                {["Label", "Contact", "Country", "Roster", "Tier", "Status", "Submitted"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && <tr><td colSpan={7} className="px-4 py-12 text-center"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                  <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No labels in this queue
                </td></tr>
              )}
              {!loading && rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/20 cursor-pointer transition" onClick={() => { setSelectedId(r.id); setSelectedRow(r); }}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.label_name}</div>
                    <div className="text-xs text-muted-foreground">{r.label_email}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{r.contact_name ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">{r.country ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">{r.roster_size ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    {r.tier
                      ? <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${TIER_COLORS[r.tier] ?? ""}`}>{r.tier}</span>
                      : <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {r.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.submitted_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="border-t border-border px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{total} total labels</span>
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
          <SheetHeader className="mb-4"><SheetTitle>Label Review</SheetTitle></SheetHeader>
          {selectedRow && (
            <div className="space-y-5">
              <div>
                <p className="font-bold text-base">{selectedRow.label_name}</p>
                <p className="text-xs text-muted-foreground">{selectedRow.label_email}</p>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold mt-1 ${STATUS_COLORS[selectedRow.status] ?? ""}`}>{selectedRow.status.replace("_", " ")}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><p className="text-muted-foreground">Contact</p><p className="font-semibold">{selectedRow.contact_name ?? "—"}</p></div>
                <div><p className="text-muted-foreground">Country</p><p className="font-semibold">{selectedRow.country ?? "—"}</p></div>
                <div><p className="text-muted-foreground">Roster Size</p><p className="font-semibold">{selectedRow.roster_size ?? "—"}</p></div>
                <div><p className="text-muted-foreground">Label ID</p><p className="font-semibold font-mono">{selectedRow.label_id}</p></div>
              </div>
              <Separator />
              <div className="space-y-3">
                <p className="font-semibold text-sm">Actions</p>
                <div className="space-y-2">
                  <Label className="text-xs">Tier (for approval)</Label>
                  <Select value={tier} onValueChange={(v) => setTier(v as typeof tier)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="premium">Premium</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Note</Label>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note…" rows={2} className="resize-none text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["approve", "reject", "due_diligence", "note"] as const).map((action) => (
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
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
