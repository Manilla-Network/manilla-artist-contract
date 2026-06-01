import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  Loader2, Mail, ShieldCheck, ChevronLeft, ChevronRight, Check,
  FileSignature, User, Music, AlertTriangle, Download, Eraser, Pen, Type,
  CheckCircle2, Globe, Upload, X, Image, FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { submitSignedContract } from "@/lib/contract.functions";
import { downloadContractPdf } from "@/lib/contract-pdf";
import { uploadArtistPhoto, uploadPressKit } from "@/lib/upload";
import { saveDraft, loadDraft, clearDraft } from "@/lib/draft";
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
      { title: "Manilla Collective — Artist Application" },
      { name: "description", content: "Apply to join Manilla Collective. Complete your artist onboarding, verify your email, and sign your 360° Artist Agreement." },
      { property: "og:title", content: "Manilla Collective — Artist Application" },
      { property: "og:description", content: "A 360° partnership for African artists going global." },
    ],
  }),
  component: SignPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type Step1Data = {
  legal_name: string;
  stage_name: string;
  email: string;
  phone: string;
  country: string;
  state: string;
  city: string;
  date_of_birth: string;
};

type Step3Data = {
  genre: string;
  years_active: string;
  bio: string;
  spotify_url: string;
  apple_music_url: string;
  audiomack_url: string;
  boomplay_url: string;
  youtube_url: string;
  tiktok_url: string;
  instagram_url: string;
  website_url: string;
};

const defaultStep1: Step1Data = {
  legal_name: "", stage_name: "", email: "", phone: "",
  country: "", state: "", city: "", date_of_birth: "",
};

const defaultStep3: Step3Data = {
  genre: "", years_active: "", bio: "",
  spotify_url: "", apple_music_url: "", audiomack_url: "", boomplay_url: "",
  youtube_url: "", tiktok_url: "", instagram_url: "", website_url: "",
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, title: "Identity", icon: User },
  { n: 2, title: "Verify Email", icon: Mail },
  { n: 3, title: "Profile", icon: Music },
  { n: 4, title: "Agreement", icon: FileSignature },
  { n: 5, title: "Review", icon: Check },
] as const;

const GENRES = [
  "Afrobeats", "Afropop", "Afro-fusion", "Highlife", "Amapiano",
  "Afro-dancehall", "Rap / Hip-hop", "R&B / Soul", "Reggaeton",
  "Gospel / Gospel-pop", "Afro-jazz", "Alternative", "Electronic / EDM",
  "Pop", "Country", "Other",
];

const COUNTRIES = [
  "Nigeria", "Ghana", "Kenya", "South Africa", "Tanzania", "Uganda",
  "Ethiopia", "Cameroon", "Senegal", "Ivory Coast", "Mali", "Benin",
  "Togo", "Zambia", "Zimbabwe", "Mozambique", "Angola", "Rwanda",
  "Namibia", "Botswana", "United States", "United Kingdom", "Canada",
  "France", "Germany", "Netherlands", "Spain", "Italy", "Portugal",
  "Brazil", "Jamaica", "Trinidad and Tobago", "Barbados", "Dominican Republic",
  "Australia", "New Zealand", "UAE", "Saudi Arabia", "Other",
];

// ── Main Component ────────────────────────────────────────────────────────────

function SignPage() {
  const [step, setStep] = useState(1);

  // Step 1 — Artist Identity
  const [step1, setStep1] = useState<Step1Data>(defaultStep1);
  const [draftRestored, setDraftRestored] = useState(false);

  // Step 2 — Email Verification
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [otpAttempts, setOtpAttempts] = useState(0);

  // Step 3 — Artist Profile
  const [step3, setStep3] = useState<Step3Data>(defaultStep3);
  const [artistPhotoFile, setArtistPhotoFile] = useState<File | null>(null);
  const [pressKitFile, setPressKitFile] = useState<File | null>(null);
  const [artistPhotoUrl, setArtistPhotoUrl] = useState<string>("");
  const [pressKitUrl, setPressKitUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  // Step 4 — Agreement
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedRevenue, setAcceptedRevenue] = useState(false);
  const [signature, setSignature] = useState("");
  const [sigMode, setSigMode] = useState<"type" | "draw">("type");
  const sigPadRef = useRef<SignaturePadHandle>(null);
  const [drawnEmpty, setDrawnEmpty] = useState(true);

  // Step 5 / Submission
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState<{
    id: string;
    application_id: string;
    signed_at: string;
    email_sent: boolean;
    admin_email_sent: boolean;
    email_error?: string | null;
  } | null>(null);

  const callSubmit = useServerFn(submitSignedContract);
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  // ── Draft restore ───────────────────────────────────────────────────────────
  useEffect(() => {
    const draft = loadDraft();
    if ((draft.step1 || draft.step3) && !draftRestored) {
      if (draft.step1) setStep1(draft.step1 as Step1Data);
      if (draft.step3) setStep3(draft.step3 as Step3Data);
      setDraftRestored(true);
    }
  }, [draftRestored]);

  // ── Autosave ────────────────────────────────────────────────────────────────
  const autosaveStep1 = useCallback(() => {
    if (Object.values(step1).some(Boolean)) saveDraft({ step1: step1 as Record<string, string> });
  }, [step1]);
  const autosaveStep3 = useCallback(() => {
    if (Object.values(step3).some(Boolean)) saveDraft({ step3: step3 as Record<string, string | number> });
  }, [step3]);

  useEffect(() => {
    const t = setTimeout(autosaveStep1, 800);
    return () => clearTimeout(t);
  }, [autosaveStep1]);

  useEffect(() => {
    const t = setTimeout(autosaveStep3, 800);
    return () => clearTimeout(t);
  }, [autosaveStep3]);

  // ── Session restore ─────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const e = data.session?.user.email;
      if (e) setVerifiedEmail(e);
    });
  }, []);

  // ── Resend cooldown ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // ── Step 1 validation ───────────────────────────────────────────────────────
  function validateStep1(): boolean {
    const { legal_name, stage_name, email, country, state, city, date_of_birth } = step1;
    if (legal_name.trim().length < 2) { toast.error("Enter your legal full name"); return false; }
    if (stage_name.trim().length < 1) { toast.error("Enter your stage name"); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toast.error("Enter a valid email address"); return false; }
    if (!country) { toast.error("Select your country"); return false; }
    if (state.trim().length < 1) { toast.error("Enter your state or province"); return false; }
    if (city.trim().length < 1) { toast.error("Enter your city"); return false; }
    if (!date_of_birth) { toast.error("Enter your date of birth"); return false; }
    const dob = new Date(date_of_birth);
    const age = (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (age < 16) { toast.error("You must be at least 16 years old"); return false; }
    return true;
  }

  function goToVerify() {
    if (!validateStep1()) return;
    setStep(2);
    if (!otpSent && !verifiedEmail) {
      sendOtp();
    }
  }

  // ── OTP ─────────────────────────────────────────────────────────────────────
  async function sendOtp() {
    const emailAddr = step1.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddr)) {
      toast.error("Enter a valid email address");
      return;
    }
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: emailAddr,
      options: { shouldCreateUser: true },
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    setOtpSent(true);
    setResendIn(60);
    toast.success(`Verification code sent to ${emailAddr}`);
  }

  async function verifyOtp(codeOverride?: string) {
    if (otpAttempts >= 5) {
      toast.error("Too many failed attempts. Please request a new code.");
      return;
    }
    const code = (codeOverride ?? otp).trim();
    if (code.length !== 6) { toast.error("Enter the 6-digit code"); return; }
    setVerifying(true);
    const { data, error } = await supabase.auth.verifyOtp({
      email: step1.email.trim(),
      token: code,
      type: "email",
    });
    setVerifying(false);
    if (error || !data.session) {
      setOtpAttempts((n) => n + 1);
      toast.error(error?.message || "Invalid or expired code");
      setOtp("");
      return;
    }
    setVerifiedEmail(data.session.user.email ?? step1.email.trim());
    setOtpAttempts(0);
    toast.success("Email verified");
    setStep(3);
  }

  // ── Step 3 validation ───────────────────────────────────────────────────────
  function validateStep3(): boolean {
    if (!step3.genre) { toast.error("Select your primary genre"); return false; }
    if (!step3.years_active || isNaN(parseInt(step3.years_active))) {
      toast.error("Enter years active");
      return false;
    }
    if (step3.bio.trim().length < 30) { toast.error("Bio must be at least 30 characters"); return false; }
    return true;
  }

  async function goToAgreement() {
    if (!validateStep3()) return;
    if (!artistPhotoFile && !artistPhotoUrl) {
      toast.error("Please upload your artist photo");
      return;
    }
    setUploading(true);
    try {
      const session = await supabase.auth.getSession();
      const userId = session.data.session?.user.id;
      if (!userId) throw new Error("Session expired. Please refresh.");

      if (artistPhotoFile && !artistPhotoUrl) {
        const url = await uploadArtistPhoto(artistPhotoFile, userId);
        setArtistPhotoUrl(url);
      }
      if (pressKitFile && !pressKitUrl) {
        const url = await uploadPressKit(pressKitFile, userId);
        setPressKitUrl(url);
      }
      setStep(4);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  // ── Step 4 validation ───────────────────────────────────────────────────────
  function validateAgreement(): boolean {
    if (!acceptedTerms) { toast.error("You must accept the agreement terms"); return false; }
    if (!acceptedRevenue) { toast.error("You must accept the revenue split"); return false; }
    if (signature.trim().toLowerCase() !== step1.legal_name.trim().toLowerCase()) {
      toast.error("Typed signature must exactly match your legal name");
      return false;
    }
    if (sigMode === "draw" && (drawnEmpty || sigPadRef.current?.isEmpty())) {
      toast.error("Please draw your signature");
      return false;
    }
    return true;
  }

  function goToReview() {
    if (!validateAgreement()) return;
    setStep(5);
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function submit() {
    if (!validateAgreement()) return;
    let sigDataUrl = "";
    if (sigMode === "draw") {
      sigDataUrl = sigPadRef.current?.toDataURL() ?? "";
    }
    setSubmitting(true);
    try {
      const res = await callSubmit({
        data: {
          legal_name: step1.legal_name,
          stage_name: step1.stage_name,
          phone: step1.phone,
          city: step1.city,
          state: step1.state,
          country: step1.country,
          date_of_birth: step1.date_of_birth,
          genre: step3.genre,
          years_active: parseInt(step3.years_active) || 0,
          bio: step3.bio,
          spotify_url: step3.spotify_url,
          apple_music_url: step3.apple_music_url,
          audiomack_url: step3.audiomack_url,
          boomplay_url: step3.boomplay_url,
          youtube_url: step3.youtube_url,
          tiktok_url: step3.tiktok_url,
          instagram_url: step3.instagram_url,
          website_url: step3.website_url,
          artist_photo_url: artistPhotoUrl,
          press_kit_url: pressKitUrl,
          signature_name: signature,
          signature_data_url: sigDataUrl,
          accepted_terms: true,
          accepted_revenue_split: true,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          locale: navigator.language,
          screen_resolution: `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio || 1}x`,
          referrer: document.referrer || "",
          submission_origin: window.location.origin,
        },
      });
      clearDraft();
      setCompleted(res);
      toast.success("Agreement signed and recorded.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (completed) {
    return (
      <SuccessScreen
        applicationId={completed.application_id}
        stageName={step1.stage_name}
        legalName={step1.legal_name}
        email={verifiedEmail ?? step1.email}
        signedAt={completed.signed_at}
        emailSent={completed.email_sent}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-center" />

      {/* Hero */}
      <header className="relative overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
        <div className="absolute inset-0 opacity-20" style={{ background: "var(--gradient-sunset)", mixBlendMode: "overlay" }} />
        <div className="relative mx-auto max-w-3xl px-5 pt-8 pb-12 text-center">
          <img src={logo} alt="Manilla Network" className="mx-auto h-16 w-16 sm:h-20 sm:w-20 drop-shadow-2xl" />
          <p className="mt-4 text-[10px] sm:text-xs font-bold tracking-[0.3em] text-primary uppercase">Manilla Collective</p>
          <h1 className="mt-2 font-serif text-2xl sm:text-4xl font-bold text-white leading-tight">
            360° Artist Application
          </h1>
          <p className="mt-3 text-sm sm:text-base text-white/75 max-w-xl mx-auto">
            From Lagos to the world. Join <span className="text-primary font-semibold">Manilla Collective</span> — built by Africans, for African artists going global.
          </p>
        </div>
      </header>

      {/* Progress stepper */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto max-w-3xl px-3 py-3">
          <div className="mb-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${((step - 1) / 4) * 100}%`, background: "var(--gradient-sunset)" }}
            />
          </div>
          <ol className="flex items-center justify-between gap-1">
            {STEPS.map((s) => {
              const Icon = s.icon;
              const active = step === s.n;
              const done = step > s.n;
              return (
                <li key={s.n} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                      done
                        ? "bg-primary text-primary-foreground"
                        : active
                        ? "text-primary-foreground shadow-[var(--shadow-glow)]"
                        : "bg-muted text-muted-foreground"
                    }`}
                    style={active ? { background: "var(--gradient-sunset)" } : undefined}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  </div>
                  <span className={`text-[9px] sm:text-[11px] font-medium text-center truncate w-full ${active ? "text-foreground" : "text-muted-foreground"}`}>
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
          className="rounded-2xl border border-border bg-card p-5 sm:p-8 transition-all"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          {step === 1 && (
            <Step1Identity
              data={step1}
              onChange={setStep1}
              onNext={goToVerify}
              countries={COUNTRIES}
            />
          )}
          {step === 2 && (
            <Step2Verify
              email={step1.email}
              otpSent={otpSent}
              otp={otp}
              sending={sending}
              verifying={verifying}
              resendIn={resendIn}
              attempts={otpAttempts}
              onOtpChange={setOtp}
              onSend={sendOtp}
              onVerify={verifyOtp}
              onBack={() => setStep(1)}
              onChangeEmail={() => { setStep(1); setOtpSent(false); setOtp(""); }}
            />
          )}
          {step === 3 && (
            <Step3Profile
              data={step3}
              onChange={setStep3}
              artistPhotoFile={artistPhotoFile}
              pressKitFile={pressKitFile}
              onPhotoChange={setArtistPhotoFile}
              onPressKitChange={setPressKitFile}
              uploading={uploading}
              genres={GENRES}
              onBack={() => setStep(2)}
              onNext={goToAgreement}
            />
          )}
          {step === 4 && (
            <Step4Agreement
              legalName={step1.legal_name}
              stageName={step1.stage_name}
              today={today}
              acceptedTerms={acceptedTerms}
              acceptedRevenue={acceptedRevenue}
              signature={signature}
              sigMode={sigMode}
              sigPadRef={sigPadRef}
              drawnEmpty={drawnEmpty}
              onAcceptTerms={setAcceptedTerms}
              onAcceptRevenue={setAcceptedRevenue}
              onSignatureChange={setSignature}
              onSigModeChange={setSigMode}
              onDrawnEmptyChange={setDrawnEmpty}
              onBack={() => setStep(3)}
              onNext={goToReview}
              onPreviewPdf={() =>
                downloadContractPdf({
                  legal_name: step1.legal_name || "[Legal Name]",
                  stage_name: step1.stage_name || "[Stage Name]",
                  address: `${step1.city}, ${step1.state}, ${step1.country}`,
                  nationality: step1.country,
                  phone: step1.phone,
                  email: verifiedEmail ?? step1.email,
                  city: step1.city,
                  state: step1.state,
                  country: step1.country,
                  date_of_birth: step1.date_of_birth,
                  genre: step3.genre,
                  years_active: parseInt(step3.years_active) || 0,
                  bio: step3.bio,
                  spotify_url: step3.spotify_url || undefined,
                  apple_music_url: step3.apple_music_url || undefined,
                  audiomack_url: step3.audiomack_url || undefined,
                  boomplay_url: step3.boomplay_url || undefined,
                  youtube_url: step3.youtube_url || undefined,
                  tiktok_url: step3.tiktok_url || undefined,
                  instagram_url: step3.instagram_url || undefined,
                  website_url: step3.website_url || undefined,
                  signature_name: signature || "[Unsigned]",
                  signature_data_url:
                    sigMode === "draw" && !drawnEmpty
                      ? sigPadRef.current?.toDataURL() ?? null
                      : null,
                })
              }
            />
          )}
          {step === 5 && (
            <Step5Review
              step1={step1}
              step3={step3}
              artistPhotoFile={artistPhotoFile}
              pressKitFile={pressKitFile}
              verifiedEmail={verifiedEmail ?? step1.email}
              signature={signature}
              submitting={submitting}
              onBack={() => setStep(4)}
              onSubmit={submit}
            />
          )}
        </div>

        <footer className="mt-8 text-center text-xs text-muted-foreground">
          <p className="font-bold tracking-[0.2em] text-foreground/80">MANILLA NETWORK</p>
          <p className="mt-1">Owned & operated by LILCKY STUDIO LIMITED · Lagos, Nigeria</p>
        </footer>
      </main>
    </div>
  );
}

// ── Step 1: Artist Identity ───────────────────────────────────────────────────

function Step1Identity({
  data, onChange, onNext, countries,
}: {
  data: Step1Data;
  onChange: (d: Step1Data) => void;
  onNext: () => void;
  countries: string[];
}) {
  const set = (k: keyof Step1Data) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...data, [k]: e.target.value });

  return (
    <section className="space-y-5">
      <Heading n={1} title="Artist Identity" sub="Your legal details as they will appear on the binding agreement." />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Legal full name" required>
          <Input
            value={data.legal_name}
            onChange={set("legal_name")}
            placeholder="e.g. Adebayo Olamide Johnson"
            className="h-12"
            autoComplete="name"
          />
        </Field>
        <Field label="Stage name" required>
          <Input
            value={data.stage_name}
            onChange={set("stage_name")}
            placeholder="e.g. Bayo Wave"
            className="h-12"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Email address" required>
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={data.email}
            onChange={set("email")}
            placeholder="artist@example.com"
            className="h-12"
          />
        </Field>
        <Field label="Phone number">
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={data.phone}
            onChange={set("phone")}
            placeholder="+234 800 000 0000"
            className="h-12"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Country" required>
          <select
            value={data.country}
            onChange={set("country")}
            className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="">Select country</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="State / Province" required>
          <Input
            value={data.state}
            onChange={set("state")}
            placeholder="e.g. Lagos"
            className="h-12"
          />
        </Field>
        <Field label="City" required>
          <Input
            value={data.city}
            onChange={set("city")}
            placeholder="e.g. Lagos Island"
            className="h-12"
          />
        </Field>
      </div>

      <Field label="Date of birth" required>
        <Input
          type="date"
          value={data.date_of_birth}
          onChange={set("date_of_birth")}
          max={new Date(Date.now() - 16 * 365.25 * 86400 * 1000).toISOString().split("T")[0]}
          className="h-12"
        />
      </Field>

      <PrimaryButton onClick={onNext}>
        Continue to email verification
        <ChevronRight className="h-4 w-4 ml-1" />
      </PrimaryButton>
    </section>
  );
}

// ── Step 2: Email Verification ────────────────────────────────────────────────

function Step2Verify({
  email, otpSent, otp, sending, verifying, resendIn, attempts,
  onOtpChange, onSend, onVerify, onBack, onChangeEmail,
}: {
  email: string; otpSent: boolean; otp: string; sending: boolean;
  verifying: boolean; resendIn: number; attempts: number;
  onOtpChange: (v: string) => void; onSend: () => void;
  onVerify: (v?: string) => void; onBack: () => void; onChangeEmail: () => void;
}) {
  return (
    <section className="space-y-5">
      <Heading n={2} title="Verify your email" sub="We send a 6-digit code to confirm you own this address before you proceed." />

      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 flex items-center gap-3">
        <Mail className="h-5 w-5 text-primary shrink-0" />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Sending code to</p>
          <p className="font-semibold text-sm truncate">{email}</p>
        </div>
        <button type="button" onClick={onChangeEmail} className="ml-auto text-xs text-primary hover:underline shrink-0">
          Change
        </button>
      </div>

      {!otpSent ? (
        <PrimaryButton onClick={onSend} disabled={sending}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          Send verification code
        </PrimaryButton>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Enter the 6-digit code</Label>
            <InputOTP
              maxLength={6}
              value={otp}
              onChange={(v) => {
                onOtpChange(v);
                if (v.length === 6) onVerify(v);
              }}
            >
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} className="h-12 w-10 sm:w-12 text-lg" />
                ))}
              </InputOTPGroup>
            </InputOTP>
            {attempts > 0 && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {5 - attempts} attempt{5 - attempts !== 1 ? "s" : ""} remaining
              </p>
            )}
          </div>

          <PrimaryButton
            onClick={() => onVerify()}
            disabled={verifying || otp.length !== 6 || attempts >= 5}
          >
            {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Verify & continue
          </PrimaryButton>

          <div className="flex items-center justify-between text-xs">
            <p className="text-muted-foreground">
              Check your spam folder if not received.
            </p>
            <button
              type="button"
              disabled={resendIn > 0 || sending}
              onClick={onSend}
              className="font-semibold text-primary disabled:text-muted-foreground disabled:cursor-not-allowed"
            >
              {resendIn > 0 ? `Resend in ${resendIn}s` : sending ? "Sending…" : "Resend code"}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onBack}
        className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
      >
        <ChevronLeft className="h-3 w-3" /> Back to identity
      </button>
    </section>
  );
}

// ── Step 3: Artist Profile ────────────────────────────────────────────────────

function Step3Profile({
  data, onChange, artistPhotoFile, pressKitFile,
  onPhotoChange, onPressKitChange, uploading, genres, onBack, onNext,
}: {
  data: Step3Data; onChange: (d: Step3Data) => void;
  artistPhotoFile: File | null; pressKitFile: File | null;
  onPhotoChange: (f: File | null) => void; onPressKitChange: (f: File | null) => void;
  uploading: boolean; genres: string[]; onBack: () => void; onNext: () => void;
}) {
  const set = (k: keyof Step3Data) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => onChange({ ...data, [k]: e.target.value });

  const photoRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  return (
    <section className="space-y-5">
      <Heading n={3} title="Artist Profile" sub="Tell the world about your music and where to find you." />
      <VerifiedBadge />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Primary genre" required>
          <select
            value={data.genre}
            onChange={set("genre")}
            className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="">Select genre</option>
            {genres.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="Years active" required>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={60}
            value={data.years_active}
            onChange={set("years_active")}
            placeholder="e.g. 3"
            className="h-12"
          />
        </Field>
      </div>

      <Field label="Artist bio" required>
        <Textarea
          value={data.bio}
          onChange={set("bio")}
          placeholder="Tell us about your music, your journey, and what sets you apart (min 30 characters)..."
          rows={5}
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground mt-1">{data.bio.length} chars</p>
      </Field>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          Streaming & Social Profiles
          <span className="text-xs font-normal text-muted-foreground">(at least one recommended)</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(
            [
              ["spotify_url", "Spotify Artist URL"],
              ["apple_music_url", "Apple Music URL"],
              ["audiomack_url", "Audiomack Profile"],
              ["boomplay_url", "Boomplay Profile"],
              ["youtube_url", "YouTube Channel"],
              ["tiktok_url", "TikTok Profile"],
              ["instagram_url", "Instagram Profile"],
              ["website_url", "Website"],
            ] as const
          ).map(([key, placeholder]) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs capitalize">
                {placeholder.replace(" URL", "").replace(" Profile", "").replace(" Channel", "").replace(" Artist", "")}
              </Label>
              <Input
                type="url"
                inputMode="url"
                value={data[key]}
                onChange={set(key)}
                placeholder={`https://...`}
                className="h-10 text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      {/* File uploads */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" />
          Upload Assets
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Artist Photo */}
          <div
            className="relative rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer bg-muted/20 p-4 flex flex-col items-center gap-2 text-center"
            onClick={() => photoRef.current?.click()}
          >
            <input
              ref={photoRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                onPhotoChange(f);
              }}
            />
            {artistPhotoFile ? (
              <>
                <div className="relative">
                  <img
                    src={URL.createObjectURL(artistPhotoFile)}
                    alt="Artist photo preview"
                    className="h-20 w-20 rounded-full object-cover border-2 border-primary"
                  />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onPhotoChange(null); }}
                    className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground truncate max-w-full">{artistPhotoFile.name}</p>
              </>
            ) : (
              <>
                <Image className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-semibold">
                    Artist Photo <span className="text-primary">*</span>
                  </p>
                  <p className="text-xs text-muted-foreground">JPG, PNG, WebP · Max 5MB</p>
                </div>
              </>
            )}
          </div>

          {/* Press Kit PDF */}
          <div
            className="relative rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer bg-muted/20 p-4 flex flex-col items-center gap-2 text-center"
            onClick={() => pdfRef.current?.click()}
          >
            <input
              ref={pdfRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                onPressKitChange(f);
              }}
            />
            {pressKitFile ? (
              <>
                <div className="relative">
                  <div className="h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                    <FileText className="h-8 w-8 text-primary" />
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onPressKitChange(null); }}
                    className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground truncate max-w-full">{pressKitFile.name}</p>
              </>
            ) : (
              <>
                <FileText className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-semibold">
                    Press Kit <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <p className="text-xs text-muted-foreground">PDF only · Max 10MB</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <NavRow
        onBack={onBack}
        onNext={onNext}
        nextLabel={uploading ? "Uploading…" : "Continue to agreement"}
        nextDisabled={uploading}
        nextIcon={uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
      />
    </section>
  );
}

// ── Step 4: Agreement ─────────────────────────────────────────────────────────

const REVENUE_ROWS: Array<[string, string, string]> = [
  ["Master Recordings (Streaming & Sales)", "70%", "30%"],
  ["Live Performances (Label-secured)", "85%", "15%"],
  ["Brand Deals — Artist Sourced", "90%", "10%"],
  ["Brand Deals — Label Sourced", "70%", "30%"],
  ["Merchandise", "70%", "30%"],
  ["Content Monetization (YouTube / TikTok)", "70%", "30%"],
];

function Step4Agreement({
  legalName, stageName, today, acceptedTerms, acceptedRevenue,
  signature, sigMode, sigPadRef, drawnEmpty,
  onAcceptTerms, onAcceptRevenue, onSignatureChange, onSigModeChange,
  onDrawnEmptyChange, onBack, onNext, onPreviewPdf,
}: {
  legalName: string; stageName: string; today: string;
  acceptedTerms: boolean; acceptedRevenue: boolean;
  signature: string; sigMode: "type" | "draw";
  sigPadRef: React.RefObject<SignaturePadHandle | null>; drawnEmpty: boolean;
  onAcceptTerms: (v: boolean) => void; onAcceptRevenue: (v: boolean) => void;
  onSignatureChange: (v: string) => void; onSigModeChange: (v: "type" | "draw") => void;
  onDrawnEmptyChange: (v: boolean) => void;
  onBack: () => void; onNext: () => void; onPreviewPdf: () => void;
}) {
  return (
    <section className="space-y-5">
      <Heading n={4} title="Agreement & Signature" sub="Read the terms, consent to the revenue split, and provide your electronic signature." />
      <VerifiedBadge />

      {/* Contract summary */}
      <div
        className="rounded-xl border border-border bg-muted/20 p-4 max-h-72 overflow-y-auto text-xs leading-relaxed text-foreground/80 space-y-4 scroll-smooth"
        style={{ scrollbarWidth: "thin" }}
      >
        <ContractBody legalName={legalName} stageName={stageName} today={today} />
      </div>

      {/* Revenue table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-2 text-xs font-bold tracking-widest text-primary uppercase" style={{ background: "var(--gradient-sunset)" }}>
          <span className="text-white">Revenue Split — Section 6 (after recoupment)</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left px-3 py-2 font-semibold">Revenue Stream</th>
              <th className="text-center px-3 py-2 font-semibold text-primary">Artist</th>
              <th className="text-center px-3 py-2 font-semibold text-muted-foreground">Label</th>
            </tr>
          </thead>
          <tbody>
            {REVENUE_ROWS.map(([stream, artist, label], i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-muted/10" : ""}>
                <td className="px-3 py-2">{stream}</td>
                <td className="px-3 py-2 text-center font-bold text-primary">{artist}</td>
                <td className="px-3 py-2 text-center text-muted-foreground">{label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-2 text-xs text-muted-foreground bg-muted/20 border-t border-border">
          Publishing: Artist retains <strong className="text-foreground">100%</strong> songwriter share. Manilla acts as Publishing Administrator at a <strong className="text-foreground">15%</strong> admin fee on collected publishing income.
        </div>
      </div>

      <Button type="button" variant="outline" onClick={onPreviewPdf} className="w-full h-11 gap-2 text-sm">
        <Download className="h-4 w-4" /> Download agreement PDF preview
      </Button>

      {/* Consent checkboxes */}
      <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4 cursor-pointer hover:border-primary/50 transition">
        <Checkbox checked={acceptedTerms} onCheckedChange={(v) => onAcceptTerms(v === true)} className="mt-0.5" />
        <span className="text-sm leading-relaxed">
          I have read and agree to the <strong>Manilla Collective Exclusive 360° Artist Agreement</strong>, including all clauses covering Term, Exclusivity, Territory, Recording Rights, Publishing Administration, Transparency, AI Protection, and Termination.
        </span>
      </label>

      <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4 cursor-pointer hover:border-primary/50 transition">
        <Checkbox checked={acceptedRevenue} onCheckedChange={(v) => onAcceptRevenue(v === true)} className="mt-0.5" />
        <span className="text-sm leading-relaxed">
          I accept the revenue share structure above and the 15% publishing administration fee as detailed in Section 6 and 7.
        </span>
      </label>

      {/* Signature */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onSigModeChange("type")}
            className={`flex-1 h-10 rounded-lg border-2 text-sm font-semibold inline-flex items-center justify-center gap-2 transition ${sigMode === "type" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
          >
            <Type className="h-4 w-4" /> Type
          </button>
          <button
            type="button"
            onClick={() => onSigModeChange("draw")}
            className={`flex-1 h-10 rounded-lg border-2 text-sm font-semibold inline-flex items-center justify-center gap-2 transition ${sigMode === "draw" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
          >
            <Pen className="h-4 w-4" /> Draw
          </button>
        </div>

        <Label htmlFor="sig">
          Type your legal name to sign <span className="text-primary">*</span>
          <span className="ml-2 text-xs font-normal text-muted-foreground">(must exactly match: <em>{legalName || "your legal name"}</em>)</span>
        </Label>
        <div className="flex gap-2">
          <Input
            id="sig"
            value={signature}
            onChange={(e) => onSignatureChange(e.target.value)}
            placeholder={legalName || "Your full legal name"}
            className="h-14 text-xl font-serif italic tracking-wide"
            style={{ fontFamily: "'Times New Roman', Times, Georgia, serif" }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => onSignatureChange(legalName)}
            className="h-14 px-3 text-xs whitespace-nowrap shrink-0"
          >
            Auto-fill
          </Button>
        </div>
        {signature && signature.trim().toLowerCase() !== legalName.trim().toLowerCase() && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Must exactly match your legal name
          </p>
        )}

        {sigMode === "draw" && (
          <div className="space-y-2">
            <Label>Draw your signature below</Label>
            <SignaturePadCanvas ref={sigPadRef} onChange={onDrawnEmptyChange} />
            <button
              type="button"
              onClick={() => sigPadRef.current?.clear()}
              className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
            >
              <Eraser className="h-3 w-3" /> Clear
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
        By proceeding, your electronic signature, timestamp, user agent, and IP hash are captured as part of the binding record under applicable electronic signature laws.
      </div>

      <NavRow onBack={onBack} onNext={onNext} nextLabel="Review application" />
    </section>
  );
}

// ── Step 5: Review & Submit ───────────────────────────────────────────────────

function Step5Review({
  step1, step3, artistPhotoFile, pressKitFile, verifiedEmail,
  signature, submitting, onBack, onSubmit,
}: {
  step1: Step1Data; step3: Step3Data;
  artistPhotoFile: File | null; pressKitFile: File | null;
  verifiedEmail: string; signature: string;
  submitting: boolean; onBack: () => void; onSubmit: () => void;
}) {
  const socials = [
    ["Spotify", step3.spotify_url],
    ["Apple Music", step3.apple_music_url],
    ["Audiomack", step3.audiomack_url],
    ["Boomplay", step3.boomplay_url],
    ["YouTube", step3.youtube_url],
    ["TikTok", step3.tiktok_url],
    ["Instagram", step3.instagram_url],
    ["Website", step3.website_url],
  ].filter(([, v]) => v);

  return (
    <section className="space-y-5">
      <Heading n={5} title="Review & Submit" sub="Confirm all details are correct before signing your agreement." />

      {/* Identity */}
      <ReviewSection title="Artist Identity" icon={<User className="h-4 w-4" />}>
        <SummaryGrid>
          <SummaryItem label="Legal Name" value={step1.legal_name} />
          <SummaryItem label="Stage Name" value={step1.stage_name} />
          <SummaryItem label="Email (verified)" value={verifiedEmail} />
          <SummaryItem label="Phone" value={step1.phone || "—"} />
          <SummaryItem label="Location" value={`${step1.city}, ${step1.state}, ${step1.country}`} />
          <SummaryItem label="Date of Birth" value={step1.date_of_birth} />
        </SummaryGrid>
      </ReviewSection>

      {/* Profile */}
      <ReviewSection title="Artist Profile" icon={<Music className="h-4 w-4" />}>
        <SummaryGrid>
          <SummaryItem label="Genre" value={step3.genre} />
          <SummaryItem label="Years Active" value={step3.years_active} />
          <SummaryItem label="Artist Photo" value={artistPhotoFile ? `✓ ${artistPhotoFile.name}` : "Not uploaded"} />
          <SummaryItem label="Press Kit" value={pressKitFile ? `✓ ${pressKitFile.name}` : "Not provided"} />
        </SummaryGrid>
        {step3.bio && (
          <p className="mt-3 text-xs text-muted-foreground leading-relaxed bg-muted/30 rounded-lg p-3 italic">
            {step3.bio.slice(0, 200)}{step3.bio.length > 200 ? "…" : ""}
          </p>
        )}
        {socials.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {socials.map(([platform]) => (
              <span key={platform} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <Check className="h-3 w-3" /> {platform}
              </span>
            ))}
          </div>
        )}
      </ReviewSection>

      {/* Signature */}
      <ReviewSection title="Signature" icon={<FileSignature className="h-4 w-4" />}>
        <div className="flex items-center gap-3">
          <span
            className="text-2xl font-serif italic tracking-wide text-foreground"
            style={{ fontFamily: "'Times New Roman', Times, Georgia, serif" }}
          >
            {signature}
          </span>
          <span className="text-xs text-muted-foreground">· {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
        </div>
      </ReviewSection>

      {/* Binding notice */}
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-foreground/80 leading-relaxed">
        <p className="font-semibold text-destructive mb-1">Final confirmation</p>
        By clicking <strong>Sign & Submit</strong>, you create a legally binding electronic record of the Manilla Collective Exclusive 360° Artist Agreement. This action cannot be undone.
      </div>

      <PrimaryButton onClick={onSubmit} disabled={submitting}>
        {submitting ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
        ) : (
          <><FileSignature className="h-4 w-4" /> Sign & Submit Agreement</>
        )}
      </PrimaryButton>

      <button
        type="button"
        onClick={onBack}
        className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 w-full justify-center"
      >
        <ChevronLeft className="h-3 w-3" /> Back to agreement
      </button>
    </section>
  );
}

// ── Success Screen ────────────────────────────────────────────────────────────

function SuccessScreen({
  applicationId, stageName, legalName, email, signedAt, emailSent,
}: {
  applicationId: string; stageName: string; legalName: string;
  email: string; signedAt: string; emailSent: boolean;
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="relative overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
        <div className="absolute inset-0 opacity-20" style={{ background: "var(--gradient-sunset)", mixBlendMode: "overlay" }} />
        <div className="relative mx-auto max-w-3xl px-5 pt-8 pb-16 text-center">
          <img src={logo} alt="Manilla Network" className="mx-auto h-16 w-16 drop-shadow-2xl" />
        </div>
      </div>

      <main className="mx-auto max-w-xl px-4 -mt-8 pb-12 w-full">
        <div
          className="rounded-2xl border border-border bg-card p-6 sm:p-10 text-center"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div
            className="mx-auto mb-6 h-20 w-20 rounded-full flex items-center justify-center"
            style={{ background: "var(--gradient-sunset)" }}
          >
            <CheckCircle2 className="h-10 w-10 text-white" />
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            Welcome, {stageName}!
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Your agreement has been signed and securely recorded.
          </p>

          <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Application ID</p>
            <p className="mt-1 text-2xl font-mono font-black tracking-widest" style={{ color: "oklch(0.68 0.22 39)" }}>
              {applicationId}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Keep this reference for your records.</p>
          </div>

          <div className="mt-5 space-y-2 text-sm text-left">
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">Legal name</span>
              <span className="font-semibold">{legalName}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">Signed at</span>
              <span className="font-semibold">{new Date(signedAt).toLocaleString("en-GB")}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">Contract copy</span>
              <span className={emailSent ? "text-green-600 font-semibold" : "text-muted-foreground"}>
                {emailSent ? `Sent to ${email}` : "Recorded (email pending)"}
              </span>
            </div>
          </div>

          <div className="mt-6 rounded-xl p-4 text-sm text-left" style={{ background: "linear-gradient(135deg, oklch(0.14 0.02 40) 0%, oklch(0.22 0.05 35) 100%)" }}>
            <p className="font-semibold text-white">What happens next?</p>
            <ul className="mt-2 space-y-1.5 text-white/75 text-xs">
              <li className="flex items-start gap-2"><Check className="h-3 w-3 mt-0.5 text-primary shrink-0" />Your signed contract PDF has been emailed to you.</li>
              <li className="flex items-start gap-2"><Check className="h-3 w-3 mt-0.5 text-primary shrink-0" />Our A&R team will contact you within 48 hours.</li>
              <li className="flex items-start gap-2"><Check className="h-3 w-3 mt-0.5 text-primary shrink-0" />You'll receive access to your artist dashboard.</li>
            </ul>
          </div>
        </div>

        <footer className="mt-8 text-center text-xs text-muted-foreground">
          <p className="font-bold tracking-[0.2em] text-foreground/70">MANILLA NETWORK</p>
          <p className="mt-1">Owned & operated by LILCKY STUDIO LIMITED · Lagos, Nigeria</p>
        </footer>
      </main>
    </div>
  );
}

// ── Contract body ─────────────────────────────────────────────────────────────

function ContractBody({ legalName, stageName, today }: { legalName: string; stageName: string; today: string }) {
  const clauses = [
    ["Purpose", "Establishes a comprehensive, exclusive 360° artist partnership covering recording, artist development, branding, publishing administration, global distribution, marketing, and talent management."],
    ["Term", "Initial Term: 1–2 years from the Effective Date. One additional 12-month renewal at the Label's discretion. Maximum term shall not exceed 3 years without a new agreement."],
    ["Exclusivity", "During the Term, the Artist renders exclusive services to Manilla Collective and shall not enter into conflicting agreements without the Label's prior written approval."],
    ["Territory", "Worldwide — Nigeria, Africa, US, Canada, UK, EU, Middle East, Asia-Pacific, Latin America, and all current and future digital territories."],
    ["Recording Rights & Masters Ownership", "The Artist grants the Label exclusive ownership of all Master Recordings during the Term. The Artist retains moral rights where protected by law."],
    ["Revenue Splits", "Splits apply after recoupment of agreed advanceable and recoupable costs. See Revenue Split table."],
    ["Publishing Administration", "The Artist retains 100% ownership of songwriter share. Manilla Collective is appointed exclusive Publishing Administrator with a 15% admin fee."],
    ["Transparency & Accounting", "Real-time monthly dashboard access. Quarterly royalty statements. One audit per year. Records maintained for 7 years."],
    ["AI Protection", "No AI-generated voice clones, avatars, or digital likeness shall be used without the Artist's express written consent."],
    ["Termination", "Either party may terminate for material breach, fraud, or insolvency after 30 days' written notice and opportunity to cure."],
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Manilla Collective · Exclusive 360° Artist Agreement</p>
        <p className="text-xs mt-1 text-foreground/70">
          BETWEEN LILCKY STUDIO LIMITED (Nigeria), operating Manilla Collective, AND{" "}
          <strong>{legalName || "[Artist Legal Name]"}</strong> a.k.a. <strong>{stageName || "[Stage Name]"}</strong>.
          Effective Date: {today}.
        </p>
      </div>
      {clauses.map(([title, body]) => (
        <div key={title}>
          <p className="font-semibold text-foreground mb-0.5">{title}</p>
          <p className="text-muted-foreground">{body}</p>
        </div>
      ))}
    </div>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────

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

function PrimaryButton({ children, disabled, onClick }: {
  children: React.ReactNode; disabled?: boolean; onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full h-12 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
      style={{ background: "var(--gradient-sunset)" }}
    >
      {children}
    </button>
  );
}

function NavRow({ onBack, onNext, nextLabel, nextDisabled, nextIcon }: {
  onBack: () => void; onNext: () => void; nextLabel: string;
  nextDisabled?: boolean; nextIcon?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 pt-1">
      <Button type="button" variant="outline" onClick={onBack} className="h-12 gap-1.5">
        <ChevronLeft className="h-4 w-4" /> Back
      </Button>
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="flex-1 h-12 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
        style={{ background: "var(--gradient-sunset)" }}
      >
        {nextIcon ?? <ChevronRight className="h-4 w-4" />}
        {nextLabel}
      </button>
    </div>
  );
}

function VerifiedBadge({ email }: { email?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2 text-xs text-green-700 dark:text-green-400 font-semibold">
      <ShieldCheck className="h-4 w-4" />
      Email verified{email ? ` — ${email}` : ""}
    </div>
  );
}

function ReviewSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 border-b border-border text-sm font-semibold text-foreground">
        <span className="text-primary">{icon}</span>
        {title}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function SummaryGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">{children}</div>;
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">{label}</span>
      <span className="text-sm font-semibold text-foreground truncate">{value || "—"}</span>
    </div>
  );
}

