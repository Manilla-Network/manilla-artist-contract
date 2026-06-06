"use server";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/admin.functions";

// ── Support Queue Server Functions ────────────────────────────────────────────

export const getSupportTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(25),
      search: z.string().optional().or(z.literal("")),
      status: z.string().optional().or(z.literal("")),
      priority: z.string().optional().or(z.literal("")),
      assigned_to: z.string().optional().or(z.literal("")),
    }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    requireAdmin((claims as { email?: string }).email ?? "");

    const offset = (data.page - 1) * data.limit;
    let query = supabase
      .from("support_tickets")
      .select(
        "id,ticket_number,type,priority,subject,reporter_email,reporter_name,status,assigned_to,created_at,updated_at,resolved_at",
        { count: "exact" },
      );

    if (data.search) {
      const s = data.search.replace(/[%_]/g, "\\$&");
      query = query.or(`subject.ilike.%${s}%,reporter_email.ilike.%${s}%,ticket_number.ilike.%${s}%`);
    }
    if (data.status && data.status !== "all") query = query.eq("status", data.status);
    if (data.priority && data.priority !== "all") query = query.eq("priority", data.priority);
    if (data.assigned_to) query = query.eq("assigned_to", data.assigned_to);

    const { data: rows, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + data.limit - 1);

    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0, page: data.page };
  });

export const getSupportTicketDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    requireAdmin((claims as { email?: string }).email ?? "");

    const { data: ticket, error } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("id", data.id)
      .single();

    if (error) throw new Error(error.message);

    // Get related artist if contract_id present
    let artist = null;
    if ((ticket as { contract_id?: string }).contract_id) {
      const { data: artistRow } = await supabase
        .from("signed_contracts")
        .select("id,legal_name,stage_name,email,application_id,status")
        .eq("id", (ticket as { contract_id: string }).contract_id)
        .single();
      artist = artistRow;
    }

    const { data: auditRows } = await supabase
      .from("queue_audit")
      .select("*")
      .eq("queue", "support")
      .eq("item_id", data.id)
      .order("created_at", { ascending: false })
      .limit(50);

    return { ticket, artist, audit: auditRows ?? [] };
  });

export const processSupportAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      id: z.string().uuid(),
      action: z.enum(["in_progress", "waiting", "resolve", "close", "escalate", "assign", "note"]),
      note: z.string().max(5000).optional().or(z.literal("")),
      assignee: z.string().email().optional().or(z.literal("")),
      resolution: z.string().max(5000).optional().or(z.literal("")),
      priority: z.enum(["low", "medium", "high", "critical"]).optional(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    const actor = (claims as { email?: string }).email ?? "unknown";
    requireAdmin(actor);

    const { data: current, error: fetchErr } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("id", data.id)
      .single();

    if (fetchErr || !current) throw new Error("Ticket not found");

    const ACTION_STATUS: Record<string, string> = {
      in_progress: "in_progress",
      waiting: "waiting",
      resolve: "resolved",
      close: "closed",
      escalate: "in_progress",
    };

    let updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    let newStatus = current.status;

    if (data.action in ACTION_STATUS) {
      newStatus = ACTION_STATUS[data.action];
      updatePayload.status = newStatus;
    }

    if (data.action === "resolve" || data.action === "close") {
      updatePayload.resolved_at = new Date().toISOString();
      if (data.resolution) updatePayload.resolution = data.resolution;
    }

    if (data.action === "assign" && data.assignee) {
      updatePayload.assigned_to = data.assignee;
    }

    if (data.action === "escalate") {
      updatePayload.priority = "critical";
    }

    if (data.priority) updatePayload.priority = data.priority;

    if (data.action === "note" && data.note) {
      const notes = Array.isArray((current as { internal_notes?: unknown[] }).internal_notes)
        ? (current as { internal_notes: unknown[] }).internal_notes
        : [];
      updatePayload.internal_notes = [...notes, { text: data.note, actor, ts: new Date().toISOString() }];
    }

    const { error: updateErr } = await supabase
      .from("support_tickets")
      .update(updatePayload)
      .eq("id", data.id);

    if (updateErr) throw new Error(updateErr.message);

    await supabase.from("queue_audit").insert({
      queue: "support",
      item_id: data.id,
      event: data.action.toUpperCase(),
      actor,
      old_status: current.status,
      new_status: newStatus,
      note: data.note ?? null,
      metadata: {
        assignee: data.assignee,
        resolution: data.resolution,
        escalated: data.action === "escalate",
      },
    });

    return { success: true, new_status: newStatus };
  });

export const getSupportStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({}).parse(data ?? {}))
  .handler(async ({ context }) => {
    const { supabase, claims } = context;
    requireAdmin((claims as { email?: string }).email ?? "");

    const { data: rows } = await supabase.from("support_tickets").select("status,priority");
    const counts: Record<string, number> = { total: rows?.length ?? 0, open: 0, in_progress: 0, waiting: 0, resolved: 0, closed: 0, critical: 0, high: 0 };
    for (const r of rows ?? []) {
      const row = r as { status: string; priority: string };
      if (row.status in counts) counts[row.status]++;
      if (row.priority === "critical") counts.critical++;
      if (row.priority === "high") counts.high++;
    }
    return counts;
  });
