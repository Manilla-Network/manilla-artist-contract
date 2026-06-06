import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, FileText, Music, Users, Building2, MessageSquare, RefreshCw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getQueueOverview } from "@/lib/admin-queues.functions";

type Overview = {
  contracts: number;
  releases: number;
  verification: number;
  labels: number;
  support: number;
};

type QueueCardProps = {
  title: string;
  count: number;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
};

function QueueCard({ title, count, icon, color, onClick }: QueueCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-border bg-card p-4 text-left hover:border-primary/40 transition-all cursor-pointer"
    >
      <div className="flex items-center justify-between mb-3">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
          {icon}
        </span>
        {count > 0 && (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-foreground">{count}</p>
      <p className="text-sm text-muted-foreground mt-0.5">{title}</p>
      <p className="text-xs text-primary mt-1 font-medium">
        {count === 0 ? "All clear" : `${count} pending review`}
      </p>
    </button>
  );
}

export function OverviewTab({ onTabChange }: { onTabChange: (tab: string) => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const callGetOverview = useServerFn(getQueueOverview);

  async function load() {
    setLoading(true);
    try {
      const res = await callGetOverview({ data: {} });
      setOverview(res as Overview);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const totalPending = overview
    ? overview.contracts + overview.releases + overview.verification + overview.labels + overview.support
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Operations Overview</h2>
          <p className="text-sm text-muted-foreground">Real-time view of all platform queues</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {!loading && overview && (
        <>
          <div className={`rounded-xl border p-4 flex items-center gap-3 ${totalPending === 0 ? "border-green-200 bg-green-50" : "border-orange-200 bg-orange-50"}`}>
            <TrendingUp className={`h-5 w-5 shrink-0 ${totalPending === 0 ? "text-green-600" : "text-orange-600"}`} />
            <div>
              <p className={`font-bold ${totalPending === 0 ? "text-green-800" : "text-orange-800"}`}>
                {totalPending === 0 ? "All queues clear — no pending items" : `${totalPending} item${totalPending !== 1 ? "s" : ""} across all queues need attention`}
              </p>
              <p className={`text-xs ${totalPending === 0 ? "text-green-600" : "text-orange-600"}`}>
                Click any queue to start processing
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <QueueCard
              title="Contract Approvals"
              count={overview.contracts}
              icon={<FileText className="h-4 w-4 text-white" />}
              color="bg-blue-500"
              onClick={() => onTabChange("contracts")}
            />
            <QueueCard
              title="Release Queue"
              count={overview.releases}
              icon={<Music className="h-4 w-4 text-white" />}
              color="bg-purple-500"
              onClick={() => onTabChange("releases")}
            />
            <QueueCard
              title="Artist Verification"
              count={overview.verification}
              icon={<Users className="h-4 w-4 text-white" />}
              color="bg-green-500"
              onClick={() => onTabChange("artists")}
            />
            <QueueCard
              title="Label Approvals"
              count={overview.labels}
              icon={<Building2 className="h-4 w-4 text-white" />}
              color="bg-orange-500"
              onClick={() => onTabChange("labels")}
            />
            <QueueCard
              title="Support Tickets"
              count={overview.support}
              icon={<MessageSquare className="h-4 w-4 text-white" />}
              color="bg-red-500"
              onClick={() => onTabChange("support")}
            />
          </div>
        </>
      )}
    </div>
  );
}
