import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Mail, ShieldCheck, ChevronRight, ChevronLeft, Check, FileSignature, Sparkles, AlertTriangle, Download, Eraser, Pen, Type } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { submitSignedContract } from "@/lib/contract.functions";
import { downloadContractPdf } from "@/lib/contract-pdf";
import { SignaturePadCanvas, type SignaturePadHandle } from "@/components/SignaturePadCanvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast, Toaster } from "sonner";
import logo from "@/assets/manilla-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Manilla Collective — Sign Your 360° Artist Agreement" },
      { name: "description", content: "Sign the Manilla Collective Exclusive 360° Artist Agreement. Verified, secure, and binding — built for African artists going global." },
      { property: "og:title", content: "Manilla Collective — Sign Your 360° Artist Agreement" },
      { property: "og:description", content: "A 360° partnership for African artists going global. Sign in 5 simple steps." },
    ],
  }),
  component: SignPage,
});

type ArtistData = {
  legal_name: string;
  stage_name: string;
  address: string;
  nationality: string;
  phone: string;
};

const STEPS = [
  { n: 1, title: "Verify Email", icon: Mail },
  { n: 2, title: "Your Identity", icon: ShieldCheck },
  { n: 3, title: "Read Agreement", icon: FileSignature },
  { n: 4, title: "Revenue Split", icon: Sparkles },
  { n: 5, title: "Sign & Submit", icon: Check },
] as const;

function SignPage() {
  const [step, setStep] = useState(1);

  // Step 1
  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  // Steps 2–5
  const [artist, setArtist] = useState<ArtistData>({
    legal_name: "",
    stage_name: "",
    address: "",
    nationality: "Nigerian",
    phone: "",
  });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedRevenue, setAcceptedRevenue] = useState(false);
  const [signature, setSignature] = useState("");
  const [sigMode, setSigMode] = useState<"type" | "draw">("type");
  const sigPadRef = useRef<SignaturePadHandle>(null);
  const [drawnEmpty, setDrawnEmpty] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState<
    { id: string; signed_at: string; email_sent?: boolean; admin_email_sent?: boolean; email_error?: string | null } | null
  >(null);

  const callSubmit = useServerFn(submitSignedContract);

  // Sync verified email from session in case of refresh
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const e = data.session?.user.email;
      if (e) setVerifiedEmail(e);
    });
  }, []);

  // Resend cooldown
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const today = useMemo(
    () => new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
    [],
  );

  async function sendOtp() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Enter a valid email address");
      return;
    }
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setOtpSent(true);
    toast.success("Check your email for a 6-digit code");
  }

  async function verifyOtp() {
    if (otp.length !== 6) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setVerifying(true);
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp,
      type: "email",
    });
    setVerifying(false);
    if (error || !data.session) {
      toast.error(error?.message || "Invalid code");
      return;
    }
    setVerifiedEmail(data.session.user.email ?? email.trim());
    toast.success("Email verified");
    setStep(2);
  }

  function nextFromIdentity() {
    if (
      artist.legal_name.trim().length < 2 ||
      artist.stage_name.trim().length < 1 ||
      artist.address.trim().length < 5 ||
      artist.nationality.trim().length < 2
    ) {
      toast.error("Please complete all required fields");
      return;
    }
    setStep(3);
  }

  async function submit() {
    if (!acceptedTerms || !acceptedRevenue) {
      toast.error("You must accept all terms to sign");
      return;
    }
    if (signature.trim().toLowerCase() !== artist.legal_name.trim().toLowerCase()) {
      toast.error("Signature must match your legal name exactly");
      return;
    }
    setSubmitting(true);
    try {
      const res = await callSubmit({
        data: {
          legal_name: artist.legal_name,
          stage_name: artist.stage_name,
          address: artist.address,
          nationality: artist.nationality,
          phone: artist.phone,
          signature_name: signature,
          accepted_terms: true,
          accepted_revenue_split: true,
        },
      });
      setCompleted(res);
      toast.success("Agreement signed and recorded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (completed) {
    return <SuccessScreen artist={artist} completed={completed} email={verifiedEmail ?? email} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-center" />
      {/* Hero */}
      <header className="relative overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
        <div className="absolute inset-0 opacity-30" style={{ background: "var(--gradient-sunset)", mixBlendMode: "overlay" }} />
        <div className="relative mx-auto max-w-3xl px-5 pt-8 pb-12 text-center">
          <img src={logo} alt="Manilla Network logo" className="mx-auto h-16 w-16 sm:h-20 sm:w-20 drop-shadow-2xl" />
          <p className="mt-4 text-[10px] sm:text-xs font-bold tracking-[0.3em] text-primary uppercase">Manilla Network</p>
          <h1 className="mt-2 font-serif text-2xl sm:text-4xl font-bold text-white leading-tight">
            Exclusive 360° Artist Agreement
          </h1>
          <p className="mt-3 text-sm sm:text-base text-white/80 max-w-xl mx-auto">
            From Lagos to the world. Sign your partnership with{" "}
            <span className="text-primary font-semibold">Manilla Collective</span> — built by Africans, for African artists going global.
          </p>
        </div>
      </header>

      {/* Stepper */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-3 py-3">
          <ol className="flex items-center justify-between gap-1">
            {STEPS.map((s) => {
              const Icon = s.icon;
              const active = step === s.n;
              const done = step > s.n;
              return (
                <li key={s.n} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div
                    className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      done
                        ? "bg-primary text-primary-foreground"
                        : active
                          ? "text-primary-foreground shadow-[var(--shadow-glow)]"
                          : "bg-muted text-muted-foreground"
                    }`}
                    style={active ? { background: "var(--gradient-sunset)" } : undefined}
                  >
                    {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span className={`text-[10px] sm:text-xs font-medium text-center truncate w-full ${active ? "text-foreground" : "text-muted-foreground"}`}>
                    {s.title}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* Card */}
      <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        <div
          className="rounded-2xl border border-border bg-card p-5 sm:p-8"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          {step === 1 && (
            <section className="space-y-5">
              <Heading n={1} title="Verify your email" sub="We send a 6-digit code to confirm you own this address before you sign." />
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="artist@example.com"
                  value={email}
                  disabled={otpSent}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 text-base"
                />
              </div>

              {!otpSent ? (
                <PrimaryButton onClick={sendOtp} disabled={sending}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Send verification code
                </PrimaryButton>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Enter the 6-digit code sent to {email}</Label>
                    <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                      <InputOTPGroup>
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                          <InputOTPSlot key={i} index={i} className="h-12 w-10 sm:w-12 text-lg" />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <PrimaryButton onClick={verifyOtp} disabled={verifying || otp.length !== 6}>
                    {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    Verify & continue
                  </PrimaryButton>
                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false);
                      setOtp("");
                    }}
                    className="text-xs text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
                  >
                    Wrong email? Change it
                  </button>
                </div>
              )}
            </section>
          )}

          {step === 2 && (
            <section className="space-y-5">
              <Heading n={2} title="Your identity" sub="As it will appear on the binding agreement." />
              <VerifiedBadge email={verifiedEmail ?? email} />
              <Field label="Legal full name" required>
                <Input value={artist.legal_name} onChange={(e) => setArtist({ ...artist, legal_name: e.target.value })} placeholder="e.g. Adebayo Olamide Johnson" className="h-12" />
              </Field>
              <Field label="Stage name" required>
                <Input value={artist.stage_name} onChange={(e) => setArtist({ ...artist, stage_name: e.target.value })} placeholder="e.g. Bayo Wave" className="h-12" />
              </Field>
              <Field label="Residential address" required>
                <Textarea value={artist.address} onChange={(e) => setArtist({ ...artist, address: e.target.value })} placeholder="Street, City, State, Country" rows={3} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Nationality" required>
                  <Input value={artist.nationality} onChange={(e) => setArtist({ ...artist, nationality: e.target.value })} className="h-12" />
                </Field>
                <Field label="Phone (optional)">
                  <Input type="tel" inputMode="tel" value={artist.phone} onChange={(e) => setArtist({ ...artist, phone: e.target.value })} placeholder="+234…" className="h-12" />
                </Field>
              </div>
              <NavRow onBack={() => setStep(1)} onNext={nextFromIdentity} nextLabel="Read agreement" />
            </section>
          )}

          {step === 3 && (
            <section className="space-y-5">
              <Heading n={3} title="Read the agreement" sub="Read carefully. This is a binding 360° partnership." />
              <ContractBody legalName={artist.legal_name} stageName={artist.stage_name} address={artist.address} nationality={artist.nationality} today={today} />
              <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 cursor-pointer hover:border-primary/40 transition">
                <Checkbox checked={acceptedTerms} onCheckedChange={(v) => setAcceptedTerms(v === true)} className="mt-0.5" />
                <span className="text-sm leading-relaxed">
                  I have read and agree to the <strong>Manilla Collective Exclusive 360° Artist Agreement</strong>, including the Term, Exclusivity, Territory, Recording Rights, Publishing Administration, Transparency, AI Protection, and Termination clauses.
                </span>
              </label>
              <NavRow onBack={() => setStep(2)} onNext={() => acceptedTerms ? setStep(4) : toast.error("Please accept the agreement to continue")} nextLabel="Review revenue split" />
            </section>
          )}

          {step === 4 && (
            <section className="space-y-5">
              <Heading n={4} title="Revenue split" sub="Section 6 — applies after recoupment." />
              <RevenueTable />
              <div className="rounded-xl bg-muted/40 border border-border p-4 text-xs text-muted-foreground leading-relaxed">
                Publishing: Artist retains <strong className="text-foreground">100%</strong> of songwriter share. Manilla acts as Publishing Administrator with a <strong className="text-foreground">15%</strong> admin fee on collected publishing income.
              </div>
              <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 cursor-pointer hover:border-primary/40 transition">
                <Checkbox checked={acceptedRevenue} onCheckedChange={(v) => setAcceptedRevenue(v === true)} className="mt-0.5" />
                <span className="text-sm leading-relaxed">
                  I accept the revenue share structure above and the 15% publishing administration fee.
                </span>
              </label>
              <NavRow onBack={() => setStep(3)} onNext={() => acceptedRevenue ? setStep(5) : toast.error("Please accept the revenue split to continue")} nextLabel="Proceed to sign" />
            </section>
          )}

          {step === 5 && (
            <section className="space-y-5">
              <Heading n={5} title="Sign & submit" sub="Type your legal name to sign. This creates a binding record." />
              <div className="grid sm:grid-cols-2 gap-4 rounded-xl border border-border bg-muted/30 p-4 text-sm">
                <Summary label="Legal name" value={artist.legal_name} />
                <Summary label="Stage name" value={artist.stage_name} />
                <Summary label="Email (verified)" value={verifiedEmail ?? email} />
                <Summary label="Nationality" value={artist.nationality} />
                <Summary label="Effective date" value={today} />
                <Summary label="Agreement" value="360° v1 — Manilla Collective" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sig">Type your full legal name to sign</Label>
                <Input
                  id="sig"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder={artist.legal_name || "Your full legal name"}
                  className="h-14 text-xl font-serif italic tracking-wide"
                  style={{ fontFamily: "'Times New Roman', Times, Georgia, serif" }}
                />
                {signature && signature.trim().toLowerCase() !== artist.legal_name.trim().toLowerCase() && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Must exactly match your legal name
                  </p>
                )}
              </div>

              <PrimaryButton onClick={submit} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
                Sign Agreement
              </PrimaryButton>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
              >
                <ChevronLeft className="h-3 w-3" /> Back
              </button>
            </section>
          )}
        </div>

        <footer className="mt-8 text-center text-xs text-muted-foreground">
          <p className="font-bold tracking-[0.2em] text-foreground">MANILLA NETWORK</p>
          <p className="mt-1">Owned & operated by LILCKY STUDIO LIMITED · Lagos, Nigeria</p>
        </footer>
      </main>
    </div>
  );
}

/* ---------- helpers ---------- */

function Heading({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-primary uppercase">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-primary text-primary-foreground text-[10px]">{n}</span>
        Step {n} of 5
      </div>
      <h2 className="mt-2 text-2xl font-bold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>
        {label} {required && <span className="text-primary">*</span>}
      </Label>
      {children}
    </div>
  );
}

function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button
      {...props}
      className="w-full h-12 text-base font-semibold gap-2 text-primary-foreground border-0 hover:opacity-95 transition"
      style={{ background: "var(--gradient-sunset)", boxShadow: "var(--shadow-glow)" }}
    >
      {children}
    </Button>
  );
}

function NavRow({ onBack, onNext, nextLabel }: { onBack: () => void; onNext: () => void; nextLabel: string }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <Button variant="ghost" onClick={onBack} className="gap-1">
        <ChevronLeft className="h-4 w-4" /> Back
      </Button>
      <Button onClick={onNext} className="h-12 px-6 gap-1 text-primary-foreground border-0" style={{ background: "var(--gradient-sunset)" }}>
        {nextLabel} <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function VerifiedBadge({ email }: { email: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
      <ShieldCheck className="h-3.5 w-3.5" /> Verified: {email}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-foreground break-words">{value || "—"}</div>
    </div>
  );
}

function ContractBody({ legalName, stageName, address, nationality, today }: { legalName: string; stageName: string; address: string; nationality: string; today: string }) {
  return (
    <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-border bg-card p-5 text-sm leading-relaxed font-serif text-foreground" style={{ fontFamily: "'Times New Roman', Times, Georgia, serif" }}>
      <div className="border-l-4 border-primary bg-muted/40 p-3 mb-4 not-italic">
        <p><strong>Effective Date:</strong> {today}</p>
        <p className="mt-2"><strong>BETWEEN</strong> LILCKY STUDIO LIMITED (Nigeria), operating <em>Manilla Collective</em>, part of the Manilla Network Ecosystem (the "Label").</p>
        <p className="mt-2"><strong>AND</strong></p>
        <p>Artist Legal Name: <strong>{legalName || "—"}</strong></p>
        <p>Stage Name: <strong>{stageName || "—"}</strong></p>
        <p>Address: <strong>{address || "—"}</strong></p>
        <p>Nationality: <strong>{nationality || "—"}</strong></p>
      </div>

      <Clause n={1} title="Purpose">
        Establishes a comprehensive, exclusive 360° artist partnership covering recording, artist development, branding, publishing administration, global distribution, marketing, and talent management. The Label commits substantial resources toward the Artist's long-term global success and participates equitably in agreed revenue streams.
      </Clause>
      <Clause n={2} title="Term">
        Initial Term: One (1) to Two (2) years from the Effective Date. One additional 12-month renewal at the Label's discretion, subject to at least one commercial release. Maximum term shall not exceed three (3) years without a new agreement.
      </Clause>
      <Clause n={3} title="Exclusivity">
        During the Term, the Artist renders exclusive services to Manilla Collective and shall not enter into conflicting agreements regarding recordings, publishing, distribution, management, or licensing without the Label's prior written approval.
      </Clause>
      <Clause n={4} title="Territory">
        Worldwide — Nigeria, Africa, US, Canada, UK, EU, Middle East, Asia-Pacific, Latin America, and all current and future digital territories.
      </Clause>
      <Clause n={5} title="Recording Rights & Masters Ownership">
        The Artist grants the Label exclusive ownership of all Master Recordings created during the Term, including sound recordings, remixes, alternate versions, live recordings, and Label-funded music videos. The Artist retains moral rights where protected by law.
      </Clause>
      <Clause n={7} title="Publishing Administration">
        The Artist retains <strong>100%</strong> ownership of their songwriter share. Manilla Collective is appointed exclusive Publishing Administrator with a <strong>15%</strong> administration fee on collected publishing income.
      </Clause>
      <Clause n={8} title="Transparency & Accounting">
        Real-time monthly dashboard access. Quarterly detailed royalty statements. One audit per year at Artist's expense (unless material discrepancy is found). Records maintained for seven (7) years.
      </Clause>
      <Clause n={9} title="Artist Obligations & AI Protection">
        The Artist agrees to deliver commercially viable material, participate in promotional activities, maintain professional conduct, and refrain from artificial streaming or copyright infringement. <strong>No AI-generated voice clones, avatars, or digital likeness usage shall occur without the Artist's express written consent.</strong>
      </Clause>
      <Clause n={10} title="Termination">
        Either party may terminate for material breach, fraud, or insolvency after thirty (30) days' written notice and opportunity to cure.
      </Clause>
    </div>
  );
}

function Clause({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="font-sans font-bold text-foreground border-b-2 border-primary pb-1 mb-2 uppercase text-xs tracking-wider">
        <span className="inline-block bg-primary text-primary-foreground w-5 h-5 leading-5 text-center rounded-sm mr-2 text-[10px]">{n}</span>
        {title}
      </h3>
      <p className="text-foreground/90">{children}</p>
    </div>
  );
}

const REVENUE = [
  { stream: "Master Recordings (Streaming & Sales)", a: "70%", l: "30%" },
  { stream: "Live Performances (Label-secured)", a: "85%", l: "15%" },
  { stream: "Brand Deals — Artist Sourced", a: "90%", l: "10%" },
  { stream: "Brand Deals — Label Sourced", a: "70%", l: "30%" },
  { stream: "Merchandise", a: "70%", l: "30%" },
  { stream: "Content Monetization (YouTube, TikTok, Shorts)", a: "70%", l: "30%" },
];

function RevenueTable() {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="text-primary-foreground" style={{ background: "var(--gradient-sunset)" }}>
          <tr>
            <th className="text-left px-3 py-2.5 text-xs uppercase tracking-wider">Revenue Stream</th>
            <th className="px-2 py-2.5 text-xs uppercase tracking-wider">Artist</th>
            <th className="px-2 py-2.5 text-xs uppercase tracking-wider">Label</th>
          </tr>
        </thead>
        <tbody>
          {REVENUE.map((r, i) => (
            <tr key={r.stream} className={i % 2 === 0 ? "bg-card" : "bg-muted/40"}>
              <td className="px-3 py-3 text-foreground">{r.stream}</td>
              <td className="px-2 py-3 text-center font-bold text-primary">{r.a}</td>
              <td className="px-2 py-3 text-center font-bold text-foreground">{r.l}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SuccessScreen({ artist, completed, email }: { artist: ArtistData; completed: { id: string; signed_at: string }; email: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <Toaster richColors position="top-center" />
      <div className="max-w-lg w-full text-center rounded-2xl border border-border bg-card p-8" style={{ boxShadow: "var(--shadow-card)" }}>
        <div className="mx-auto h-20 w-20 rounded-full flex items-center justify-center text-primary-foreground" style={{ background: "var(--gradient-sunset)", boxShadow: "var(--shadow-glow)" }}>
          <Check className="h-10 w-10" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-foreground">Welcome to Manilla Collective</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {artist.stage_name}, your 360° Artist Agreement has been signed and recorded.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 text-left text-sm rounded-xl border border-border bg-muted/40 p-4">
          <Summary label="Reference" value={completed.id.slice(0, 8).toUpperCase()} />
          <Summary label="Signed at" value={new Date(completed.signed_at).toLocaleString("en-GB")} />
          <Summary label="Email" value={email} />
          <Summary label="Agreement" value="360° v1" />
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          A copy will be delivered to your email. The Label team will reach out shortly to onboard you onto your dashboard.
        </p>
        <p className="mt-6 text-[10px] font-bold tracking-[0.3em] text-primary uppercase">Manilla Network · Lagos · Worldwide</p>
      </div>
    </div>
  );
}
