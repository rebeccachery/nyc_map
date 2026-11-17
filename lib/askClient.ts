import type { AskResponse } from "@/lib/agent/runAgent";
import type { MetroId } from "@/lib/metroRegistry";

export type { AskResponse };

export type AskOutcome =
  | { ok: true; data: AskResponse }
  | { ok: false; error: string; retryable: boolean };

/** Calls /api/ask. Never throws; network and server errors come back as messages for the UI. */
export async function askMap(question: string, metro: MetroId, signal?: AbortSignal): Promise<AskOutcome> {
  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, metro }),
      signal,
    });
    const body = (await res.json().catch(() => null)) as
      | { success: true; data: AskResponse }
      | { success: false; error: string }
      | null;
    if (body?.success) return { ok: true, data: body.data };
    return {
      ok: false,
      error: body && !body.success ? body.error : `The server returned ${res.status}.`,
      retryable: res.status === 429 || res.status >= 500,
    };
  } catch (error) {
    if ((error as Error).name === "AbortError") return { ok: false, error: "Cancelled.", retryable: true };
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again.", retryable: true };
  }
}

export const EXAMPLE_QUESTIONS: Record<MetroId, string[]> = {
  miami: [
    "Which Miami ZIPs have high need and no library within a mile?",
    "Top 5 Broward ZIPs by educational need",
    "Which Miami-Dade ZIPs have more than 20% Haitian ancestry?",
    "What's the closest library to 33034?",
  ],
  nyc: [
    "Which 3 Brooklyn ZIPs have the most residents of Haitian ancestry?",
    "Which high-need Queens ZIPs have the most households without internet?",
    "How many libraries are within a mile of 11226?",
    "Compare Brooklyn and Queens on limited English speakers",
  ],
};
