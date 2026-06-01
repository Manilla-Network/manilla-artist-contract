import { supabase } from "@/integrations/supabase/client";

const BUCKET = "artist-assets";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const ALLOWED_PDF_TYPES = ["application/pdf"];

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}

export async function uploadArtistPhoto(
  file: File,
  userId: string,
): Promise<string> {
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
    throw new Error("Photo must be JPEG, PNG, or WebP");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error("Photo must be under 5MB");
  }
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${userId}/photo_${Date.now()}.${sanitizeFilename(ext)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type,
  });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadPressKit(
  file: File,
  userId: string,
): Promise<string> {
  if (!ALLOWED_PDF_TYPES.includes(file.type)) {
    throw new Error("Press kit must be a PDF");
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error("Press kit must be under 10MB");
  }
  const path = `${userId}/presskit_${Date.now()}.pdf`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: "application/pdf",
  });
  if (error) throw new Error(`Press kit upload failed: ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
