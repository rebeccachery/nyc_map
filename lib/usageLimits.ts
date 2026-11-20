/**
 * Usage limits for /api/ask, so a public deployment can't run up the Anthropic bill.
 *
 * Three limits, all configurable by env var:
 *   ASK_PER_IP_PER_MINUTE  (default 20)  questions per visitor per minute
 *   ASK_PER_IP_PER_DAY     (default 100) questions per visitor per UTC day
 *   ASK_DAILY_BUDGET_USD   (default 5)   estimated spend across all visitors per UTC day
 *
 * Counters live in Redis when Upstash REST credentials are set (UPSTASH_REDIS_REST_URL/_TOKEN,
 * or the KV_REST_API_URL/_TOKEN names the Vercel Marketplace integration creates), so limits hold
 * across serverless instances. Without them, or if Redis errors, counters fall back to this
 * instance's memory, which is fine locally but per-instance on Vercel.
 *
 * The budget is checked before a question runs and charged after, so concurrent questions can
 * overshoot it by a few cents. Keep a hard monthly spend limit in the Claude Console as the backstop.
 */

export interface CounterStore {
  /** Add `by` to `key` (creating it with a TTL) and return the new value. */
  incr(key: string, by: number, ttlSeconds: number): Promise<number>;
  get(key: string): Promise<number>;
}

export class MemoryStore implements CounterStore {
  private readonly data = new Map<string, { value: number; expiresAt: number }>();
  constructor(private readonly now: () => number = Date.now) {}

  private live(key: string) {
    const entry = this.data.get(key);
    if (entry && entry.expiresAt <= this.now()) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }

  async incr(key: string, by: number, ttlSeconds: number): Promise<number> {
    if (this.data.size > 10_000) this.sweep();
    const entry = this.live(key) ?? { value: 0, expiresAt: this.now() + ttlSeconds * 1000 };
    entry.value += by;
    this.data.set(key, entry);
    return entry.value;
  }

  async get(key: string): Promise<number> {
    return this.live(key)?.value ?? 0;
  }

  private sweep() {
    const now = this.now();
    for (const [k, v] of this.data) if (v.expiresAt <= now) this.data.delete(k);
  }
}

/** Upstash Redis over its REST API (no SDK dependency). */
export class UpstashStore implements CounterStore {
  constructor(private readonly url: string, private readonly token: string) {}

  private async pipeline(commands: (string | number)[][]): Promise<unknown[]> {
    const res = await fetch(`${this.url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
    const out = (await res.json()) as { result?: unknown; error?: string }[];
    const failed = out.find((r) => r.error);
    if (failed) throw new Error(`Upstash: ${failed.error}`);
    return out.map((r) => r.result);
  }

  async incr(key: string, by: number, ttlSeconds: number): Promise<number> {
    const [value] = await this.pipeline([
      ["INCRBYFLOAT", key, by],
      ["EXPIRE", key, ttlSeconds, "NX"],
    ]);
    return Number(value);
  }

  async get(key: string): Promise<number> {
    const [value] = await this.pipeline([["GET", key]]);
    return value == null ? 0 : Number(value);
  }
}

/** Uses the primary store, falling back to memory if it errors. */
class FallbackStore implements CounterStore {
  constructor(private readonly primary: CounterStore, private readonly fallback: CounterStore) {}

  private async run<T>(op: (s: CounterStore) => Promise<T>): Promise<T> {
    try {
      return await op(this.primary);
    } catch (error) {
      console.error("[usageLimits] counter store failed, using in-memory fallback:", error);
      return op(this.fallback);
    }
  }

  incr(key: string, by: number, ttlSeconds: number) {
    return this.run((s) => s.incr(key, by, ttlSeconds));
  }
  get(key: string) {
    return this.run((s) => s.get(key));
  }
}

export type LimitConfig = {
  perIpPerMinute: number;
  perIpPerDay: number;
  dailyBudgetUsd: number;
};

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw === undefined || raw === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function configFromEnv(): LimitConfig {
  return {
    perIpPerMinute: envNumber("ASK_PER_IP_PER_MINUTE", 20),
    perIpPerDay: envNumber("ASK_PER_IP_PER_DAY", 100),
    dailyBudgetUsd: envNumber("ASK_DAILY_BUDGET_USD", 5),
  };
}

export type LimitDecision =
  | { ok: true }
  | { ok: false; reason: "minute" | "day" | "budget"; message: string; retryAfterSeconds: number };

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function secondsUntilUtcMidnight(ms: number): number {
  const d = new Date(ms);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - ms) / 1000));
}

export class UsageLimiter {
  constructor(
    private readonly store: CounterStore,
    private readonly config: LimitConfig,
    private readonly now: () => number = Date.now
  ) {}

  /** Checks the budget, then counts this question against the visitor's limits. */
  async admit(visitor: string): Promise<LimitDecision> {
    const now = this.now();
    const day = utcDay(now);

    const spent = await this.store.get(`ask:spend:${day}`);
    if (spent >= this.config.dailyBudgetUsd) {
      return {
        ok: false,
        reason: "budget",
        message: "The map has answered its quota of questions for today. Please try again tomorrow.",
        retryAfterSeconds: secondsUntilUtcMidnight(now),
      };
    }

    const minute = Math.floor(now / 60_000);
    const perMinute = await this.store.incr(`ask:ip:${visitor}:m:${minute}`, 1, 120);
    if (perMinute > this.config.perIpPerMinute) {
      return {
        ok: false,
        reason: "minute",
        message: "Too many questions in a minute. Please wait a moment and try again.",
        retryAfterSeconds: 60 - Math.floor((now % 60_000) / 1000),
      };
    }

    const perDay = await this.store.incr(`ask:ip:${visitor}:d:${day}`, 1, 2 * 86_400);
    if (perDay > this.config.perIpPerDay) {
      return {
        ok: false,
        reason: "day",
        message: "You've reached today's question limit. Please come back tomorrow.",
        retryAfterSeconds: secondsUntilUtcMidnight(now),
      };
    }

    return { ok: true };
  }

  /** Adds a finished question's estimated cost to today's spend. */
  async charge(costUsd: number): Promise<void> {
    if (!(costUsd > 0)) return;
    await this.store.incr(`ask:spend:${utcDay(this.now())}`, costUsd, 2 * 86_400);
  }
}

let shared: UsageLimiter | undefined;

export function getUsageLimiter(): UsageLimiter {
  if (shared) return shared;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const memory = new MemoryStore();
  const store = url && token ? new FallbackStore(new UpstashStore(url, token), memory) : memory;
  shared = new UsageLimiter(store, configFromEnv());
  return shared;
}
