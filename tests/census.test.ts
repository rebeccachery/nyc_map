import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { censusKeyParam } from "@/lib/census";

const original = process.env.CENSUS_API_KEY;
afterEach(() => {
  if (original === undefined) delete process.env.CENSUS_API_KEY;
  else process.env.CENSUS_API_KEY = original;
});

describe("censusKeyParam", () => {
  it("omits the key when none is configured", () => {
    delete process.env.CENSUS_API_KEY;
    expect(censusKeyParam()).toBe("");
    process.env.CENSUS_API_KEY = "   ";
    expect(censusKeyParam()).toBe("");
  });

  it("adds an encoded key when configured", () => {
    process.env.CENSUS_API_KEY = "abc123";
    expect(censusKeyParam()).toBe("&key=abc123");
  });
});

describe("source code", () => {
  it("contains no hardcoded 40-character hex API keys", () => {
    const root = path.resolve(__dirname, "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (["node_modules", ".next", ".git", "data"].includes(name)) continue;
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx|mjs|js)$/.test(name) && /\b[0-9a-f]{40}\b/.test(readFileSync(full, "utf8"))) {
          offenders.push(path.relative(root, full));
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
