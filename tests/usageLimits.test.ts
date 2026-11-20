import { describe, expect, it } from "vitest";
import { MemoryStore, UsageLimiter, type LimitConfig } from "@/lib/usageLimits";

const config: LimitConfig = { perIpPerMinute: 3, perIpPerDay: 5, dailyBudgetUsd: 1 };

function setup(start = Date.UTC(2026, 10, 19, 12, 0, 0)) {
  let now = start;
  const clock = { advance: (ms: number) => (now += ms) };
  const store = new MemoryStore(() => now);
  return { clock, limiter: new UsageLimiter(store, config, () => now) };
}

describe("UsageLimiter", () => {
  it("caps questions per visitor per minute, then resets", async () => {
    const { clock, limiter } = setup();
    for (let i = 0; i < 3; i++) expect((await limiter.admit("a")).ok).toBe(true);
    const blocked = await limiter.admit("a");
    expect(blocked).toMatchObject({ ok: false, reason: "minute" });
    expect((await limiter.admit("b")).ok).toBe(true);
    clock.advance(60_000);
    expect((await limiter.admit("a")).ok).toBe(true);
  });

  it("caps questions per visitor per day, then resets at UTC midnight", async () => {
    const { clock, limiter } = setup();
    let last;
    for (let i = 0; i < 6; i++) {
      last = await limiter.admit("a");
      clock.advance(61_000);
    }
    expect(last).toMatchObject({ ok: false, reason: "day" });
    clock.advance(12 * 3_600_000);
    expect((await limiter.admit("a")).ok).toBe(true);
  });

  it("stops everyone once the daily budget is spent", async () => {
    const { clock, limiter } = setup();
    expect((await limiter.admit("a")).ok).toBe(true);
    await limiter.charge(0.6);
    expect((await limiter.admit("b")).ok).toBe(true);
    await limiter.charge(0.6);
    const blocked = await limiter.admit("c");
    expect(blocked).toMatchObject({ ok: false, reason: "budget" });
    if (!blocked.ok) expect(blocked.retryAfterSeconds).toBe(12 * 3600);
    clock.advance(12 * 3_600_000);
    expect((await limiter.admit("c")).ok).toBe(true);
  });

  it("ignores zero or invalid costs", async () => {
    const { limiter } = setup();
    await limiter.charge(0);
    await limiter.charge(Number.NaN);
    await limiter.charge(-5);
    expect((await limiter.admit("a")).ok).toBe(true);
  });
});
