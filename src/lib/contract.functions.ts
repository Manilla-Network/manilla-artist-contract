import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildContractPdf } from "./contract-pdf";
import { checkRateLimit } from "./rate-limiter";

// ── Application ID ────────────────────────────────────────────────────────────
function generateApplicationId(): string {
  const year = new Date().getFullYear();
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
    .join("");
  return `MC-${year}-${hex}`;
}

// ── IP hashing ────────────────────────────────────────────────────────────────
async function hashIp(ip: string): Promise<string> {
  try {
    const enc = new TextEncoder();
    const buf = await globalThis.crypto.subtle.digest(
      "SHA-256",
      enc.encode(ip + "mc-salt-2026"),
    );
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  } catch {
    return "unknown";
  }
}

// ── Validation schema ─────────────────────────────────────────────────────────
const submitSchema = z.object({
  legal_name: z.string().trim().min(2).max(120),
  stage_name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  country: z.string().trim().min(1).max(100),
  date_of_birth: z.string().trim().min(8).max(12),
  genre: z.string().trim().min(1).max(80),
  years_active: z.number().int().min(0).max(100),
  bio: z.string().trim().min(10).max(2000),
  spotify_url: z.string().trim().url().optional().or(z.literal("")),
  apple_music_url: z.string().trim().url().optional().or(z.literal("")),
  audiomack_url: z.string().trim().url().optional().or(z.literal("")),
  boomplay_url: z.string().trim().url().optional().or(z.literal("")),
  youtube_url: z.string().trim().url().optional().or(z.literal("")),
  tiktok_url: z.string().trim().url().optional().or(z.literal("")),
  instagram_url: z.string().trim().url().optional().or(z.literal("")),
  website_url: z.string().trim().url().optional().or(z.literal("")),
  artist_photo_url: z.string().trim().max(2000).optional().or(z.literal("")),
  press_kit_url: z.string().trim().max(2000).optional().or(z.literal("")),
  signature_name: z.string().trim().min(2).max(120),
  signature_data_url: z.string().max(500_000).optional().or(z.literal("")),
  accepted_terms: z.literal(true),
  accepted_revenue_split: z.literal(true),
  timezone: z.string().max(80).optional().or(z.literal("")),
  locale: z.string().max(40).optional().or(z.literal("")),
  screen_resolution: z.string().max(40).optional().or(z.literal("")),
  referrer: z.string().max(500).optional().or(z.literal("")),
  submission_origin: z.string().max(200).optional().or(z.literal("")),
});

type SubmitData = z.infer<typeof submitSchema>;

// ── HTML escape ───────────────────────────────────────────────────────────────
function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function row(k: string, v: string) {
  return `<tr><td style="padding:7px 0;color:#9a3412;font-size:11px;text-transform:uppercase;letter-spacing:.1em;width:38%;font-weight:600;border-bottom:1px solid #fff7ed;vertical-align:top">${esc(k)}</td><td style="padding:7px 0;font-weight:600;color:#0a0a0a;border-bottom:1px solid #fff7ed">${esc(v)}</td></tr>`;
}

function socialRow(platform: string, url: string) {
  if (!url) return "";
  return `<tr><td style="padding:5px 0;color:#9a3412;font-size:11px;text-transform:uppercase;letter-spacing:.1em;width:38%;font-weight:600">${esc(platform)}</td><td style="padding:5px 0;font-weight:600;color:#0a0a0a"><a href="${esc(url)}" style="color:#c2410c">${esc(url.replace(/^https?:\/\//, "").slice(0, 60))}</a></td></tr>`;
}

// ── Email builder ─────────────────────────────────────────────────────────────
function buildEmail(args: {
  data: SubmitData;
  email: string;
  applicationId: string;
  signedAt: string;
  ip: string | null;
  ipHash: string;
  ua: string | null;
  forAdmin: boolean;
  logoUrl: string;
}) {
  const { data, email, applicationId, signedAt, ip, ipHash, ua, forAdmin, logoUrl } = args;

  const subject = forAdmin
    ? `[Manilla Collective] New signed 360° agreement — ${data.stage_name} (${applicationId})`
    : `Welcome to Manilla Collective — Your 360° Agreement (${applicationId})`;

  const socials = [
    ["Spotify", data.spotify_url ?? ""],
    ["Apple Music", data.apple_music_url ?? ""],
    ["Audiomack", data.audiomack_url ?? ""],
    ["Boomplay", data.boomplay_url ?? ""],
    ["YouTube", data.youtube_url ?? ""],
    ["TikTok", data.tiktok_url ?? ""],
    ["Instagram", data.instagram_url ?? ""],
    ["Website", data.website_url ?? ""],
  ].filter(([, v]) => v);

  const greeting = forAdmin
    ? `<p style="margin:0 0 12px;font-size:15px;color:#1a1a1a">A new artist has signed the <strong>Exclusive 360° Artist Agreement</strong>. Full signed contract attached as PDF.</p>`
    : `<p style="margin:0 0 8px;font-size:16px;color:#1a1a1a">Hi <strong style="color:#c2410c">${esc(data.stage_name)}</strong>,</p>
       <p style="margin:0 0 12px;font-size:15px;color:#1a1a1a;line-height:1.55">Welcome to the family. Your <strong>Exclusive 360° Artist Agreement</strong> with <strong>Manilla Collective</strong> has been signed and securely recorded. Your full signed contract is attached as a PDF for your records.</p>`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#fff7ed;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
<div style="max-width:640px;margin:0 auto;padding:24px">
  <div style="background:linear-gradient(135deg,#0a0a0a 0%,#1a1a1a 55%,#3a1a05 100%);padding:32px 24px;border-radius:16px 16px 0 0;text-align:center;color:#fff;border-bottom:4px solid #ff8a3d">
    <img src="${logoUrl}" alt="Manilla Network" width="72" height="72" style="display:block;margin:0 auto 12px;border-radius:14px;background:#fff;padding:6px" />
    <div style="font-size:11px;letter-spacing:.35em;color:#ff8a3d;font-weight:800">MANILLA NETWORK</div>
    <h1 style="margin:10px 0 0;font-size:22px;font-weight:700;letter-spacing:.01em">Exclusive 360° Artist Agreement</h1>
    <div style="margin-top:6px;font-size:12px;color:#fcd9b8;letter-spacing:.15em">MANILLA COLLECTIVE · LAGOS</div>
  </div>
  <div style="background:#fff;border:1px solid #fed7aa;border-top:none;border-radius:0 0 16px 16px;padding:28px 24px;box-shadow:0 8px 24px rgba(194,65,12,.08)">
    ${greeting}
    <div style="margin:18px 0 8px;padding:14px 16px;background:linear-gradient(90deg,#fff7ed,#ffedd5);border-left:4px solid #ff8a3d;border-radius:6px">
      <div style="font-size:10px;letter-spacing:.2em;color:#9a3412;font-weight:700">APPLICATION ID</div>
      <div style="font-size:22px;font-weight:800;color:#0a0a0a;letter-spacing:.08em;margin-top:2px;font-family:monospace">${esc(applicationId)}</div>
    </div>
    <table style="width:100%;font-size:14px;border-collapse:collapse;margin-top:14px">
      <tbody>
        ${row("Legal Name", data.legal_name)}
        ${row("Stage Name", data.stage_name)}
        ${row("Email (verified)", email)}
        ${data.phone ? row("Phone", data.phone) : ""}
        ${row("City", data.city)}
        ${row("State / Province", data.state)}
        ${row("Country", data.country)}
        ${row("Date of Birth", data.date_of_birth)}
        ${row("Genre", data.genre)}
        ${row("Years Active", String(data.years_active))}
        ${row("Signed At (UTC)", signedAt)}
        ${row("Agreement Version", "360-v1")}
        ${forAdmin ? row("IP Address", ip ?? "—") : ""}
        ${forAdmin ? row("IP Hash", ipHash) : ""}
        ${forAdmin ? row("User Agent", (ua ?? "—").slice(0, 120)) : ""}
        ${forAdmin && data.timezone ? row("Timezone", data.timezone) : ""}
        ${forAdmin && data.locale ? row("Locale", data.locale) : ""}
        ${forAdmin && data.screen_resolution ? row("Screen", data.screen_resolution) : ""}
        ${forAdmin && data.submission_origin ? row("Origin", data.submission_origin) : ""}
      </tbody>
    </table>
    ${
      data.bio
        ? `<div style="margin-top:16px;padding:12px 16px;background:#fffbf5;border:1px solid #fed7aa;border-radius:8px">
             <div style="font-size:10px;letter-spacing:.2em;color:#9a3412;font-weight:700;margin-bottom:6px">ARTIST BIO</div>
             <p style="margin:0;font-size:14px;color:#1a1a1a;line-height:1.6">${esc(data.bio)}</p>
           </div>`
        : ""
    }
    ${
      socials.length
        ? `<div style="margin-top:16px">
             <div style="font-size:10px;letter-spacing:.2em;color:#9a3412;font-weight:700;margin-bottom:8px">SOCIAL &amp; STREAMING</div>
             <table style="width:100%;font-size:13px;border-collapse:collapse">
               <tbody>${socials.map(([p, u]) => socialRow(p, u)).join("")}</tbody>
             </table>
           </div>`
        : ""
    }
    ${
      forAdmin && (data.artist_photo_url || data.press_kit_url)
        ? `<div style="margin-top:16px;padding:12px 16px;background:#fffbf5;border:1px solid #fed7aa;border-radius:8px">
             <div style="font-size:10px;letter-spacing:.2em;color:#9a3412;font-weight:700;margin-bottom:8px">UPLOADED ASSETS</div>
             ${data.artist_photo_url ? `<p style="margin:0 0 6px;font-size:13px"><strong>Artist Photo:</strong> <a href="${esc(data.artist_photo_url)}" style="color:#c2410c">View / Download</a></p>` : ""}
             ${data.press_kit_url ? `<p style="margin:0;font-size:13px"><strong>Press Kit PDF:</strong> <a href="${esc(data.press_kit_url)}" style="color:#c2410c">View / Download</a></p>` : ""}
           </div>`
        : ""
    }
    <div style="margin-top:22px;padding:14px 16px;background:#0a0a0a;border-radius:10px;color:#fff;text-align:center">
      <div style="font-size:11px;letter-spacing:.25em;color:#ff8a3d;font-weight:700">SIGNED CONTRACT PDF ATTACHED</div>
      <div style="font-size:13px;margin-top:4px;color:#fcd9b8">Your fully branded signed agreement is attached to this email.</div>
    </div>
    ${
      forAdmin
        ? ""
        : `<p style="margin-top:18px;font-size:14px;color:#1a1a1a;line-height:1.6">Our A&R and operations team will reach out within <strong>48 hours</strong> to begin onboarding you onto your artist dashboard.</p>
           <p style="margin:8px 0 0;font-size:13px;color:#9a3412">If you did not sign this agreement, reply to this email immediately.</p>`
    }
    <p style="margin-top:26px;font-size:11px;color:#9a3412;text-align:center;letter-spacing:.25em;font-weight:600">LILCKY STUDIO LIMITED · LAGOS, NIGERIA</p>
  </div>
  <p style="text-align:center;font-size:10px;color:#a8a29e;margin-top:14px;letter-spacing:.1em">© ${new Date().getFullYear()} Manilla Network · Manilla Collective</p>
</div>
</body></html>`;

  const text = [
    forAdmin ? `New signed 360° agreement — ${applicationId}` : `Welcome to Manilla Collective, ${data.stage_name}.`,
    ``,
    `Application ID: ${applicationId}`,
    `Legal name:     ${data.legal_name}`,
    `Stage name:     ${data.stage_name}`,
    `Email:          ${email}`,
    data.phone ? `Phone:          ${data.phone}` : ``,
    `Location:       ${data.city}, ${data.state}, ${data.country}`,
    `Date of Birth:  ${data.date_of_birth}`,
    `Genre:          ${data.genre}`,
    `Years Active:   ${data.years_active}`,
    `Signed at UTC:  ${signedAt}`,
    `Agreement:      360-v1`,
    forAdmin ? `IP: ${ip ?? "-"} | Hash: ${ipHash}` : ``,
    forAdmin ? `User Agent: ${ua ?? "-"}` : ``,
    data.bio ? `\nBio:\n${data.bio}` : ``,
    socials.length ? `\nSocial/Streaming:\n${socials.map(([p, u]) => `  ${p}: ${u}`).join("\n")}` : ``,
    forAdmin && data.artist_photo_url ? `\nArtist Photo: ${data.artist_photo_url}` : ``,
    forAdmin && data.press_kit_url ? `Press Kit: ${data.press_kit_url}` : ``,
    `\nFull signed contract PDF is attached.`,
    `\nLILCKY STUDIO LIMITED — Lagos, Nigeria`,
  ]
    .filter((l) => l !== undefined && l !== null)
    .join("\n");

  return { subject, html, text };
}

// ── Resend delivery ───────────────────────────────────────────────────────────
async function sendResendEmail(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: string }>;
}): Promise<void> {
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
}

// ── Server function ───────────────────────────────────────────────────────────
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

    // Rate limit: max 3 submissions per user per hour
    const rlResult = checkRateLimit(`submit:${userId}`, 3, 3_600_000);
    if (!rlResult.allowed) {
      throw new Error("Too many submissions. Please try again later.");
    }

    const ipHash = ip ? await hashIp(ip) : "unknown";
    const applicationId = generateApplicationId();
    const address = `${data.city}, ${data.state}, ${data.country}`;

    const { data: record, error } = await supabase
      .from("signed_contracts")
      .insert({
        user_id: userId,
        email,
        application_id: applicationId,
        legal_name: data.legal_name.trim(),
        stage_name: data.stage_name.trim(),
        address,
        nationality: data.country.trim(),
        phone: data.phone?.trim() || null,
        city: data.city.trim(),
        state: data.state.trim(),
        country: data.country.trim(),
        date_of_birth: data.date_of_birth,
        genre: data.genre.trim(),
        years_active: data.years_active,
        bio: data.bio.trim(),
        spotify_url: data.spotify_url || null,
        apple_music_url: data.apple_music_url || null,
        audiomack_url: data.audiomack_url || null,
        boomplay_url: data.boomplay_url || null,
        youtube_url: data.youtube_url || null,
        tiktok_url: data.tiktok_url || null,
        instagram_url: data.instagram_url || null,
        website_url: data.website_url || null,
        artist_photo_url: data.artist_photo_url || null,
        press_kit_url: data.press_kit_url || null,
        signature_name: data.signature_name.trim(),
        signature_data_url: data.signature_data_url || null,
        accepted_terms: data.accepted_terms,
        accepted_revenue_split: data.accepted_revenue_split,
        agreement_version: "360-v1",
        ip_address: ip,
        ip_hash: ipHash,
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

    const apiKey = process.env.RESEND_API_KEY;
    const from =
      process.env.RESEND_FROM ||
      "Manilla Collective <exclusive@rald.cloud>";
    const adminEmail = process.env.ADMIN_EMAIL || "ideamack@gmail.com";

    let emailSentAt: string | null = null;
    let adminEmailSentAt: string | null = null;
    let emailError: string | null = null;

    if (apiKey) {
      const signedAtIso = new Date(record.signed_at).toISOString();

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

      let pdfBase64: string | null = null;
      try {
        const pdf = buildContractPdf({
          legal_name: data.legal_name,
          stage_name: data.stage_name,
          address,
          nationality: data.country,
          phone: data.phone || undefined,
          email,
          city: data.city,
          state: data.state,
          country: data.country,
          date_of_birth: data.date_of_birth,
          genre: data.genre,
          years_active: data.years_active,
          bio: data.bio,
          spotify_url: data.spotify_url,
          apple_music_url: data.apple_music_url,
          audiomack_url: data.audiomack_url,
          boomplay_url: data.boomplay_url,
          youtube_url: data.youtube_url,
          tiktok_url: data.tiktok_url,
          instagram_url: data.instagram_url,
          website_url: data.website_url,
          signature_name: data.signature_name,
          signature_data_url: data.signature_data_url || null,
          reference: applicationId,
          signed_at: signedAtIso,
        });
        pdfBase64 = pdf.output("datauristring").split(",")[1] ?? null;
      } catch (e) {
        console.error("[contract pdf] generation failed:", e);
      }

      const pdfFilename = `Manilla-360-Agreement-${applicationId}.pdf`;
      const attachments = pdfBase64
        ? [{ filename: pdfFilename, content: pdfBase64 }]
        : undefined;

      const userMsg = buildEmail({
        data,
        email,
        applicationId,
        signedAt: signedAtIso,
        ip,
        ipHash,
        ua,
        forAdmin: false,
        logoUrl,
      });
      const adminMsg = buildEmail({
        data,
        email,
        applicationId,
        signedAt: signedAtIso,
        ip,
        ipHash,
        ua,
        forAdmin: true,
        logoUrl,
      });

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
          .eq("id", record.id);
      }
    } else {
      console.warn("[contract email] RESEND_API_KEY not set — skipping email delivery.");
      emailError = "RESEND_API_KEY not configured on server";
    }

    return {
      id: record.id,
      application_id: applicationId,
      signed_at: record.signed_at,
      email_sent: !!emailSentAt,
      admin_email_sent: !!adminEmailSentAt,
      email_error: emailError,
    };
  });
