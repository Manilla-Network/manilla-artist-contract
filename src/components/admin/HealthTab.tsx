import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Database, HardDrive, Shield, Mail, Cpu, Link, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSystemHealth, type HealthCheck, type HealthStatus } from "@/lib/health.functions";

const STATUS_COLORS: Record<HealthStatus, string> = {
  ok: "text-green-600 bg-green-50 border-green-200",
  degraded: "text-yellow-600 bg-yellow-50 border-yellow-200",
  error: "text-red-600 bg-red-50 border-red-200",
  unknown: "text-gray-500 bg-gray-50 border-gray-200",
};

const STATUS_ICONS: Record<HealthStatus, React.ReactNode> = {
  ok: <CheckCircle2 className="h-4 w-4 text-green-600" />,
  degraded: <AlertTriangle className="h-4 w-4 text-yellow-600" />,
  error: <XCircle className="h-4 w-4 text-red-600" />,
  unknown: <AlertTriangle className="h-4 w-4 text-gray-400" />,
};

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  Database: <Database className="h-5 w-5" />,
  Storage: <HardDrive className="h-5 w-5" />,
  Auth: <Shield className="h-5 w-5" />,
  Email: <Mail className="h-5 w-5" />,
  Queues: <Cpu className="h-5 w-5" />,
  Fanlinks: <Link className="h-5 w-5" />,
  Contracts: <FileText className="h-5 w-5" />,
};

export function HealthTab() {
  const [result, setResult] = useState<{ status: HealthStatus; checks: HealthCheck[]; checked_at: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const callGetHealth = useServerFn(getSystemHealth);

  async function load() {
    setLoading(true);
    try {
      const res = await callGetHealth({ data: {} });
      setResult(res as { status: HealthStatus; checks: HealthCheck[]; checked_at: string });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const overallOk = result?.status === "ok";
  const overallDegraded = result?.status === "degraded";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">System Health</h2>
          <p className="text-sm text-muted-foreground">Real-time status of all platform components</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {result && (
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${
          overallOk ? "border-green-200 bg-green-50" : overallDegraded ? "border-yellow-200 bg-yellow-50" : "border-red-200 bg-red-50"
        }`}>
          {overallOk ? <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" /> : overallDegraded ? <AlertTriangle className="h-6 w-6 text-yellow-600 shrink-0" /> : <XCircle className="h-6 w-6 text-red-600 shrink-0" />}
          <div>
            <p className={`font-bold ${overallOk ? "text-green-800" : overallDegraded ? "text-yellow-800" : "text-red-800"}`}>
              {overallOk ? "All Systems Operational" : overallDegraded ? "Some Systems Degraded" : "System Errors Detected"}
            </p>
            <p className={`text-xs ${overallOk ? "text-green-600" : overallDegraded ? "text-yellow-600" : "text-red-600"}`}>
              Last checked: {new Date(result.checked_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
          </div>
        </div>
      )}

      {loading && !result && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {result && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {result.checks.map((check) => (
            <div key={check.name} className={`rounded-xl border p-4 ${STATUS_COLORS[check.status]}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-foreground/70">{SERVICE_ICONS[check.name] ?? <Cpu className="h-5 w-5" />}</span>
                  <span className="font-semibold text-sm text-foreground">{check.name}</span>
                </div>
                {STATUS_ICONS[check.status]}
              </div>
              <p className="text-xs text-muted-foreground mb-2">{check.message}</p>
              {check.latency_ms !== undefined && (
                <p className="text-xs font-medium">Latency: {check.latency_ms}ms</p>
              )}
              {check.detail && (
                <div className="mt-2 space-y-0.5">
                  {Object.entries(check.detail).slice(0, 3).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs">
                      <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                      <span className="font-semibold">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
