import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Public, token-gated test endpoint that verifies the Resend fallback by
// sending one email to each admin-critical recipient and recording the
// per-recipient delivery status in `email_test_log`.
//
// Idempotency:
//   Pass an `Idempotency-Key` header (or `?idempotencyKey=<uuid>` /
//   `?runId=<uuid>`). Repeated calls with the SAME key will NOT re-send to
//   any recipient that already has a `sent` row for that key. A partial
//   unique index on (run_id, recipient) WHERE status='sent' enforces this
//   at the database level — even concurrent calls cannot double-send.
//   If no key is supplied, the server generates one and returns it.
//
// Retry:
//   Each recipient send is retried up to 3 times with exponential backoff
//   on transient failures (HTTP 408/425/429/5xx, fetch network errors).
//   Resend's `Retry-After` header is honored when present. Per-attempt
//   audit rows are written with status `retry`; the final outcome row
//   is `sent` or `failed`.
//
// Auth:
//   `?token=$EMAIL_TEST_TOKEN` or header `x-test-token`. If
//   EMAIL_TEST_TOKEN is unset, the endpoint refuses to run.

const ADMIN_RECIPIENTS: { email: string; purpose: string }[] = [
  { email: "manilla@rald.cloud", purpose: "ops-inbox" },
  { email: "ideamack@gmail.com", purpose: "admin-notifications" },
];

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

const TRANSIENT_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SendResult = {
  ok: boolean;
  status: number;
  body: string;
  json: any;
  retryAfterMs?: number;
};

async function sendResendOnce(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}): Promise<SendResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
      // Resend honors this header — same key = same email, even on retry.
      "Idempotency-Key": opts.idempotencyKey,
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
  const retryAfterRaw = res.headers.get("retry-after");
  let retryAfterMs: number | undefined;
  if (retryAfterRaw) {
    const asNum = Number(retryAfterRaw);
    if (Number.isFinite(asNum)) retryAfterMs = Math.max(0, asNum * 1000);
  }
  return { ok: res.ok, status: res.status, body: bodyText, json: parsed, retryAfterMs };
}

function isTransient(send: SendResult): boolean {
  return TRANSIENT_HTTP.has(send.status);
}

function backoff(attempt: number, hintMs?: number): number {
  if (hintMs && hintMs > 0) return hintMs;
  // 500ms, 1s, 2s + ±20% jitter
  const base = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
        </table>
        <p style="margin-top:20px;font-size:12px;color:#666">LILCKY STUDIO LIMITED · Lagos, Nigeria</p>
      </div>
    </div>
  </body></html>`;
  const text = [
    `Manilla Network — Email delivery test`,
    ``,
    `Run ID:    ${runId}`,
    `Recipient: ${recipient}`,
    `Purpose:   ${purpose}`,
  ].join("\n");
  return { subject, html, text };
}

function getEnv() {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM ||
    "Manilla Collective <manilla@rald.cloud>";
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apiKey, from, supabaseUrl, serviceKey };
}

function authorized(request: Request): boolean {
  const expected = process.env.EMAIL_TEST_TOKEN;
  if (!expected) return false;
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("token");
  const fromHeader = request.headers.get("x-test-token");
  return fromQuery === expected || fromHeader === expected;
}

async function resolveIdempotencyKey(request: Request): Promise<{
  key: string;
  supplied: boolean;
}> {
  const url = new URL(request.url);
  const fromHeader = request.headers.get("idempotency-key");
  const fromQuery =
    url.searchParams.get("idempotencyKey") ?? url.searchParams.get("runId");
  let candidate: string | null = null;

  // Try body too for POST/JSON callers
  if (!fromHeader && !fromQuery && request.method !== "GET") {
    try {
      const cloned = request.clone();
      const json = await cloned.json().catch(() => null);
      if (json && typeof json === "object" && typeof json.idempotencyKey === "string") {
        candidate = json.idempotencyKey;
      }
    } catch { /* ignore */ }
  }
  candidate = (fromHeader || fromQuery || candidate || "").trim();

  if (candidate && UUID_RE.test(candidate)) return { key: candidate, supplied: true };
  return { key: crypto.randomUUID(), supplied: false };
}

async function runTest(request: Request) {
  const { apiKey, from, supabaseUrl, serviceKey } = getEnv();

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

  const { key: runId, supplied: keySupplied } = await resolveIdempotencyKey(request);
  const startedAt = new Date().toISOString();
  const ua = request.headers.get("user-agent") ?? null;

  // Pre-check: skip recipients that already have a `sent` row for this key.
  const { data: alreadySent } = await admin
    .from("email_test_log")
    .select("recipient, provider_message_id")
    .eq("run_id", runId)
    .eq("status", "sent");
  const skipMap = new Map<string, string | null>(
    (alreadySent ?? []).map((r: any) => [r.recipient, r.provider_message_id ?? null]),
  );

  const results = await Promise.all(
    ADMIN_RECIPIENTS.map(async ({ email, purpose }) => {
      if (skipMap.has(email)) {
        return {
          recipient: email,
          purpose,
          status: "skipped",
          providerId: skipMap.get(email) ?? null,
          attempts: 0,
          errorMessage: null,
          reason: "idempotent: already sent for this key",
        };
      }

      const { subject, html, text } = buildTestEmail(runId, email, purpose);
      // Per-recipient idempotency token shipped to Resend.
      const perRecipientKey = `${runId}:${email}`;

      let lastErr: string | null = null;
      let lastStatus = 0;
      let providerId: string | null = null;
      let succeeded = false;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let send: SendResult | null = null;
        try {
          send = await sendResendOnce({
            apiKey,
            from,
            to: email,
            subject,
            html,
            text,
            idempotencyKey: perRecipientKey,
          });
        } catch (err) {
          lastErr = `network: ${err instanceof Error ? err.message : String(err)}`;
          // network failure = transient
          await admin.from("email_test_log").insert({
            run_id: runId,
            recipient: email,
            purpose,
            status: "retry",
            error_message: lastErr,
            from_address: from,
            metadata: { attempt, ua, started_at: startedAt, transport: "network_error" },
          });
          if (attempt < MAX_ATTEMPTS) {
            await sleep(backoff(attempt));
            continue;
          }
          break;
        }

        lastStatus = send.status;
        if (send.ok) {
          providerId = send.json?.id ?? null;
          // DB-enforced idempotency: unique partial index on (run_id,
          // recipient) WHERE status='sent'. If a concurrent caller already
          // logged success, this insert will conflict — that's the desired
          // "no double-send" outcome.
          const ins = await admin.from("email_test_log").insert({
            run_id: runId,
            recipient: email,
            purpose,
            status: "sent",
            provider_message_id: providerId,
            from_address: from,
            metadata: {
              attempt,
              ua,
              started_at: startedAt,
              http_status: send.status,
              idempotency_key: perRecipientKey,
            },
          });
          if (ins.error && !/duplicate key/i.test(ins.error.message)) {
            lastErr = `db: ${ins.error.message}`;
            break;
          }
          succeeded = true;
          break;
        }

        lastErr = `Resend ${send.status}: ${send.body.slice(0, 400)}`;
        const transient = isTransient(send);
        await admin.from("email_test_log").insert({
          run_id: runId,
          recipient: email,
          purpose,
          status: transient ? "retry" : "failed",
          error_message: lastErr,
          from_address: from,
          metadata: {
            attempt,
            ua,
            started_at: startedAt,
            http_status: send.status,
            transient,
            retry_after_ms: send.retryAfterMs ?? null,
          },
        });

        if (!transient || attempt === MAX_ATTEMPTS) break;
        await sleep(backoff(attempt, send.retryAfterMs));
      }

      if (succeeded) {
        return {
          recipient: email,
          purpose,
          status: "sent",
          providerId,
          attempts: MAX_ATTEMPTS,
          errorMessage: null,
        };
      }

      // Final failure row (terminal). Use distinct status so retry rows
      // remain auditable.
      await admin.from("email_test_log").insert({
        run_id: runId,
        recipient: email,
        purpose,
        status: "failed_final",
        error_message: lastErr,
        from_address: from,
        metadata: {
          ua,
          started_at: startedAt,
          last_http_status: lastStatus,
          attempts: MAX_ATTEMPTS,
        },
      });
      return {
        recipient: email,
        purpose,
        status: "failed",
        providerId: null,
        attempts: MAX_ATTEMPTS,
        errorMessage: lastErr,
      };
    }),
  );

  const allOk = results.every((r) => r.status === "sent" || r.status === "skipped");
  return Response.json(
    {
      ok: allOk,
      run_id: runId,
      idempotency_key: runId,
      idempotency_key_supplied: keySupplied,
      from,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      results,
    },
    { status: allOk ? 200 : 502 },
  );
}

async function fetchRun(runId: string) {
  const { supabaseUrl, serviceKey } = getEnv();
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
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const url = new URL(request.url);
        const inspectRun = url.searchParams.get("inspect");
        if (inspectRun) return fetchRun(inspectRun);
        return runTest(request);
      },
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        return runTest(request);
      },
    },
  },
});
