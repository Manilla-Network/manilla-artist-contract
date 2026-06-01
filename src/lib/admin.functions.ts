import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildContractPdf } from "./contract-pdf";

// ── Admin guard ───────────────────────────────────────────────────────────────

const ADMIN_EMAILS = (process.env.ADMIN_EMAIL ?? "ideamack@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function requireAdmin(email: string): void {
  if (!email || !ADMIN_EMAILS.includes(email.toLowerCase())) {
    throw new Error("Access denied: not an administrator");
  }
}

// ── Status helpers ────────────────────────────────────────────────────────────

export const STATUS_VALUES = [
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "contract_sent",
  "signed",
  "active",
] as const;

export type AppStatus = (typeof STATUS_VALUES)[number];

export const STATUS_LABELS: Record<AppStatus, string> = {
  submitted: "Submitted",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
  contract_sent: "Contract Sent",
  signed: "Signed",
  active: "Active Artist",
};

export const STATUS_COLORS: Record<AppStatus, string> = {
  submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  under_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  contract_sent: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  signed: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
};

// ── Email helpers ─────────────────────────────────────────────────────────────

function esc(s: string) {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendResend(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: Array<{ filename: string; content: string }>;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: opts.from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        attachments: opts.attachments,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

function buildStatusEmail(opts: {
  status: "approved" | "rejected";
  to: string;
  stageName: string;
  legalName: string;
  appId: string;
  note?: string;
}): { subject: string; html: string; text: string } {
  const { status, stageName, legalName, appId, note } = opts;
  const isApproved = status === "approved";

  const subject = isApproved
    ? `Congratulations! Your Manilla Collective application has been approved — ${appId}`
    : `Manilla Collective — Update on your application ${appId}`;

  const bodyHtml = isApproved
    ? `<p>We're thrilled to welcome you, <strong>${esc(stageName)}</strong>, to <strong>Manilla Collective</strong>!</p>
       <p>Your 360° Artist Application has been <strong style="color:#16a34a">approved</strong>. Our A&R team will contact you within 24–48 hours to begin your onboarding and grant you access to your artist dashboard.</p>
       ${note ? `<p><strong>Note from the team:</strong> ${esc(note)}</p>` : ""}`
    : `<p>Hi <strong>${esc(stageName)}</strong>,</p>
       <p>Thank you for applying to Manilla Collective. After a careful review, we are unable to proceed with your application at this time.</p>
       ${note ? `<p><strong>Feedback:</strong> ${esc(note)}</p>` : ""}
       <p>You are welcome to reapply in the future. If you believe this is an error, please reply to this email.</p>`;

  const bodyText = isApproved
    ? `Congratulations ${stageName}! Your Manilla Collective application (${appId}) has been approved.\n${note ? `\nNote: ${note}` : ""}\nOur team will contact you within 24–48 hours.`
    : `Hi ${stageName}, unfortunately your application (${appId}) was not approved at this time.\n${note ? `\nFeedback: ${note}` : ""}`;

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#fff7ed;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:linear-gradient(135deg,#0a0a0a,#1a1a1a 55%,#3a1a05);padding:24px;border-radius:12px 12px 0 0;text-align:center;border-bottom:3px solid #ff8a3d">
    <p style="margin:0;font-size:9px;letter-spacing:.3em;color:#ff8a3d;font-weight:800">MANILLA COLLECTIVE</p>
    <h1 style="margin:8px 0 0;font-size:18px;font-weight:700;color:#fff">${isApproved ? "🎉 Application Approved" : "Application Update"}</h1>
  </div>
  <div style="background:#fff;border:1px solid #fed7aa;border-top:none;border-radius:0 0 12px 12px;padding:24px">
    ${bodyHtml}
    <div style="margin-top:16px;padding:10px 14px;background:#fffbf5;border:1px solid #fed7aa;border-radius:8px;font-size:12px;color:#9a3412">
      Application ID: <strong style="font-family:monospace">${esc(appId)}</strong>
      &nbsp;·&nbsp; Legal Name: <strong>${esc(legalName)}</strong>
    </div>
    <p style="margin-top:18px;font-size:11px;color:#9a3412;text-align:center;letter-spacing:.2em">LILCKY STUDIO LIMITED · LAGOS, NIGERIA</p>
  </div>
</div></body></html>`;

  return { subject, html, text: bodyText };
}

// ── Server functions ──────────────────────────────────────────────────────────

const filtersSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(25),
  search: z.string().optional().or(z.literal("")),
  status: z.enum(["all", ...STATUS_VALUES]).default("all"),
  country: z.string().optional().or(z.literal("")),
  from_date: z.string().optional().or(z.literal("")),
  to_date: z.string().optional().or(z.literal("")),
});

export const getAdminApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => filtersSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    requireAdmin((claims as { email?: string }).email ?? "");

    const offset = (data.page - 1) * data.limit;

    let query = supabase
      .from("signed_contracts")
      .select(
        "id,application_id,legal_name,stage_name,email,country,genre,status,signed_at,artist_photo_url",
        { count: "exact" },
      );

    if (data.search) {
      const s = data.search.replace(/[%_]/g, "\\$&");
      query = query.or(
        `legal_name.ilike.%${s}%,stage_name.ilike.%${s}%,email.ilike.%${s}%,application_id.ilike.%${s}%`,
      );
    }
    if (data.status !== "all") {
      query = query.eq("status", data.status);
    }
    if (data.country) {
      query = query.eq("country", data.country);
    }
    if (data.from_date) {
      query = query.gte("signed_at", data.from_date);
    }
    if (data.to_date) {
      query = query.lte("signed_at", data.to_date + "T23:59:59Z");
    }

    const { data: rows, error, count } = await query
      .order("signed_at", { ascending: false })
      .range(offset, offset + data.limit - 1);

    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0, page: data.page, limit: data.limit };
  });

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({}).parse(data ?? {}))
  .handler(async ({ context }) => {
    const { supabase, claims } = context;
    requireAdmin((claims as { email?: string }).email ?? "");

    const { data: rows } = await supabase
      .from("signed_contracts")
      .select("status");

    const counts: Record<string, number> = { total: rows?.length ?? 0 };
    for (const s of STATUS_VALUES) counts[s] = 0;
    for (const r of rows ?? []) {
      const st = (r as { status: string }).status;
      if (st in counts) counts[st]++;
    }
    return counts as Record<string, number>;
  });

export const getApplicationDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    requireAdmin((claims as { email?: string }).email ?? "");

    const { data: row, error } = await supabase
      .from("signed_contracts")
      .select("*")
      .eq("id", data.id)
      .single();

    if (error) throw new Error(error.message);

    const { data: auditRows } = await supabase
      .from("application_audit")
      .select("*")
      .eq("contract_id", data.id)
      .order("created_at", { ascending: false })
      .limit(50);

    return { application: row, audit: auditRows ?? [] };
  });

export const updateApplicationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(STATUS_VALUES),
        note: z.string().max(1000).optional().or(z.literal("")),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    const adminEmail = (claims as { email?: string }).email ?? "";
    requireAdmin(adminEmail);

    const { data: current } = await supabase
      .from("signed_contracts")
      .select("status,application_id,email,stage_name,legal_name")
      .eq("id", data.id)
      .single();

    if (!current) throw new Error("Application not found");

    const { error } = await supabase
      .from("signed_contracts")
      .update({ status: data.status })
      .eq("id", data.id);

    if (error) throw new Error(error.message);

    await supabase.from("application_audit").insert({
      contract_id: data.id,
      application_id: current.application_id,
      event: "STATUS_CHANGED",
      actor: adminEmail,
      old_value: current.status,
      new_value: data.status,
      metadata: data.note ? { note: data.note } : {},
    });

    const apiKey = process.env.RESEND_API_KEY;
    const from =
      process.env.RESEND_FROM ||
      "Manilla Collective <exclusive@rald.cloud>";

    let emailSent = false;
    if (
      apiKey &&
      current.email &&
      (data.status === "approved" || data.status === "rejected")
    ) {
      const msg = buildStatusEmail({
        status: data.status,
        to: current.email,
        stageName: current.stage_name,
        legalName: current.legal_name,
        appId: current.application_id ?? "—",
        note: data.note ?? undefined,
      });
      const result = await sendResend({
        apiKey,
        from,
        to: current.email,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      });
      emailSent = result.ok;
      if (!result.ok) console.error("[admin email] status notify:", result.error);
    }

    return {
      success: true,
      application_id: current.application_id,
      old_status: current.status,
      new_status: data.status,
      email_sent: emailSent,
    };
  });

export const resendArtistContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    const adminEmail = (claims as { email?: string }).email ?? "";
    requireAdmin(adminEmail);

    const { data: row, error } = await supabase
      .from("signed_contracts")
      .select("*")
      .eq("id", data.id)
      .single();

    if (error || !row) throw new Error("Application not found");

    const apiKey = process.env.RESEND_API_KEY;
    const from =
      process.env.RESEND_FROM ||
      "Manilla Collective <exclusive@rald.cloud>";
    const adminRecipient = process.env.ADMIN_EMAIL || "ideamack@gmail.com";

    if (!apiKey) throw new Error("RESEND_API_KEY not configured");

    let pdfBase64: string | null = null;
    try {
      const pdf = buildContractPdf({
        legal_name: row.legal_name,
        stage_name: row.stage_name,
        address: row.address,
        nationality: row.nationality,
        phone: row.phone ?? undefined,
        email: row.email,
        city: row.city ?? undefined,
        state: row.state ?? undefined,
        country: row.country ?? undefined,
        date_of_birth: row.date_of_birth ?? undefined,
        genre: row.genre ?? undefined,
        years_active: row.years_active ?? undefined,
        bio: row.bio ?? undefined,
        spotify_url: row.spotify_url,
        apple_music_url: row.apple_music_url,
        audiomack_url: row.audiomack_url,
        boomplay_url: row.boomplay_url,
        youtube_url: row.youtube_url,
        tiktok_url: row.tiktok_url,
        instagram_url: row.instagram_url,
        website_url: row.website_url,
        signature_name: row.signature_name,
        signature_data_url: row.signature_data_url,
        reference: row.application_id ?? undefined,
        signed_at: row.signed_at,
      });
      pdfBase64 = pdf.output("datauristring").split(",")[1] ?? null;
    } catch (e) {
      console.error("[resend contract] pdf build failed:", e);
    }

    const pdfFilename = `Manilla-360-Agreement-${row.application_id ?? row.id}.pdf`;
    const attachments = pdfBase64
      ? [{ filename: pdfFilename, content: pdfBase64 }]
      : undefined;

    const subject = `Manilla Collective — Your 360° Agreement (${row.application_id ?? row.id}) [RESENT]`;
    const html = `<!doctype html><html><body style="margin:0;padding:0;background:#fff7ed;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:24px"><div style="background:linear-gradient(135deg,#0a0a0a,#1a1a1a 55%,#3a1a05);padding:24px;border-radius:12px 12px 0 0;text-align:center;border-bottom:3px solid #ff8a3d"><p style="margin:0;font-size:9px;letter-spacing:.3em;color:#ff8a3d;font-weight:800">MANILLA COLLECTIVE</p><h1 style="margin:8px 0 0;font-size:18px;font-weight:700;color:#fff">Signed Contract — Resent</h1></div><div style="background:#fff;border:1px solid #fed7aa;border-top:none;border-radius:0 0 12px 12px;padding:24px"><p>Hi <strong>${esc(row.stage_name)}</strong>, here is a re-sent copy of your signed 360° Artist Agreement with Manilla Collective.</p><p>Application ID: <strong style="font-family:monospace">${esc(row.application_id ?? "—")}</strong></p><p>Please find the signed contract PDF attached.</p><p style="margin-top:18px;font-size:11px;color:#9a3412;text-align:center;letter-spacing:.2em">LILCKY STUDIO LIMITED · LAGOS, NIGERIA</p></div></div></body></html>`;
    const text = `Hi ${row.stage_name}, here is your re-sent signed 360° Artist Agreement. App ID: ${row.application_id ?? "—"}. PDF attached.`;

    const result = await sendResend({
      apiKey,
      from,
      to: row.email,
      subject,
      html,
      text,
      attachments,
    });

    await supabase.from("application_audit").insert({
      contract_id: data.id,
      application_id: row.application_id,
      event: "CONTRACT_RESENT",
      actor: adminEmail,
      new_value: row.email,
      metadata: { resent_by: adminEmail, email_ok: result.ok },
    });

    if (!result.ok) throw new Error(`Email delivery failed: ${result.error}`);

    await supabase
      .from("signed_contracts")
      .update({
        status: "contract_sent",
        email_sent_at: new Date().toISOString(),
      })
      .eq("id", data.id);

    return { success: true, email: row.email };
  });

export const getAdminCountries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({}).parse(data ?? {}))
  .handler(async ({ context }) => {
    const { supabase, claims } = context;
    requireAdmin((claims as { email?: string }).email ?? "");

    const { data: rows } = await supabase
      .from("signed_contracts")
      .select("country")
      .not("country", "is", null);

    const countries = [...new Set((rows ?? []).map((r) => r.country).filter(Boolean))].sort();
    return countries as string[];
  });
