import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2, Search, RefreshCw, ChevronLeft, ChevronRight,
  Eye, Send, CheckCircle2, XCircle, Clock, Users, FileText,
  BarChart3, LogOut, Shield, Download, History, User, Music, Globe,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getAdminApplications, getAdminStats, getApplicationDetail,
  updateApplicationStatus, resendArtistContract, getAdminCountries,
  STATUS_LABELS, STATUS_COLORS, STATUS_VALUES, type AppStatus,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast, Toaster } from "sonner";
import logo from "@/assets/manilla-logo.png";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Manilla Collective — Admin Dashboard" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type AppRow = {
  id: string;
  application_id: string | null;
  legal_name: string;
  stage_name: string;
  email: string;
  country: string | null;
  genre: string | null;
  status: string;
  signed_at: string;
  artist_photo_url: string | null;
};

type AuditRow = {
  id: string;
  event: string;
  actor: string | null;
  old_value: string | null;
  new_value: string | null;
  metadata: Record<string, string>;
  created_at: string;
};

type ApplicationDetail = Record<string, unknown>;

type Filters = {
  search: string;
  status: string;
  country: string;
  from_date: string;
  to_date: string;
};

// ── Admin page entry ──────────────────────────────────────────────────────────

function AdminPage() {
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSessionEmail(data.session.user.email ?? null);
        setSessionToken(data.session.access_token);
      }
      setAuthChecking(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setSessionEmail(session?.user.email ?? null);
      setSessionToken(session?.access_token ?? null);
      setAccessDenied(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleAdminError = useCallback((err: Error) => {
    if (err.message.includes("Access denied")) {
      setAccessDenied(true);
    } else {
      toast.error(err.message);
    }
  }, []);

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!sessionEmail || !sessionToken) {
    return <AdminLogin />;
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Toaster richColors position="top-center" />
        <div className="max-w-sm w-full text-center space-y-4">
          <Shield className="mx-auto h-14 w-14 text-destructive opacity-60" />
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground text-sm">
            <strong className="text-foreground">{sessionEmail}</strong> is not an administrator.
          </p>
          <Button
            variant="outline"
            onClick={() => supabase.auth.signOut()}
            className="w-full"
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <AdminDashboard
      sessionToken={sessionToken}
      sessionEmail={sessionEmail}
      onAdminError={handleAdminError}
    />
  );
}

// ── Admin login ───────────────────────────────────────────────────────────────

function AdminLogin() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function sendOtp() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid email address");
      return;
    }
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    setSent(true);
    setResendIn(60);
    toast.success(`Code sent to ${email}`);
  }

  async function verify(code?: string) {
    const c = (code ?? otp).trim();
    if (c.length !== 6) { toast.error("Enter the 6-digit code"); return; }
    setVerifying(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: c,
      type: "email",
    });
    setVerifying(false);
    if (error) { toast.error(error.message); setOtp(""); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Toaster richColors position="top-center" />
      <div className="max-w-sm w-full space-y-6">
        <div className="text-center space-y-3">
          <img src={logo} alt="Manilla" className="mx-auto h-14 w-14" />
          <div>
            <p className="text-xs font-bold tracking-[0.3em] text-primary uppercase">Manilla Collective</p>
            <h1 className="text-2xl font-bold mt-1">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in to manage artist applications.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 space-y-4" style={{ boxShadow: "var(--shadow-card)" }}>
          {!sent ? (
            <>
              <div className="space-y-2">
                <Label>Admin email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@manilla.network"
                  className="h-12"
                  onKeyDown={(e) => e.key === "Enter" && sendOtp()}
                />
              </div>
              <button
                type="button"
                onClick={sendOtp}
                disabled={sending}
                className="w-full h-12 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: "var(--gradient-sunset)" }}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                Send verification code
              </button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label>6-digit code sent to <span className="font-semibold text-foreground">{email}</span></Label>
                <InputOTP
                  maxLength={6}
                  value={otp}
                  onChange={(v) => { setOtp(v); if (v.length === 6) verify(v); }}
                >
                  <InputOTPGroup>
                    {[0,1,2,3,4,5].map((i) => (
                      <InputOTPSlot key={i} index={i} className="h-12 w-10 text-lg" />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <button
                type="button"
                onClick={() => verify()}
                disabled={verifying || otp.length !== 6}
                className="w-full h-12 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: "var(--gradient-sunset)" }}
              >
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                Sign in to dashboard
              </button>
              <div className="flex justify-between text-xs">
                <button type="button" onClick={() => setSent(false)} className="text-muted-foreground hover:text-primary">
                  ← Change email
                </button>
                <button
                  type="button"
                  disabled={resendIn > 0 || sending}
                  onClick={sendOtp}
                  className="font-semibold text-primary disabled:text-muted-foreground"
                >
                  {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

function AdminDashboard({
  sessionToken, sessionEmail, onAdminError,
}: {
  sessionToken: string;
  sessionEmail: string;
  onAdminError: (e: Error) => void;
}) {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<AppRow[]>([]);
  const [total, setTotal] = useState(0);
  const [countries, setCountries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const LIMIT = 25;

  const [filters, setFilters] = useState<Filters>({
    search: "", status: "all", country: "", from_date: "", to_date: "",
  });
  const [draftSearch, setDraftSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ application: ApplicationDetail; audit: AuditRow[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusNote, setStatusNote] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [resending, setResending] = useState(false);

  const callGetApplications = useServerFn(getAdminApplications);
  const callGetStats = useServerFn(getAdminStats);
  const callGetDetail = useServerFn(getApplicationDetail);
  const callUpdateStatus = useServerFn(updateApplicationStatus);
  const callResendContract = useServerFn(resendArtistContract);
  const callGetCountries = useServerFn(getAdminCountries);

  const loadData = useCallback(
    async (pg: number, f: Filters) => {
      setLoading(true);
      try {
        const [appsRes, statsRes] = await Promise.all([
          callGetApplications({
            data: {
              page: pg,
              limit: LIMIT,
              search: f.search || undefined,
              status: f.status as "all" | AppStatus,
              country: f.country || undefined,
              from_date: f.from_date || undefined,
              to_date: f.to_date || undefined,
            },
          }),
          callGetStats({ data: {} }),
        ]);
        setRows(appsRes.rows as AppRow[]);
        setTotal(appsRes.total);
        setStats(statsRes);
      } catch (e) {
        if (e instanceof Error) onAdminError(e);
      } finally {
        setLoading(false);
      }
    },
    [callGetApplications, callGetStats, onAdminError],
  );

  useEffect(() => {
    callGetCountries({ data: {} })
      .then(setCountries)
      .catch(() => {});
  }, [callGetCountries]);

  useEffect(() => {
    loadData(page, filters);
  }, [page, filters, loadData]);

  function handleSearchChange(val: string) {
    setDraftSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      setFilters((f) => ({ ...f, search: val }));
    }, 400);
  }

  async function openDetail(id: string) {
    setSelectedId(id);
    setDetailLoading(true);
    setDetail(null);
    setStatusNote("");
    try {
      const res = await callGetDetail({ data: { id } });
      setDetail(res as { application: ApplicationDetail; audit: AuditRow[] });
    } catch (e) {
      if (e instanceof Error) onAdminError(e);
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function changeStatus(newStatus: AppStatus) {
    if (!selectedId) return;
    setUpdatingStatus(true);
    try {
      await callUpdateStatus({ data: { id: selectedId, status: newStatus, note: statusNote } });
      toast.success(`Status updated to "${STATUS_LABELS[newStatus]}"`);
      setStatusNote("");
      setRows((prev) =>
        prev.map((r) => (r.id === selectedId ? { ...r, status: newStatus } : r)),
      );
      if (detail) {
        setDetail({
          ...detail,
          application: { ...detail.application, status: newStatus },
        });
      }
      // Reload audit
      const refreshed = await callGetDetail({ data: { id: selectedId } });
      setDetail(refreshed as { application: ApplicationDetail; audit: AuditRow[] });
      loadData(page, filters);
    } catch (e) {
      if (e instanceof Error) toast.error(e.message);
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function doResend() {
    if (!selectedId) return;
    setResending(true);
    try {
      await callResendContract({ data: { id: selectedId } });
      toast.success("Contract resent successfully");
      const refreshed = await callGetDetail({ data: { id: selectedId } });
      setDetail(refreshed as { application: ApplicationDetail; audit: AuditRow[] });
    } catch (e) {
      if (e instanceof Error) toast.error(e.message);
    } finally {
      setResending(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const app = detail?.application;

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-center" />

      {/* Top nav */}
      <header className="border-b border-border bg-card sticky top-0 z-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Manilla" className="h-8 w-8" />
            <div>
              <span className="font-bold text-sm tracking-wide">Manilla Collective</span>
              <span className="ml-2 text-xs text-muted-foreground">Admin</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-xs text-muted-foreground">{sessionEmail}</span>
            <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()} className="gap-1.5">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard label="Total" value={stats.total ?? 0} icon={<Users className="h-4 w-4" />} accent />
          {(["submitted","under_review","approved","rejected","contract_sent","active"] as AppStatus[]).map((s) => (
            <StatCard
              key={s}
              label={STATUS_LABELS[s]}
              value={stats[s] ?? 0}
              onClick={() => { setPage(1); setFilters((f) => ({ ...f, status: s })); }}
              active={filters.status === s}
            />
          ))}
        </div>

        {/* Filter bar */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px] space-y-1">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={draftSearch}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Name, email, app ID…"
                  className="h-9 pl-9"
                />
              </div>
            </div>

            <div className="w-36 space-y-1">
              <Label className="text-xs">Status</Label>
              <Select
                value={filters.status}
                onValueChange={(v) => { setPage(1); setFilters((f) => ({ ...f, status: v })); }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUS_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {countries.length > 0 && (
              <div className="w-36 space-y-1">
                <Label className="text-xs">Country</Label>
                <Select
                  value={filters.country || "all"}
                  onValueChange={(v) => { setPage(1); setFilters((f) => ({ ...f, country: v === "all" ? "" : v })); }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All countries" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All countries</SelectItem>
                    {countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={filters.from_date}
                onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, from_date: e.target.value })); }}
                className="h-9 w-36"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={filters.to_date}
                onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, to_date: e.target.value })); }}
                className="h-9 w-36"
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => {
                setDraftSearch("");
                setPage(1);
                setFilters({ search: "", status: "all", country: "", from_date: "", to_date: "" });
              }}
            >
              <XCircle className="h-3.5 w-3.5" /> Clear
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => loadData(page, filters)}
              disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-sm">
              Applications
              <span className="ml-2 text-muted-foreground font-normal">
                {loading ? "…" : `${total} total`}
              </span>
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                  <th className="text-left px-4 py-2.5 font-semibold">App ID</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Legal Name</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Stage Name</th>
                  <th className="text-left px-4 py-2.5 font-semibold hidden md:table-cell">Email</th>
                  <th className="text-left px-4 py-2.5 font-semibold hidden lg:table-cell">Country</th>
                  <th className="text-left px-4 py-2.5 font-semibold hidden lg:table-cell">Genre</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                  <th className="text-left px-4 py-2.5 font-semibold hidden sm:table-cell">Submitted</th>
                  <th className="px-4 py-2.5 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      Loading applications…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-muted-foreground">
                      No applications found.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => openDetail(row.id)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-primary font-bold">
                        {row.application_id ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-medium">{row.legal_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.stage_name}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{row.email}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">{row.country ?? "—"}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{row.genre ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status as AppStatus} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs hidden sm:table-cell">
                        {new Date(row.signed_at).toLocaleDateString("en-GB", {
                          day: "2-digit", month: "short", year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-border flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Page {page} of {totalPages} · {total} results
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="h-8 gap-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-8 gap-1"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Detail Sheet */}
      <Sheet open={!!selectedId} onOpenChange={(o) => { if (!o) { setSelectedId(null); setDetail(null); } }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border sticky top-0 bg-card z-10">
            <SheetTitle className="text-base flex items-center gap-2">
              {detailLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <FileText className="h-4 w-4 text-primary" />
              )}
              {app
                ? `${String(app.stage_name)} — ${String(app.application_id ?? "—")}`
                : "Loading application…"}
            </SheetTitle>
            {app && (
              <SheetDescription className="flex items-center gap-3 flex-wrap mt-1">
                <StatusBadge status={String(app.status) as AppStatus} />
                <span className="text-xs text-muted-foreground">
                  Submitted {new Date(String(app.signed_at)).toLocaleString("en-GB")}
                </span>
              </SheetDescription>
            )}
          </SheetHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : app ? (
            <div className="px-6 py-4">
              <Tabs defaultValue="details">
                <TabsList className="w-full mb-4">
                  <TabsTrigger value="details" className="flex-1 gap-1.5">
                    <User className="h-3.5 w-3.5" /> Details
                  </TabsTrigger>
                  <TabsTrigger value="actions" className="flex-1 gap-1.5">
                    <Shield className="h-3.5 w-3.5" /> Actions
                  </TabsTrigger>
                  <TabsTrigger value="audit" className="flex-1 gap-1.5">
                    <History className="h-3.5 w-3.5" /> Audit Log
                  </TabsTrigger>
                </TabsList>

                {/* Details tab */}
                <TabsContent value="details" className="space-y-5 mt-0">
                  <DetailSection title="Identity" icon={<User className="h-4 w-4" />}>
                    <DetailGrid>
                      <DetailItem label="Application ID" value={String(app.application_id ?? "—")} mono />
                      <DetailItem label="Legal Name" value={String(app.legal_name)} />
                      <DetailItem label="Stage Name" value={String(app.stage_name)} />
                      <DetailItem label="Email" value={String(app.email)} />
                      <DetailItem label="Phone" value={String(app.phone ?? "—")} />
                      <DetailItem label="Date of Birth" value={String(app.date_of_birth ?? "—")} />
                      <DetailItem label="City" value={String(app.city ?? "—")} />
                      <DetailItem label="State" value={String(app.state ?? "—")} />
                      <DetailItem label="Country" value={String(app.country ?? "—")} />
                    </DetailGrid>
                  </DetailSection>

                  <DetailSection title="Artist Profile" icon={<Music className="h-4 w-4" />}>
                    <DetailGrid>
                      <DetailItem label="Genre" value={String(app.genre ?? "—")} />
                      <DetailItem label="Years Active" value={String(app.years_active ?? "—")} />
                    </DetailGrid>
                    {app.bio && (
                      <div className="mt-3 p-3 rounded-lg bg-muted/30 text-sm text-muted-foreground italic leading-relaxed">
                        {String(app.bio)}
                      </div>
                    )}
                  </DetailSection>

                  {/* Social links */}
                  {[
                    ["Spotify", app.spotify_url], ["Apple Music", app.apple_music_url],
                    ["Audiomack", app.audiomack_url], ["Boomplay", app.boomplay_url],
                    ["YouTube", app.youtube_url], ["TikTok", app.tiktok_url],
                    ["Instagram", app.instagram_url], ["Website", app.website_url],
                  ].some(([, v]) => v) && (
                    <DetailSection title="Social & Streaming" icon={<Globe className="h-4 w-4" />}>
                      <div className="space-y-1.5">
                        {[
                          ["Spotify", app.spotify_url], ["Apple Music", app.apple_music_url],
                          ["Audiomack", app.audiomack_url], ["Boomplay", app.boomplay_url],
                          ["YouTube", app.youtube_url], ["TikTok", app.tiktok_url],
                          ["Instagram", app.instagram_url], ["Website", app.website_url],
                        ]
                          .filter(([, v]) => v)
                          .map(([platform, url]) => (
                            <div key={String(platform)} className="flex justify-between items-center text-sm">
                              <span className="text-muted-foreground text-xs font-medium">{String(platform)}</span>
                              <a
                                href={String(url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline text-xs truncate max-w-[200px]"
                              >
                                {String(url).replace(/^https?:\/\//, "").slice(0, 50)}
                              </a>
                            </div>
                          ))}
                      </div>
                    </DetailSection>
                  )}

                  {/* Uploaded assets */}
                  {(app.artist_photo_url || app.press_kit_url) && (
                    <DetailSection title="Uploaded Assets" icon={<FileText className="h-4 w-4" />}>
                      <div className="space-y-2">
                        {app.artist_photo_url && (
                          <a
                            href={String(app.artist_photo_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-2.5 rounded-lg border border-border hover:border-primary/50 transition text-sm font-medium text-primary"
                          >
                            <Download className="h-4 w-4" /> Artist Photo
                          </a>
                        )}
                        {app.press_kit_url && (
                          <a
                            href={String(app.press_kit_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-2.5 rounded-lg border border-border hover:border-primary/50 transition text-sm font-medium text-primary"
                          >
                            <Download className="h-4 w-4" /> Press Kit PDF
                          </a>
                        )}
                      </div>
                    </DetailSection>
                  )}

                  {/* Signature */}
                  <DetailSection title="Signature" icon={<FileText className="h-4 w-4" />}>
                    <p className="text-xl font-serif italic" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>
                      {String(app.signature_name)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Signed: {new Date(String(app.signed_at)).toLocaleString("en-GB")}</p>
                  </DetailSection>

                  {/* Technical metadata */}
                  <DetailSection title="Submission Metadata" icon={<Shield className="h-4 w-4" />}>
                    <DetailGrid>
                      <DetailItem label="IP Hash" value={String(app.ip_hash ?? "—")} mono />
                      <DetailItem label="Timezone" value={String(app.timezone ?? "—")} />
                      <DetailItem label="Locale" value={String(app.locale ?? "—")} />
                      <DetailItem label="Screen" value={String(app.screen_resolution ?? "—")} />
                    </DetailGrid>
                    {app.user_agent && (
                      <p className="mt-2 text-xs text-muted-foreground break-all bg-muted/30 p-2 rounded">{String(app.user_agent)}</p>
                    )}
                  </DetailSection>
                </TabsContent>

                {/* Actions tab */}
                <TabsContent value="actions" className="space-y-5 mt-0">
                  <div className="rounded-xl border border-border p-4 space-y-4">
                    <h3 className="font-semibold text-sm">Change Application Status</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {(["under_review","approved","rejected","contract_sent","signed","active"] as AppStatus[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={updatingStatus || String(app.status) === s}
                          onClick={() => changeStatus(s)}
                          className={`h-10 rounded-lg border-2 text-xs font-semibold transition flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
                            String(app.status) === s
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          {updatingStatus && String(app.status) !== s ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <StatusIcon status={s} />
                          )}
                          {STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Internal note (sent in status email for approved/rejected)</Label>
                      <Textarea
                        value={statusNote}
                        onChange={(e) => setStatusNote(e.target.value)}
                        placeholder="Optional note for the artist…"
                        rows={3}
                        className="resize-none text-sm"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <h3 className="font-semibold text-sm">Contract Actions</h3>
                    <p className="text-xs text-muted-foreground">
                      Resend the signed contract PDF to the artist's email address{" "}
                      <strong className="text-foreground">{String(app.email)}</strong>.
                      This will also log a CONTRACT_RESENT audit event and set status to contract_sent.
                    </p>
                    <Button
                      onClick={doResend}
                      disabled={resending}
                      variant="outline"
                      className="w-full h-10 gap-2"
                    >
                      {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Resend signed contract PDF
                    </Button>
                  </div>
                </TabsContent>

                {/* Audit log tab */}
                <TabsContent value="audit" className="mt-0">
                  {!detail?.audit || detail.audit.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground text-sm">
                      No audit events recorded yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {detail.audit.map((event) => (
                        <AuditEventRow key={event.id} event={event} />
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, accent, onClick, active,
}: {
  label: string; value: number; icon?: React.ReactNode;
  accent?: boolean; onClick?: () => void; active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition-all ${
        active
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:border-primary/40"
      } ${onClick ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className="text-primary">{icon}</span>}
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${accent ? "text-primary" : "text-foreground"}`}>
        {value.toLocaleString()}
      </p>
    </button>
  );
}

function StatusBadge({ status }: { status: AppStatus | string }) {
  const colors = STATUS_COLORS[status as AppStatus] ?? "bg-gray-100 text-gray-800";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${colors}`}>
      {STATUS_LABELS[status as AppStatus] ?? status}
    </span>
  );
}

function StatusIcon({ status }: { status: AppStatus }) {
  switch (status) {
    case "approved": return <CheckCircle2 className="h-3 w-3" />;
    case "rejected": return <XCircle className="h-3 w-3" />;
    case "under_review": return <Clock className="h-3 w-3" />;
    case "active": return <Users className="h-3 w-3" />;
    default: return <BarChart3 className="h-3 w-3" />;
  }
}

function DetailSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="text-primary">{icon}</span>
        {title}
      </div>
      {children}
      <Separator />
    </div>
  );
}

function DetailGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">{children}</div>;
}

function DetailItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">{label}</p>
      <p className={`text-sm font-semibold text-foreground break-all ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
    </div>
  );
}

const AUDIT_EVENT_LABELS: Record<string, string> = {
  STATUS_CHANGED: "Status changed",
  CONTRACT_RESENT: "Contract resent",
  OTP_SENT: "OTP sent",
  OTP_VERIFIED: "OTP verified",
  SUBMITTED: "Application submitted",
  ADMIN_ACTION: "Admin action",
};

function AuditEventRow({ event }: { event: AuditRow }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground">
            {AUDIT_EVENT_LABELS[event.event] ?? event.event}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
            {event.actor && <span>By: <strong className="text-foreground">{event.actor}</strong></span>}
            {event.old_value && event.new_value && (
              <span>
                <span className="line-through opacity-60">{event.old_value}</span>
                {" → "}
                <strong className="text-foreground">{event.new_value}</strong>
              </span>
            )}
            {event.new_value && !event.old_value && (
              <span>To: <strong className="text-foreground">{event.new_value}</strong></span>
            )}
          </div>
          {event.metadata?.note && (
            <p className="mt-1 text-xs italic text-muted-foreground">"{event.metadata.note}"</p>
          )}
        </div>
        <time className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
          {new Date(event.created_at).toLocaleString("en-GB", {
            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
          })}
        </time>
      </div>
    </div>
  );
}
