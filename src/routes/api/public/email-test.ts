import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Public test endpoint that verifies the Resend fallback by sending one
// email to each of the admin-critical recipients and recording per-recipient
// delivery status in `email_test_log`.
//
// Auth: pass `?token=<EMAIL_TEST_TOKEN>` OR header `x-test-token`. If
// EMAIL_TEST_TOKEN is not configured on the server, the endpoint refuses
// to run (avoids public abuse).
//
// Usage:
//   GET  /api/public/email-test?token=...        → runs the test
//   GET  /api/public/email-test?token=...&runId=<uuid>  → fetch results
//   POST /api/public/email-test  (same auth)     → runs the test
//
// All needed secrets (RESEND_API_KEY, RESEND_FROM, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, EMAIL_TEST_TOKEN) are read from process.env
// — set them as GitHub secrets and they will flow into Cloudflare Pages.

const ADMIN_RECIPIENTS: { email: string; purpose: string }[] = [
  { email: "manilla@rald.cloud", purpose: "ops-inbox" },
  { email: "ideamack@gmail.com", purpose: "admin-notifications" },
];

async function sendResend(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
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
    }),
  });
  const bodyText = await res.text().catch(() => "");
  let parsed: any = null;
  try { parsed = JSON.parse(bodyText); } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, body: bodyText, json: parsed };
}

function buildTestEmail(runId: string, recipient: string, purpose: string) {
  const subject = `[Manilla Network] Resend fallback test — ${purpose}`;
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;margin:0;padding:24px;color:#111">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:14px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#0a0a0a,#1a1a1a);padding:24px;text-align:center;color:#fff">
        <div style="font-size:11px;letter-spacing:.3em;color:#ff8a3d;font-weight:700">MANILLA NETWORK</div>
        <h1 style="margin:8px 0 0;font-size:20px">Email delivery test</h1>
      </div>
      <div style="padding:24px;font-size:14px;line-height:1.5">
        <p>This is an automated test of the <strong>Resend fallback</strong> delivery channel.</p>
        <p>If you received this, transactional and admin emails for <strong>${purpose}</strong> will reach <code>${recipient}</code>.</p>
        <table style="font-size:13px;margin-top:12px">
          <tr><td style="color:#888;padding-right:12px">Run ID</td><td><code>${runId}</code></td></tr>
          <tr><td style="color:#888;padding-right:12px">Recipient</td><td>${recipient}</td></tr>
          <tr><td style="color:#888;padding-right:12px">Purpose</td><td>${purpose}</td></tr>
          <tr><td style="color:#888;padding-right:12px">Sent at (UTC)</td><td>${new Date().toISOString()}</td></tr>
        </table>
        <p style="margin-top:20px;font-size:12px;color:#666">Source: <code>/api/public/email-test</code> · LILCKY STUDIO LIMITED · Lagos, Nigeria</p>
      </div>
    </div>
  </body></html>`;
  const text = [
    `Manilla Network — Email delivery test`,
    ``,
    `Run ID:    ${runId}`,
    `Recipient: ${recipient}`,
    `Purpose:   ${purpose}`,
    `Sent at:   ${new Date().toISOString()}`,
    ``,
    `If you received this, transactional & admin emails are working.`,
  ].join("\n");
  return { subject, html, text };
}

async function runTest(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM ||
    "Manilla Collective <manilla@rald.cloud>";
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!apiKey) {
    return Response.json(
      { ok: false, error: "RESEND_API_KEY not configured on server" },
      { status: 500 },
    );
  }
  if (!supabaseUrl || !serviceKey) {
    return Response.json(
      { ok: false, error: "Supabase server credentials not configured" },
      { status: 500 },
    );
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const ua = request.headers.get("user-agent") ?? null;

  const results = await Promise.all(
    ADMIN_RECIPIENTS.map(async ({ email, purpose }) => {
      const { subject, html, text } = buildTestEmail(runId, email, purpose);
      try {
        const send = await sendResend({ apiKey, from, to: email, subject, html, text });
        const status = send.ok ? "sent" : "failed";
        const providerId = send.json?.id ?? null;
        const errorMessage = send.ok
          ? null
          : `Resend ${send.status}: ${send.body.slice(0, 400)}`;

        await admin.from("email_test_log").insert({
          run_id: runId,
          recipient: email,
          purpose,
          status,
          provider_message_id: providerId,
          error_message: errorMessage,
          from_address: from,
          metadata: { ua, started_at: startedAt, http_status: send.status },
        });

        return { recipient: email, purpose, status, providerId, errorMessage };
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err);
        await admin.from("email_test_log").insert({
          run_id: runId,
          recipient: email,
          purpose,
          status: "error",
          error_message: errorMessage,
          from_address: from,
          metadata: { ua, started_at: startedAt },
        });
        return { recipient: email, purpose, status: "error", errorMessage };
      }
    }),
  );

  const allOk = results.every((r) => r.status === "sent");
  return Response.json(
    {
      ok: allOk,
      run_id: runId,
      from,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      results,
    },
    { status: allOk ? 200 : 502 },
  );
}

function authorized(request: Request): boolean {
  const expected = process.env.EMAIL_TEST_TOKEN;
  if (!expected) return false;
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("token");
  const fromHeader = request.headers.get("x-test-token");
  return fromQuery === expected || fromHeader === expected;
}

async function fetchRun(runId: string) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return Response.json(
      { ok: false, error: "Supabase server credentials not configured" },
      { status: 500 },
    );
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
  const { data, error } = await admin
    .from("email_test_log")
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, run_id: runId, rows: data ?? [] });
}

export const Route = createFileRoute("/api/public/email-test")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorized(request)) {
          return new Response("Unauthorized", { status: 401 });
        }
        const url = new URL(request.url);
        const runId = url.searchParams.get("runId");
        if (runId) return fetchRun(runId);
        return runTest(request);
      },
      POST: async ({ request }) => {
        if (!authorized(request)) {
          return new Response("Unauthorized", { status: 401 });
        }
        return runTest(request);
      },
    },
  },
});
