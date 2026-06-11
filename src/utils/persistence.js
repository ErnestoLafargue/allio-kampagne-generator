const STORAGE_KEY = "allio-kampagne-draft";
const VERSION = 1;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function saveDraft(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: VERSION,
      savedAt: new Date().toISOString(),
      ...data,
    }));
  } catch {
    // localStorage fuld eller blokeret — ignorer
  }
}

export function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const draft = JSON.parse(raw);
    if (draft.version !== VERSION) return null;

    const age = Date.now() - new Date(draft.savedAt).getTime();
    if (age > MAX_AGE_MS) {
      clearDraft();
      return null;
    }

    return draft;
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignorer
  }
}

export function formatDraftTime(iso) {
  return new Date(iso).toLocaleString("da-DK", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function restoreKampagneIdCounter(kampagner) {
  let max = 0;
  for (const k of kampagner) {
    const m = String(k.id || "").match(/^k(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1]));
  }
  return max;
}
