import { DEFAULT_METRO_ID, isValidMetroId, type MetroId } from "@/lib/metroRegistry";

const LAST_METRO_STORAGE_KEY = "heem-last-metro";

export function getLastMetroId(): MetroId {
  if (typeof window === "undefined") return DEFAULT_METRO_ID;
  try {
    const stored = window.localStorage.getItem(LAST_METRO_STORAGE_KEY);
    if (stored && isValidMetroId(stored)) return stored;
  } catch {
    // ignore storage errors
  }
  return DEFAULT_METRO_ID;
}

export function setLastMetroId(metroId: MetroId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_METRO_STORAGE_KEY, metroId);
  } catch {
    // ignore storage errors
  }
}
