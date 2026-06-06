"use server";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/admin.functions";

// ── Feature Flag Server Functions ─────────────────────────────────────────────

export const getFeatureFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({}).parse(data ?? {}))
  .handler(async ({ context }) => {
    const { supabase, claims } = context;
    requireAdmin((claims as { email?: string }).email ?? "");

    const { data: rows, error } = await supabase
      .from("feature_flags")
      .select("*")
      .order("key");

    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const setFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      key: z.string().min(1).max(100),
      enabled: z.boolean(),
      rollout_pct: z.number().int().min(0).max(100).optional(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    const actor = (claims as { email?: string }).email ?? "unknown";
    requireAdmin(actor);

    const updatePayload: Record<string, unknown> = {
      enabled: data.enabled,
      updated_by: actor,
      updated_at: new Date().toISOString(),
    };
    if (data.rollout_pct !== undefined) updatePayload.rollout_pct = data.rollout_pct;

    const { error } = await supabase
      .from("feature_flags")
      .update(updatePayload)
      .eq("key", data.key);

    if (error) throw new Error(error.message);

    // Log to queue_audit for traceability
    const { data: flag } = await supabase
      .from("feature_flags")
      .select("id")
      .eq("key", data.key)
      .single();

    if (flag) {
      await supabase.from("queue_audit").insert({
        queue: "feature_flags",
        item_id: (flag as { id: string }).id,
        event: data.enabled ? "FLAG_ENABLED" : "FLAG_DISABLED",
        actor,
        new_status: data.enabled ? "enabled" : "disabled",
        metadata: { key: data.key, rollout_pct: data.rollout_pct },
      });
    }

    return { success: true, key: data.key, enabled: data.enabled };
  });

export const createFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      key: z.string().min(1).max(100).regex(/^[a-z_]+$/, "Key must be lowercase letters and underscores only"),
      name: z.string().min(1).max(200),
      description: z.string().max(500).optional().or(z.literal("")),
      enabled: z.boolean().default(false),
      rollout_pct: z.number().int().min(0).max(100).default(0),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    const actor = (claims as { email?: string }).email ?? "unknown";
    requireAdmin(actor);

    const { data: row, error } = await supabase
      .from("feature_flags")
      .insert({
        key: data.key,
        name: data.name,
        description: data.description || null,
        enabled: data.enabled,
        rollout_pct: data.rollout_pct,
        created_by: actor,
        updated_by: actor,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    if (row) {
      await supabase.from("queue_audit").insert({
        queue: "feature_flags",
        item_id: (row as { id: string }).id,
        event: "FLAG_CREATED",
        actor,
        new_status: data.enabled ? "enabled" : "disabled",
        metadata: { key: data.key, name: data.name },
      });
    }

    return { success: true };
  });

export const deleteFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ key: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    const actor = (claims as { email?: string }).email ?? "unknown";
    requireAdmin(actor);

    const { error } = await supabase
      .from("feature_flags")
      .delete()
      .eq("key", data.key);

    if (error) throw new Error(error.message);
    return { success: true };
  });

// ── Public flag check (no admin required) ─────────────────────────────────────

export const isFlagEnabled = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ key: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: flag } = await supabase
      .from("feature_flags")
      .select("enabled,rollout_pct")
      .eq("key", data.key)
      .single();

    if (!flag) return false;
    const f = flag as { enabled: boolean; rollout_pct: number };
    if (!f.enabled) return false;
    if (f.rollout_pct >= 100) return true;
    return Math.random() * 100 < f.rollout_pct;
  });
