import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildContractPdf } from "./contract-pdf";

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
  logoUrl: string;
}) {
  const { data, email, contractId, signedAt, ip, ua, forAdmin, logoUrl } = args;
  const ref = contractId.slice(0, 8).toUpperCase();
  const subject = forAdmin
    ? `[Manilla Collective] New signed 360° agreement — ${data.stage_name} (${ref})`
    : `Welcome to Manilla Collective — Your 360° Agreement (Ref ${ref})`;

  const artistGreeting = forAdmin
    ? `<p style="margin:0 0 12px;font-size:15px;color:#1a1a1a">A new artist has signed the <strong>Exclusive 360° Artist Agreement</strong>. Full signed contract attached as PDF.</p>`
    : `<p style="margin:0 0 8px;font-size:16px;color:#1a1a1a">Hi <strong style="color:#c2410c">${escapeHtml(data.stage_name)}</strong>,</p>
       <p style="margin:0 0 12px;font-size:15px;color:#1a1a1a;line-height:1.55">Welcome to the family. Your <strong>Exclusive 360° Artist Agreement</strong> with <strong>Manilla Collective</strong> has been signed and securely recorded on the Manilla Network. Your full signed contract is attached as a PDF for your records.</p>`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#fff7ed;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
  <div style="max-width:620px;margin:0 auto;padding:24px">
    <div style="background:linear-gradient(135deg,#0a0a0a 0%,#1a1a1a 55%,#3a1a05 100%);padding:32px 24px;border-radius:16px 16px 0 0;text-align:center;color:#fff;border-bottom:4px solid #ff8a3d">
      <img src="${logoUrl}" alt="Manilla Network" width="84" height="84" style="display:block;margin:0 auto 12px;border-radius:14px;background:#fff;padding:6px" />
      <div style="font-size:11px;letter-spacing:.35em;color:#ff8a3d;font-weight:800">MANILLA NETWORK</div>
      <h1 style="margin:10px 0 0;font-size:22px;font-weight:700;letter-spacing:.01em">Exclusive 360° Artist Agreement</h1>
      <div style="margin-top:6px;font-size:12px;color:#fcd9b8;letter-spacing:.15em">MANILLA COLLECTIVE · LAGOS</div>
    </div>
    <div style="background:#fff;border:1px solid #fed7aa;border-top:none;border-radius:0 0 16px 16px;padding:28px 24px;box-shadow:0 8px 24px rgba(194,65,12,.08)">
      ${artistGreeting}
      <div style="margin:18px 0 8px;padding:14px 16px;background:linear-gradient(90deg,#fff7ed,#ffedd5);border-left:4px solid #ff8a3d;border-radius:6px">
        <div style="font-size:10px;letter-spacing:.2em;color:#9a3412;font-weight:700">CONTRACT REFERENCE</div>
        <div style="font-size:20px;font-weight:800;color:#0a0a0a;letter-spacing:.05em;margin-top:2px">${ref}</div>
      </div>
      <table style="width:100%;font-size:14px;border-collapse:collapse;margin-top:14px">
        <tbody>
          ${row("Legal name", data.legal_name)}
          ${row("Stage name", data.stage_name)}
          ${row("Email (verified)", email)}
          ${row("Nationality", data.nationality)}
          ${row("Address", data.address)}
          ${data.phone ? row("Phone", data.phone) : ""}
          ${row("Signed at (UTC)", signedAt)}
          ${row("Agreement version", "360-v1")}
          ${forAdmin ? row("IP", ip ?? "—") : ""}
          ${forAdmin ? row("User agent", (ua ?? "—").slice(0, 120)) : ""}
          ${forAdmin && data.timezone ? row("Timezone", data.timezone) : ""}
          ${forAdmin && data.locale ? row("Locale", data.locale) : ""}
          ${forAdmin && data.screen_resolution ? row("Screen", data.screen_resolution) : ""}
          ${forAdmin && data.submission_origin ? row("Origin", data.submission_origin) : ""}
        </tbody>
      </table>
      <div style="margin-top:22px;padding:14px 16px;background:#0a0a0a;border-radius:10px;color:#fff;text-align:center">
        <div style="font-size:11px;letter-spacing:.25em;color:#ff8a3d;font-weight:700">PDF ATTACHED</div>
        <div style="font-size:13px;margin-top:4px;color:#fcd9b8">Your fully branded signed agreement is attached to this email.</div>
      </div>
      ${
        forAdmin
          ? ""
          : `<p style="margin-top:18px;font-size:14px;color:#1a1a1a;line-height:1.6">Our A&R and operations team will reach out within <strong>48 hours</strong> to onboard you onto your artist dashboard.</p>
             <p style="margin:8px 0 0;font-size:13px;color:#9a3412">If you didn't sign this agreement, reply to this email immediately.</p>`
      }
      <p style="margin-top:26px;font-size:11px;color:#9a3412;text-align:center;letter-spacing:.25em;font-weight:600">
        LILCKY STUDIO LIMITED · LAGOS, NIGERIA
      </p>
    </div>
    <p style="text-align:center;font-size:10px;color:#a8a29e;margin-top:14px;letter-spacing:.1em">© ${new Date().getFullYear()} Manilla Network · Manilla Collective</p>
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
    `Your full signed contract PDF is attached.`,
    ``,
    `LILCKY STUDIO LIMITED — Lagos, Nigeria`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

function row(k: string, v: string) {
  return `<tr><td style="padding:7px 0;color:#9a3412;font-size:11px;text-transform:uppercase;letter-spacing:.1em;width:40%;font-weight:600;border-bottom:1px solid #fff7ed">${escapeHtml(k)}</td><td style="padding:7px 0;font-weight:600;color:#0a0a0a;border-bottom:1px solid #fff7ed">${escapeHtml(v)}</td></tr>`;
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
  attachments?: Array<{ filename: string; content: string }>;
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
      attachments: opts.attachments,
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
    //   RESEND_API_KEY   — your Resend API key (from GitHub → Cloudflare env)
    //   RESEND_FROM      — verified sender; falls back to manilla@rald.cloud
    //   ADMIN_EMAIL      — defaults to ideamack@gmail.com if unset
    const apiKey = process.env.RESEND_API_KEY;
    const from =
      process.env.RESEND_FROM ||
      "Manilla Collective <manilla@rald.cloud>";
    const adminEmail = process.env.ADMIN_EMAIL || "ideamack@gmail.com";

    let emailSentAt: string | null = null;
    let adminEmailSentAt: string | null = null;
    let emailError: string | null = null;

    if (apiKey) {
      const signedAtIso = new Date(row.signed_at).toISOString();
      const ref = row.id.slice(0, 8).toUpperCase();

      // Build branded logo URL from request origin (served from /public)
      const reqOrigin =
        req?.headers.get("origin") ||
        (req?.headers.get("referer")
          ? new URL(req.headers.get("referer")!).origin
          : "") ||
        process.env.PUBLIC_SITE_URL ||
        "";
      const logoUrl = reqOrigin
        ? `${reqOrigin.replace(/\/$/, "")}/manilla-logo.png`
        : "https://manilla.network/manilla-logo.png";

      // Generate the full branded, colored signed contract PDF on the server
      let pdfBase64: string | null = null;
      try {
        const pdf = buildContractPdf({
          legal_name: data.legal_name,
          stage_name: data.stage_name,
          address: data.address,
          nationality: data.nationality,
          phone: data.phone || undefined,
          email,
          signature_name: data.signature_name,
          signature_data_url: data.signature_data_url || null,
          reference: ref,
          signed_at: signedAtIso,
        });
        pdfBase64 = pdf.output("datauristring").split(",")[1] ?? null;
      } catch (e) {
        console.error("[contract pdf] generation failed:", e);
      }

      const pdfFilename = `Manilla-360-Agreement-${ref}.pdf`;
      const attachments = pdfBase64
        ? [{ filename: pdfFilename, content: pdfBase64 }]
        : undefined;

      const userMsg = buildEmail({ data, email, contractId: row.id, signedAt: signedAtIso, ip, ua, forAdmin: false, logoUrl });
      const adminMsg = buildEmail({ data, email, contractId: row.id, signedAt: signedAtIso, ip, ua, forAdmin: true, logoUrl });
      try {
        await sendResendEmail({
          apiKey,
          from,
          to: email,
          subject: userMsg.subject,
          html: userMsg.html,
          text: userMsg.text,
          replyTo: adminEmail,
          attachments,
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
          attachments,
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
