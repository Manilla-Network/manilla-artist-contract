const DRAFT_KEY = "mc_artist_draft_v2";

export type DraftData = {
  step1?: Record<string, string>;
  step3?: Record<string, string | number>;
  savedAt?: number;
};

export function saveDraft(partial: Partial<DraftData>): void {
  if (typeof window === "undefined") return;
  try {
    const existing = loadDraft();
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...existing, ...partial, savedAt: Date.now() }),
    );
  } catch {
  }
}

export function loadDraft(): DraftData {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DraftData;
    if (parsed.savedAt && Date.now() - parsed.savedAt > 86_400_000) {
      clearDraft();
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
  }
}
