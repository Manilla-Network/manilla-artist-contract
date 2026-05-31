import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const submitSchema = z.object({
  legal_name: z.string().trim().min(2).max(120),
  stage_name: z.string().trim().min(1).max(80),
  address: z.string().trim().min(5).max(300),
  nationality: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(4).max(40).optional().or(z.literal("")),
  signature_name: z.string().trim().min(2).max(120),
  accepted_terms: z.literal(true),
  accepted_revenue_split: z.literal(true),
});

export const submitSignedContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => submitSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const email = (claims as { email?: string }).email ?? "";

    if (!email) throw new Error("Verified email missing on session.");

    // Signed signature name must match the legal name to bind the agreement
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
        accepted_terms: data.accepted_terms,
        accepted_revenue_split: data.accepted_revenue_split,
        agreement_version: "360-v1",
        ip_address: ip,
        user_agent: ua,
      })
      .select("id, signed_at")
      .single();

    if (error) throw new Error(error.message);
    return { id: row.id, signed_at: row.signed_at };
  });
