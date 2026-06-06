import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, RefreshCw, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { getFeatureFlags, setFeatureFlag, createFeatureFlag, deleteFeatureFlag } from "@/lib/feature-flags.functions";

type Flag = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  rollout_pct: number;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export function FeatureFlagsTab() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newFlag, setNewFlag] = useState({ key: "", name: "", description: "", enabled: false, rollout_pct: 0 });

  const callGetFlags = useServerFn(getFeatureFlags);
  const callSetFlag = useServerFn(setFeatureFlag);
  const callCreateFlag = useServerFn(createFeatureFlag);
  const callDeleteFlag = useServerFn(deleteFeatureFlag);

  async function load() {
    setLoading(true);
    try {
      const res = await callGetFlags({ data: {} });
      setFlags(res as Flag[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load flags");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function toggle(flag: Flag) {
    setToggling(flag.key);
    try {
      await callSetFlag({ data: { key: flag.key, enabled: !flag.enabled } });
      setFlags((prev) => prev.map((f) => f.key === flag.key ? { ...f, enabled: !f.enabled } : f));
      toast.success(`${flag.name} ${!flag.enabled ? "enabled" : "disabled"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to toggle flag");
    } finally {
      setToggling(null);
    }
  }

  async function handleCreate() {
    if (!newFlag.key || !newFlag.name) { toast.error("Key and name are required"); return; }
    setCreating(true);
    try {
      await callCreateFlag({ data: { key: newFlag.key, name: newFlag.name, description: newFlag.description, enabled: newFlag.enabled, rollout_pct: newFlag.rollout_pct } });
      toast.success(`Feature flag "${newFlag.name}" created`);
      setShowCreate(false);
      setNewFlag({ key: "", name: "", description: "", enabled: false, rollout_pct: 0 });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create flag");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(key: string) {
    if (!confirm(`Delete flag "${key}"? This cannot be undone.`)) return;
    try {
      await callDeleteFlag({ data: { key } });
      setFlags((prev) => prev.filter((f) => f.key !== key));
      toast.success("Flag deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete flag");
    }
  }

  const CORE_FEATURES = ["publishing", "radio", "loop", "voice", "ads", "release_queue", "label_portal", "analytics", "royalties", "fanlinks"];

  const coreFlags = flags.filter((f) => CORE_FEATURES.includes(f.key));
  const customFlags = flags.filter((f) => !CORE_FEATURES.includes(f.key));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Feature Flags</h2>
          <p className="text-sm text-muted-foreground">Control platform features without code deployment</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New Flag
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {!loading && (
        <>
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/30 border-b border-border">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Core Platform Features</p>
            </div>
            <div className="divide-y divide-border">
              {coreFlags.length === 0 && (
                <div className="px-4 py-6 text-center text-muted-foreground text-sm">No core flags found — run migrations first</div>
              )}
              {coreFlags.map((flag) => (
                <FlagRow key={flag.key} flag={flag} toggling={toggling === flag.key} onToggle={toggle} onDelete={handleDelete} isCore />
              ))}
            </div>
          </div>

          {customFlags.length > 0 && (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/30 border-b border-border">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Custom Flags</p>
              </div>
              <div className="divide-y divide-border">
                {customFlags.map((flag) => (
                  <FlagRow key={flag.key} flag={flag} toggling={toggling === flag.key} onToggle={toggle} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Feature Flag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Key <span className="text-primary">*</span></Label>
              <Input value={newFlag.key} onChange={(e) => setNewFlag((p) => ({ ...p, key: e.target.value.toLowerCase().replace(/[^a-z_]/g, "") }))} placeholder="e.g. new_feature" className="font-mono" />
              <p className="text-xs text-muted-foreground">Lowercase letters and underscores only</p>
            </div>
            <div className="space-y-1.5">
              <Label>Name <span className="text-primary">*</span></Label>
              <Input value={newFlag.name} onChange={(e) => setNewFlag((p) => ({ ...p, name: e.target.value }))} placeholder="Display name" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={newFlag.description} onChange={(e) => setNewFlag((p) => ({ ...p, description: e.target.value }))} placeholder="What does this feature do?" rows={2} className="resize-none" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Enabled by default</Label>
              <Switch checked={newFlag.enabled} onCheckedChange={(v) => setNewFlag((p) => ({ ...p, enabled: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Flag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FlagRow({ flag, toggling, onToggle, onDelete, isCore }: {
  flag: Flag;
  toggling: boolean;
  onToggle: (f: Flag) => void;
  onDelete: (key: string) => void;
  isCore?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-foreground">{flag.name}</span>
          <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">{flag.key}</code>
        </div>
        {flag.description && <p className="text-xs text-muted-foreground mt-0.5">{flag.description}</p>}
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {flag.rollout_pct > 0 && flag.rollout_pct < 100 ? `${flag.rollout_pct}% rollout · ` : ""}
          Updated {new Date(flag.updated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {toggling ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Switch checked={flag.enabled} onCheckedChange={() => onToggle(flag)} />
        )}
        {!isCore && (
          <button type="button" onClick={() => onDelete(flag.key)} className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
