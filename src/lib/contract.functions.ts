import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const submitSchema = z.object({
  legal_name: z.string().trim().min(2).max(120),
  stage_name: z.string().trim().min(1).max(80),
  address: z.string().trim().min(5).max(300),
  nationality: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  signature_name: z.string().trim().min(2).max(120),
  signature_data_url: z.string().max(500_000).optional().or(z.literal("")),
  accepted_terms: z.literal(true),
  accepted_revenue_split: z.literal(true),
  // Audit / device fields (client-supplied, best-effort)
  timezone: z.string().max(80).optional().or(z.literal("")),
  locale: z.string().max(40).optional().or(z.literal("")),
  screen_resolution: z.string().max(40).optional().or(z.literal("")),
  referrer: z.string().max(500).optional().or(z.literal("")),
  submission_origin: z.string().max(200).optional().or(z.literal("")),
});

type SubmitData = z.infer<typeof submitSchema>;

// Plain-text + minimal HTML email body. No Lovable Email infra — just the
// Resend REST API via fetch, so it runs identically on Cloudflare Workers,
// Cloudflare Pages Functions, or any other Edge/Node runtime.
function buildEmail(args: {
  data: SubmitData;
  email: string;
  contractId: string;
  signedAt: string;
  ip: string | null;
  ua: string | null;
  forAdmin: boolean;
}) {
  const { data, email, contractId, signedAt, ip, ua, forAdmin } = args;
  const ref = contractId.slice(0, 8).toUpperCase();
  const subject = forAdmin
    ? `[Manilla Collective] New signed 360° agreement — ${data.stage_name} (${ref})`
    : `Your Manilla Collective 360° Agreement — Reference ${ref}`;

  const artistGreeting = forAdmin
    ? `<p>A new artist just signed the 360° Agreement.</p>`
    : `<p>Hi <strong>${escapeHtml(data.stage_name)}</strong>,</p>
       <p>Welcome to the family. Your <strong>Exclusive 360° Artist Agreement</strong> with Manilla Collective has been signed and securely recorded.</p>`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="background:linear-gradient(135deg,#0a0a0a,#1a1a1a);padding:28px 24px;border-radius:14px;text-align:center;color:#fff">
      <div style="font-size:11px;letter-spacing:.3em;color:#ff8a3d;font-weight:700">MANILLA NETWORK</div>
      <h1 style="margin:8px 0 0;font-size:22px">Exclusive 360° Artist Agreement</h1>
    </div>
    <div style="background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 14px 14px;padding:24px;margin-top:-2px">
      ${artistGreeting}
      <table style="width:100%;font-size:14px;border-collapse:collapse;margin-top:12px">
        <tbody>
          ${row("Reference", ref)}
          ${row("Legal name", data.legal_name)}
          ${row("Stage name", data.stage_name)}
          ${row("Email (verified)", email)}
          ${row("Nationality", data.nationality)}
          ${row("Address", data.address)}
          ${data.phone ? row("Phone", data.phone) : ""}
          ${row("Signed at (UTC)", signedAt)}
          ${row("Agreement", "360-v1")}
          ${forAdmin ? row("IP", ip ?? "—") : ""}
          ${forAdmin ? row("User agent", ua ?? "—") : ""}
          ${forAdmin && data.timezone ? row("Timezone", data.timezone) : ""}
          ${forAdmin && data.locale ? row("Locale", data.locale) : ""}
          ${forAdmin && data.screen_resolution ? row("Screen", data.screen_resolution) : ""}
          ${forAdmin && data.submission_origin ? row("Origin", data.submission_origin) : ""}
        </tbody>
      </table>
      ${
        forAdmin
          ? ""
          : `<p style="margin-top:18px;font-size:14px">Our A&R and operations team will reach out within 48 hours to onboard you onto your dashboard.</p>
             <p style="margin:6px 0 0;font-size:13px;color:#555">If you didn't sign this agreement, reply to this email immediately.</p>`
      }
      <p style="margin-top:24px;font-size:11px;color:#888;text-align:center;letter-spacing:.2em">
        LILCKY STUDIO LIMITED · Lagos, Nigeria
      </p>
    </div>
  </div>
</body></html>`;

  const text = [
    forAdmin ? `New signed 360° agreement` : `Welcome to Manilla Collective, ${data.stage_name}.`,
    ``,
    `Reference: ${ref}`,
    `Legal name: ${data.legal_name}`,
    `Stage name: ${data.stage_name}`,
    `Email (verified): ${email}`,
    `Nationality: ${data.nationality}`,
    `Address: ${data.address}`,
    data.phone ? `Phone: ${data.phone}` : ``,
    `Signed at (UTC): ${signedAt}`,
    `Agreement: 360-v1`,
    forAdmin ? `IP: ${ip ?? "-"}` : ``,
    forAdmin ? `User agent: ${ua ?? "-"}` : ``,
    ``,
    `LILCKY STUDIO LIMITED — Lagos, Nigeria`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

function row(k: string, v: string) {
  return `<tr><td style="padding:6px 0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:.08em;width:40%">${escapeHtml(k)}</td><td style="padding:6px 0;font-weight:600">${escapeHtml(v)}</td></tr>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Send a single email via Resend REST API. Works on any runtime that
// provides global fetch (Cloudflare Workers, Pages Functions, Node 18+).
async function sendResendEmail(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}) {
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
      reply_to: opts.replyTo,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json().catch(() => ({}));
}

export const submitSignedContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => submitSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const email = (claims as { email?: string }).email ?? "";
    if (!email) throw new Error("Verified email missing on session.");

    if (
      data.signature_name.trim().toLowerCase() !==
      data.legal_name.trim().toLowerCase()
    ) {
      throw new Error(
        "Signature must exactly match your legal name to bind the agreement.",
      );
    }

    const req = getRequest();
    const ip =
      req?.headers.get("cf-connecting-ip") ??
      req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;
    const ua = req?.headers.get("user-agent") ?? null;
    const origin =
      data.submission_origin ||
      req?.headers.get("origin") ||
      req?.headers.get("referer") ||
      null;

    const { data: row, error } = await supabase
      .from("signed_contracts")
      .insert({
        user_id: userId,
        email,
        legal_name: data.legal_name.trim(),
        stage_name: data.stage_name.trim(),
        address: data.address.trim(),
        nationality: data.nationality.trim(),
        phone: data.phone?.trim() || null,
        signature_name: data.signature_name.trim(),
        signature_data_url: data.signature_data_url || null,
        accepted_terms: data.accepted_terms,
        accepted_revenue_split: data.accepted_revenue_split,
        agreement_version: "360-v1",
        ip_address: ip,
        user_agent: ua,
        timezone: data.timezone || null,
        locale: data.locale || null,
        screen_resolution: data.screen_resolution || null,
        referrer: data.referrer || null,
        submission_origin: origin,
      })
      .select("id, signed_at")
      .single();

    if (error) throw new Error(error.message);

    // ---- Email delivery (independent of Lovable; reads env at runtime) ----
    // Required secrets — set in Cloudflare Pages/Worker env (and as GitHub
    // Actions secrets if you pipe them through CI):
    //   RESEND_API_KEY   — your Resend API key
    //   RESEND_FROM      — verified sender, e.g. "Manilla <contracts@manilla.network>"
    //   ADMIN_EMAIL      — defaults to ideamack@gmail.com if unset
    const apiKey = process.env.RESEND_API_KEY;
    const from =
      process.env.RESEND_FROM ||
      "Manilla Collective <onboarding@resend.dev>";
    const adminEmail = process.env.ADMIN_EMAIL || "ideamack@gmail.com";

    let emailSentAt: string | null = null;
    let adminEmailSentAt: string | null = null;
    let emailError: string | null = null;

    if (apiKey) {
      const signedAtIso = new Date(row.signed_at).toISOString();
      const userMsg = buildEmail({ data, email, contractId: row.id, signedAt: signedAtIso, ip, ua, forAdmin: false });
      const adminMsg = buildEmail({ data, email, contractId: row.id, signedAt: signedAtIso, ip, ua, forAdmin: true });
      try {
        await sendResendEmail({
          apiKey,
          from,
          to: email,
          subject: userMsg.subject,
          html: userMsg.html,
          text: userMsg.text,
          replyTo: adminEmail,
        });
        emailSentAt = new Date().toISOString();
      } catch (e) {
        emailError = e instanceof Error ? e.message : "user email failed";
        console.error("[contract email] user:", emailError);
      }
      try {
        await sendResendEmail({
          apiKey,
          from,
          to: adminEmail,
          subject: adminMsg.subject,
          html: adminMsg.html,
          text: adminMsg.text,
          replyTo: email,
        });
        adminEmailSentAt = new Date().toISOString();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "admin email failed";
        emailError = (emailError ? emailError + " | " : "") + msg;
        console.error("[contract email] admin:", msg);
      }

      if (emailSentAt || adminEmailSentAt) {
        await supabase
          .from("signed_contracts")
          .update({
            email_sent_at: emailSentAt,
            admin_email_sent_at: adminEmailSentAt,
          })
          .eq("id", row.id);
      }
    } else {
      console.warn(
        "[contract email] RESEND_API_KEY not set — skipping email delivery.",
      );
      emailError = "RESEND_API_KEY not configured on server";
    }

    return {
      id: row.id,
      signed_at: row.signed_at,
      email_sent: !!emailSentAt,
      admin_email_sent: !!adminEmailSentAt,
      email_error: emailError,
    };
  });
