"use server";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/admin.functions";

// ── Shared helpers ────────────────────────────────────────────────────────────

async function writeQueueAudit(
  supabase: ReturnType<typeof import("@/integrations/supabase/client.server").createSupabaseServerClient>,
  opts: {
    queue: string;
    item_id: string;
    event: string;
    actor: string;
    old_status?: string;
    new_status?: string;
    note?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await supabase.from("queue_audit").insert({
    queue: opts.queue,
    item_id: opts.item_id,
    event: opts.event,
    actor: opts.actor,
    old_status: opts.old_status ?? null,
    new_status: opts.new_status ?? null,
    note: opts.note ?? null,
    metadata: opts.metadata ?? {},
  });
}

function generateReleaseId(): string {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `REL-${year}-${rand}`;
}

// ── Release Queue ─────────────────────────────────────────────────────────────

export const getReleaseQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(25),
      search: z.string().optional().or(z.literal("")),
      status: z.string().optional().or(z.literal("")),
    }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    requireAdmin((claims as { email?: string }).email ?? "");

    const offset = (data.page - 1) * data.limit;
    let query = supabase
      .from("release_queue")
      .select("id,release_id,application_id,release_title,release_type,genre,status,assigned_to,submitted_at,fanlink_url,artwork_url", { count: "exact" });

    if (data.search) {
      const s = data.search.replace(/[%_]/g, "\\$&");
      query = query.or(`release_title.ilike.%${s}%,release_id.ilike.%${s}%,application_id.ilike.%${s}%`);
    }
    if (data.status && data.status !== "all") {
      query = query.eq("status", data.status);
    }

    const { data: rows, error, count } = await query
      .order("submitted_at", { ascending: false })
      .range(offset, offset + data.limit - 1);

    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0, page: data.page };
  });

export const getReleaseDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    requireAdmin((claims as { email?: string }).email ?? "");

    const { data: row, error } = await supabase
      .from("release_queue")
      .select("*")
      .eq("id", data.id)
      .single();

    if (error) throw new Error(error.message);

    const { data: auditRows } = await supabase
      .from("queue_audit")
      .select("*")
      .eq("queue", "release")
      .eq("item_id", data.id)
      .order("created_at", { ascending: false })
      .limit(50);

    return { release: row, audit: auditRows ?? [] };
  });

export const processReleaseAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      id: z.string().uuid(),
      action: z.enum(["approve", "reject", "request_changes", "escalate", "assign", "note"]),
      note: z.string().max(2000).optional().or(z.literal("")),
      assignee: z.string().email().optional().or(z.literal("")),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    const actor = (claims as { email?: string }).email ?? "unknown";
    requireAdmin(actor);

    const { data: current, error: fetchErr } = await supabase
      .from("release_queue")
      .select("*")
      .eq("id", data.id)
      .single();

    if (fetchErr || !current) throw new Error("Release not found");

    const ACTION_STATUS: Record<string, string> = {
      approve: "approved",
      reject: "rejected",
      request_changes: "changes_requested",
      escalate: "under_review",
    };

    let updatePayload: Record<string, unknown> = {
      reviewed_by: actor,
      reviewed_at: new Date().toISOString(),
    };

    let newStatus = current.status;
    if (data.action in ACTION_STATUS) {
      newStatus = ACTION_STATUS[data.action];
      updatePayload.status = newStatus;
    }

    if (data.action === "assign" && data.assignee) {
      updatePayload.assigned_to = data.assignee;
    }

    if (data.action === "note" && data.note) {
      const notes = Array.isArray(current.internal_notes) ? current.internal_notes : [];
      updatePayload.internal_notes = [
        ...notes,
        { text: data.note, actor, ts: new Date().toISOString() },
      ];
    }

    // Generate fanlink on approval
    let fanlinkUrl: string | null = null;
    if (data.action === "approve") {
      const slug = current.release_id?.toLowerCase().replace("rel-", "r-") ?? data.id.substring(0, 8);
      fanlinkUrl = `https://manilla.link/${slug}`;
      updatePayload.fanlink_url = fanlinkUrl;

      await supabase.from("fanlinks").insert({
        slug,
        contract_id: current.artist_id,
        application_id: current.application_id,
        release_id: current.id,
        link_type: "release",
        created_by: actor,
        metadata: { release_title: current.release_title, release_id: current.release_id },
      });
    }

    const { error: updateErr } = await supabase
      .from("release_queue")
      .update(updatePayload)
      .eq("id", data.id);

    if (updateErr) throw new Error(updateErr.message);

    await writeQueueAudit(supabase as any, {
      queue: "release",
      item_id: data.id,
      event: data.action.toUpperCase(),
      actor,
      old_status: current.status,
      new_status: newStatus,
      note: data.note,
      metadata: {
        fanlink_url: fanlinkUrl,
        assignee: data.assignee,
      },
    });

    return { success: true, new_status: newStatus, fanlink_url: fanlinkUrl };
  });

export const getReleaseQueueStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({}).parse(data ?? {}))
  .handler(async ({ context }) => {
    const { supabase, claims } = context;
    requireAdmin((claims as { email?: string }).email ?? "");

    const { data: rows } = await supabase.from("release_queue").select("status");
    const counts: Record<string, number> = { total: rows?.length ?? 0, pending: 0, under_review: 0, approved: 0, rejected: 0, changes_requested: 0, live: 0 };
    for (const r of rows ?? []) counts[(r as { status: string }).status]++;
    return counts;
  });

// ── Artist Verification Queue ─────────────────────────────────────────────────

export const getVerificationQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(25),
      status: z.string().optional().or(z.literal("")),
    }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    requireAdmin((claims as { email?: string }).email ?? "");

    const offset = (data.page - 1) * data.limit;
    let query = supabase
      .from("artist_verification_queue")
      .select(
        "id,application_id,verification_type,status,assigned_to,social_verified,created_at,verified_at,contract_id",
        { count: "exact" },
      );

    if (data.status && data.status !== "all") {
      query = query.eq("status", data.status);
    }

    const { data: rows, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + data.limit - 1);

    if (error) throw new Error(error.message);

    // Join with signed_contracts for artist name
    const contractIds = (rows ?? []).map((r: Record<string, unknown>) => r.contract_id).filter(Boolean);
    let contracts: Record<string, { legal_name: string; stage_name: string; email: string }> = {};
    if (contractIds.length > 0) {
      const { data: contractRows } = await supabase
        .from("signed_contracts")
        .select("id,legal_name,stage_name,email")
        .in("id", contractIds as string[]);
      for (const c of contractRows ?? []) {
        contracts[(c as { id: string }).id] = c as { legal_name: string; stage_name: string; email: string };
      }
    }

    return { rows: (rows ?? []).map((r: Record<string, unknown>) => ({ ...r, artist: contracts[r.contract_id as string] ?? null })), total: count ?? 0, page: data.page };
  });

export const processVerificationAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      id: z.string().uuid(),
      action: z.enum(["verify", "fail", "manual_review", "assign", "update_checklist", "note"]),
      note: z.string().max(2000).optional().or(z.literal("")),
      assignee: z.string().email().optional().or(z.literal("")),
      checklist: z.array(z.object({ label: z.string(), passed: z.boolean() })).optional(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    const actor = (claims as { email?: string }).email ?? "unknown";
    requireAdmin(actor);

    const { data: current, error: fetchErr } = await supabase
      .from("artist_verification_queue")
      .select("*")
      .eq("id", data.id)
      .single();

    if (fetchErr || !current) throw new Error("Verification record not found");

    const ACTION_STATUS: Record<string, string> = {
      verify: "verified",
      fail: "failed",
      manual_review: "manual_review",
    };

    let updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    let newStatus = current.status;

    if (data.action in ACTION_STATUS) {
      newStatus = ACTION_STATUS[data.action];
      updatePayload.status = newStatus;
      updatePayload.verified_by = actor;
      updatePayload.verified_at = new Date().toISOString();
    }

    if (data.action === "assign" && data.assignee) updatePayload.assigned_to = data.assignee;
    if (data.action === "update_checklist" && data.checklist) updatePayload.checklist = data.checklist;
    if (data.action === "note" && data.note) {
      const notes = Array.isArray(current.internal_notes) ? current.internal_notes : [];
      updatePayload.internal_notes = [...notes, { text: data.note, actor, ts: new Date().toISOString() }];
    }

    // On verify → activate artist
    if (data.action === "verify" && current.contract_id) {
      await supabase.from("signed_contracts").update({ status: "active" }).eq("id", current.contract_id);
      await supabase.from("application_audit").insert({
        contract_id: current.contract_id,
        application_id: current.application_id,
        event: "ARTIST_VERIFIED",
        actor,
        old_value: "under_review",
        new_value: "active",
        metadata: { verification_id: data.id },
      });
    }

    const { error: updateErr } = await supabase
      .from("artist_verification_queue")
      .update(updatePayload)
      .eq("id", data.id);

    if (updateErr) throw new Error(updateErr.message);

    await writeQueueAudit(supabase as any, {
      queue: "artist",
      item_id: data.id,
      event: data.action.toUpperCase(),
      actor,
      old_status: current.status,
      new_status: newStatus,
      note: data.note,
    });

    return { success: true, new_status: newStatus };
  });

// ── Label Queue ───────────────────────────────────────────────────────────────

export const getLabelQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(25),
      status: z.string().optional().or(z.literal("")),
    }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    requireAdmin((claims as { email?: string }).email ?? "");

    const offset = (data.page - 1) * data.limit;
    let query = supabase
      .from("label_queue")
      .select("id,label_id,label_name,label_email,contact_name,country,roster_size,status,tier,assigned_to,submitted_at", { count: "exact" });

    if (data.status && data.status !== "all") {
      query = query.eq("status", data.status);
    }

    const { data: rows, error, count } = await query
      .order("submitted_at", { ascending: false })
      .range(offset, offset + data.limit - 1);

    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0, page: data.page };
  });

export const processLabelAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      id: z.string().uuid(),
      action: z.enum(["approve", "reject", "due_diligence", "assign", "note"]),
      note: z.string().max(2000).optional().or(z.literal("")),
      assignee: z.string().email().optional().or(z.literal("")),
      tier: z.enum(["standard", "premium", "enterprise"]).optional(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    const actor = (claims as { email?: string }).email ?? "unknown";
    requireAdmin(actor);

    const { data: current, error: fetchErr } = await supabase
      .from("label_queue")
      .select("*")
      .eq("id", data.id)
      .single();

    if (fetchErr || !current) throw new Error("Label record not found");

    const ACTION_STATUS: Record<string, string> = {
      approve: "approved",
      reject: "rejected",
      due_diligence: "due_diligence",
    };

    let updatePayload: Record<string, unknown> = {
      reviewed_by: actor,
      reviewed_at: new Date().toISOString(),
    };
    let newStatus = current.status;

    if (data.action in ACTION_STATUS) {
      newStatus = ACTION_STATUS[data.action];
      updatePayload.status = newStatus;
    }
    if (data.action === "assign" && data.assignee) updatePayload.assigned_to = data.assignee;
    if (data.tier) updatePayload.tier = data.tier;
    if (data.action === "note" && data.note) {
      const notes = Array.isArray(current.internal_notes) ? current.internal_notes : [];
      updatePayload.internal_notes = [...notes, { text: data.note, actor, ts: new Date().toISOString() }];
    }

    const { error: updateErr } = await supabase
      .from("label_queue")
      .update(updatePayload)
      .eq("id", data.id);

    if (updateErr) throw new Error(updateErr.message);

    await writeQueueAudit(supabase as any, {
      queue: "label",
      item_id: data.id,
      event: data.action.toUpperCase(),
      actor,
      old_status: current.status,
      new_status: newStatus,
      note: data.note,
    });

    return { success: true, new_status: newStatus };
  });

// ── Queue Overview Stats ──────────────────────────────────────────────────────

export const getQueueOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({}).parse(data ?? {}))
  .handler(async ({ context }) => {
    const { supabase, claims } = context;
    requireAdmin((claims as { email?: string }).email ?? "");

    const [contracts, releases, verification, labels, support] = await Promise.all([
      supabase.from("signed_contracts").select("status", { count: "exact" }).in("status", ["submitted", "under_review"]),
      supabase.from("release_queue").select("id", { count: "exact" }).eq("status", "pending"),
      supabase.from("artist_verification_queue").select("id", { count: "exact" }).eq("status", "pending"),
      supabase.from("label_queue").select("id", { count: "exact" }).eq("status", "pending"),
      supabase.from("support_tickets").select("id", { count: "exact" }).eq("status", "open"),
    ]);

    return {
      contracts: contracts.count ?? 0,
      releases: releases.count ?? 0,
      verification: verification.count ?? 0,
      labels: labels.count ?? 0,
      support: support.count ?? 0,
    };
  });

// ── Admin Notes (internal — no email triggered) ───────────────────────────────

export const addInternalNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      contract_id: z.string().uuid(),
      note: z.string().min(1).max(2000),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    const actor = (claims as { email?: string }).email ?? "unknown";
    requireAdmin(actor);

    const { data: current } = await supabase
      .from("signed_contracts")
      .select("internal_notes,application_id")
      .eq("id", data.contract_id)
      .single();

    const notes = Array.isArray(current?.internal_notes) ? current.internal_notes : [];
    const newNote = { text: data.note, actor, ts: new Date().toISOString() };

    await supabase
      .from("signed_contracts")
      .update({ internal_notes: [...notes, newNote] })
      .eq("id", data.contract_id);

    await supabase.from("application_audit").insert({
      contract_id: data.contract_id,
      application_id: current?.application_id ?? null,
      event: "INTERNAL_NOTE",
      actor,
      metadata: { note: data.note },
    });

    return { success: true };
  });

// ── Assignment ────────────────────────────────────────────────────────────────

export const assignContractItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      contract_id: z.string().uuid(),
      assignee: z.string().email(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    const actor = (claims as { email?: string }).email ?? "unknown";
    requireAdmin(actor);

    const { data: current } = await supabase
      .from("signed_contracts")
      .select("assigned_to,application_id")
      .eq("id", data.contract_id)
      .single();

    await supabase
      .from("signed_contracts")
      .update({ assigned_to: data.assignee })
      .eq("id", data.contract_id);

    await supabase.from("application_audit").insert({
      contract_id: data.contract_id,
      application_id: current?.application_id ?? null,
      event: "ASSIGNED",
      actor,
      old_value: current?.assigned_to ?? null,
      new_value: data.assignee,
      metadata: { assigned_by: actor },
    });

    return { success: true };
  });
