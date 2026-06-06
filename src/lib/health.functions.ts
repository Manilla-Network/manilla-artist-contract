"use server";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/admin.functions";

export type HealthStatus = "ok" | "degraded" | "error" | "unknown";

export interface HealthCheck {
  name: string;
  status: HealthStatus;
  latency_ms?: number;
  message?: string;
  detail?: Record<string, unknown>;
  checked_at: string;
}

// ── System Health Server Function ─────────────────────────────────────────────

export const getSystemHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({}).parse(data ?? {}))
  .handler(async ({ context }) => {
    const { supabase, claims } = context;
    requireAdmin((claims as { email?: string }).email ?? "");

    const now = new Date().toISOString();
    const checks: HealthCheck[] = [];

    // ── Database health ───────────────────────────────────────────────────────
    {
      const t0 = Date.now();
      try {
        const { count, error } = await supabase
          .from("signed_contracts")
          .select("*", { count: "exact", head: true });
        const latency = Date.now() - t0;
        checks.push({
          name: "Database",
          status: error ? "error" : latency > 2000 ? "degraded" : "ok",
          latency_ms: latency,
          message: error ? error.message : `Query in ${latency}ms`,
          detail: { total_contracts: count ?? 0 },
          checked_at: now,
        });
      } catch (e) {
        checks.push({
          name: "Database",
          status: "error",
          latency_ms: Date.now() - t0,
          message: e instanceof Error ? e.message : "Unknown error",
          checked_at: now,
        });
      }
    }

    // ── Storage health ────────────────────────────────────────────────────────
    {
      const t0 = Date.now();
      try {
        const { data: buckets, error } = await supabase.storage.listBuckets();
        const latency = Date.now() - t0;
        const artistBucket = (buckets ?? []).find((b: { name: string }) => b.name === "artist-assets");
        checks.push({
          name: "Storage",
          status: error ? "error" : !artistBucket ? "degraded" : "ok",
          latency_ms: latency,
          message: error
            ? error.message
            : !artistBucket
            ? "artist-assets bucket not found"
            : `${(buckets ?? []).length} bucket(s) accessible`,
          detail: { buckets: (buckets ?? []).map((b: { name: string }) => b.name) },
          checked_at: now,
        });
      } catch (e) {
        checks.push({
          name: "Storage",
          status: "error",
          message: e instanceof Error ? e.message : "Unknown error",
          checked_at: now,
        });
      }
    }

    // ── Auth health ───────────────────────────────────────────────────────────
    {
      const t0 = Date.now();
      try {
        const { data: session, error } = await supabase.auth.getSession();
        const latency = Date.now() - t0;
        checks.push({
          name: "Auth",
          status: error ? "error" : "ok",
          latency_ms: latency,
          message: error ? error.message : "Supabase Auth operational",
          checked_at: now,
        });
      } catch (e) {
        checks.push({
          name: "Auth",
          status: "error",
          message: e instanceof Error ? e.message : "Unknown error",
          checked_at: now,
        });
      }
    }

    // ── Email (Resend) health ─────────────────────────────────────────────────
    {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        checks.push({
          name: "Email",
          status: "error",
          message: "RESEND_API_KEY not configured",
          checked_at: now,
        });
      } else {
        const t0 = Date.now();
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "GET",
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          const latency = Date.now() - t0;
          checks.push({
            name: "Email",
            status: res.status === 200 || res.status === 405 ? "ok" : "degraded",
            latency_ms: latency,
            message: `Resend API reachable (HTTP ${res.status})`,
            checked_at: now,
          });
        } catch (e) {
          checks.push({
            name: "Email",
            status: "error",
            latency_ms: Date.now() - t0,
            message: e instanceof Error ? e.message : "Resend unreachable",
            checked_at: now,
          });
        }
      }
    }

    // ── Queue health ──────────────────────────────────────────────────────────
    {
      try {
        const [contracts, releases, verification, support] = await Promise.all([
          supabase.from("signed_contracts").select("*", { count: "exact", head: true }).in("status", ["submitted", "under_review"]),
          supabase.from("release_queue").select("*", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("artist_verification_queue").select("*", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("support_tickets").select("*", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
        ]);
        checks.push({
          name: "Queues",
          status: "ok",
          message: "All queues accessible",
          detail: {
            pending_contracts: contracts.count ?? 0,
            pending_releases: releases.count ?? 0,
            pending_verification: verification.count ?? 0,
            open_support: support.count ?? 0,
          },
          checked_at: now,
        });
      } catch (e) {
        checks.push({
          name: "Queues",
          status: "error",
          message: e instanceof Error ? e.message : "Queue check failed",
          checked_at: now,
        });
      }
    }

    // ── Fanlinks health ───────────────────────────────────────────────────────
    {
      try {
        const { count, error } = await supabase
          .from("fanlinks")
          .select("*", { count: "exact", head: true });
        checks.push({
          name: "Fanlinks",
          status: error ? "error" : "ok",
          message: error ? error.message : `${count ?? 0} fanlinks generated`,
          detail: { total_fanlinks: count ?? 0 },
          checked_at: now,
        });
      } catch (e) {
        checks.push({
          name: "Fanlinks",
          status: "error",
          message: e instanceof Error ? e.message : "Fanlinks check failed",
          checked_at: now,
        });
      }
    }

    // ── Contracts health ──────────────────────────────────────────────────────
    {
      try {
        const { data: recentContracts } = await supabase
          .from("signed_contracts")
          .select("id,email_sent_at,signed_at")
          .order("signed_at", { ascending: false })
          .limit(10);

        const withEmail = (recentContracts ?? []).filter(
          (r: Record<string, unknown>) => r.email_sent_at,
        ).length;
        const total = (recentContracts ?? []).length;
        const deliveryRate = total > 0 ? Math.round((withEmail / total) * 100) : 100;

        checks.push({
          name: "Contracts",
          status: deliveryRate < 70 ? "degraded" : "ok",
          message: `${deliveryRate}% email delivery rate (last ${total})`,
          detail: { recent_contracts: total, with_email: withEmail, delivery_rate_pct: deliveryRate },
          checked_at: now,
        });
      } catch (e) {
        checks.push({
          name: "Contracts",
          status: "error",
          message: e instanceof Error ? e.message : "Contracts check failed",
          checked_at: now,
        });
      }
    }

    const overallStatus: HealthStatus = checks.some((c) => c.status === "error")
      ? "error"
      : checks.some((c) => c.status === "degraded")
      ? "degraded"
      : "ok";

    return {
      status: overallStatus,
      checks,
      checked_at: now,
    };
  });
