"""
Independent ground truth for the ask-the-map golden set.

Reads the raw snapshot files and answers each golden question with its own implementation,
deliberately sharing no code with lib/query (TypeScript):
  - distances use Shapely in a projected CRS (Florida GDL Albers for Miami, UTM 18N for NYC)
    to find the nearest boundary point, then pyproj's WGS84 geodesic for the distance itself,
    instead of the engine's local equirectangular math;
  - the composite need score and tiers are recomputed from raw ACS fields and checked
    against the snapshot.

    python3 eval/ground_truth.py          # writes eval/golden.expected.json

Requires: pip install shapely pyproj numpy
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from pyproj import Geod, Transformer
import numpy as np
import shapely
from shapely.geometry import Point, shape
from shapely.ops import nearest_points

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOTS = ROOT / "data" / "snapshots"
METERS_PER_MILE = 1609.344
CRS = {"miami": "EPSG:3086", "nyc": "EPSG:32618"}
GEOD = Geod(ellps="WGS84")
NON_ACCESS_LIBRARY = re.compile(r"\bkiosk\b|\blaw library\b", re.I)  # documented rule, see engine.ts


class Metro:
    def __init__(self, metro: str):
        d = SNAPSHOTS / metro
        self.metro = metro
        self.manifest = json.loads((d / "manifest.json").read_text())
        feats = json.loads((d / "zips.geojson").read_text())["features"]
        to_crs = Transformer.from_crs("EPSG:4326", CRS[metro], always_xy=True)
        self._from_crs = Transformer.from_crs(CRS[metro], "EPSG:4326", always_xy=True)

        def project(geom):
            """lon/lat -> metres in the metro's projected CRS."""
            return shapely.transform(geom, lambda xy: np.column_stack(to_crs.transform(xy[:, 0], xy[:, 1])))

        self.zips = {f["properties"]["zcta"]: f["properties"] for f in feats}
        self.geom = {f["properties"]["zcta"]: project(shape(f["geometry"])) for f in feats}
        self.anchor = {z: project(Point(*p["anchor"])) for z, p in self.zips.items()}
        self.places = {
            "library": json.loads((d / "libraries.json").read_text()),
            "school": json.loads((d / "schools.json").read_text()),
        }
        self.pt = {
            p["id"]: project(Point(p["lon"], p["lat"]))
            for kind in self.places
            for p in self.places[kind]
        }
        self.lonlat = {p["id"]: (p["lon"], p["lat"]) for kind in self.places for p in self.places[kind]}

    # --- independent recomputation of need scores ---
    def check_scores(self) -> list[str]:
        rel = [p for p in self.zips.values() if p["reliable"]]

        def prank(v, vals):
            below = sum(1 for x in vals if x < v)
            eq = sum(1 for x in vals if x == v)
            return (below + 0.5 * eq) / len(vals) * 100

        cols = {k: [p[k] for p in rel] for k in ("haitianPopPct", "pctNoInternet", "pctNoHS")}
        problems = []
        for p in rel:
            score = (
                0.4 * prank(p["haitianPopPct"], cols["haitianPopPct"])
                + 0.3 * prank(p["pctNoInternet"], cols["pctNoInternet"])
                + 0.3 * prank(p["pctNoHS"], cols["pctNoHS"])
            )
            if abs(score - p["educationNeedScore"]) > 1e-6:
                problems.append(f"{p['zcta']}: score {p['educationNeedScore']} != recomputed {score}")
        return problems

    def tier(self, p: dict, mode: str = "education") -> str:
        if not p["reliable"]:
            return "insufficient_data"
        b = self.manifest["tierBreaks"][mode]
        v = p["educationNeedScore"] if mode == "education" else p["haitianPopPct"]
        return "high" if v >= b["mediumMax"] else "medium" if v >= b["lowMax"] else "low"

    def counts_as_access(self, place: dict) -> bool:
        return place["kind"] != "library" or not NON_ACCESS_LIBRARY.search(place["name"])

    def dist_miles(self, zcta: str, place_id: str, measure: str = "boundary") -> float:
        """Geodesic (WGS84 ellipsoid) miles. For "boundary", the nearest boundary point is found
        in projected space, then the distance is measured on the ellipsoid."""
        lon, lat = self.lonlat[place_id]
        if measure == "center":
            alon, alat = self.zips[zcta]["anchor"]
            return GEOD.inv(alon, alat, lon, lat)[2] / METERS_PER_MILE
        geom, pt = self.geom[zcta], self.pt[place_id]
        if geom.covers(pt):
            return 0.0
        near, _ = nearest_points(geom.boundary, pt)
        nlon, nlat = self._from_crs.transform(near.x, near.y)
        return GEOD.inv(nlon, nlat, lon, lat)[2] / METERS_PER_MILE

    def count_within(self, zcta, kind, miles, measure="boundary") -> int:
        return sum(
            1
            for p in self.places[kind]
            if self.counts_as_access(p) and self.dist_miles(zcta, p["id"], measure) <= miles
        )

    # --- reference semantics, reimplemented ---
    def find_zips(self, inp: dict) -> list[dict]:
        mode = (inp.get("need") or {}).get("mode", "education")
        out = []
        for z, p in self.zips.items():
            if inp.get("regions") and p["region"] not in inp["regions"]:
                continue
            if not p["reliable"] and not inp.get("includeUnreliable"):
                continue
            if inp.get("need") and self.tier(p, mode) not in inp["need"]["tiers"]:
                continue
            if any(
                ("min" in m and p[m["metric"]] < m["min"]) or ("max" in m and p[m["metric"]] > m["max"])
                for m in inp.get("metrics", [])
            ):
                continue
            ok = True
            for c in inp.get("access", []):
                n = self.count_within(z, c["kind"], c["withinMiles"], c.get("measure", "boundary"))
                need = c.get("atLeast", 1)
                if (n < need) if c["has"] else (n >= need):
                    ok = False
            if ok:
                out.append(p)
        key = (inp.get("sortBy") or {}).get("key") or ("haitianPopPct" if mode == "population" else "educationNeedScore")
        desc = (inp.get("sortBy") or {}).get("order", "desc") == "desc"
        out.sort(key=lambda p: (-p[key] if desc else p[key], p["zcta"]))
        return out[: inp.get("limit", 25)]

    def nearby(self, zcta, kind, within=None, measure="boundary") -> list[tuple[float, dict]]:
        rows = [
            (self.dist_miles(zcta, p["id"], measure), p)
            for p in self.places[kind]
            if self.counts_as_access(p)
        ]
        rows = [r for r in rows if r[0] <= (within if within is not None else 10)]
        rows.sort(key=lambda r: (r[0], r[1]["id"]))
        return rows

    def region_totals(self, field: str) -> dict[str, float]:
        out: dict[str, float] = {}
        if field in ("libraries", "schools"):
            # Every listed location, matching the map's county/borough counts.
            kind = "library" if field == "libraries" else "school"
            for p in self.places[kind]:
                if p["region"]:
                    out[p["region"]] = out.get(p["region"], 0) + 1
            return out
        for p in self.zips.values():
            if field == "tierCounts.high":
                out[p["region"]] = out.get(p["region"], 0) + (1 if self.tier(p) == "high" else 0)
            else:
                out[p["region"]] = out.get(p["region"], 0) + p[field]
        return out


def expected_for(q: dict, m: Metro):
    """Expected answer; questions with `alternatives` accept any of several readings."""
    alts = q["answer"].get("alternatives")
    primary = expected_one(q["reference"], q["answer"], m)
    if not alts:
        return primary
    return {"anyOf": [primary] + [expected_one(ref, q["answer"], m) for ref in alts]}


def expected_one(ref: dict, ans: dict, m: Metro):
    t = ans["type"]
    if t == "value":
        p = m.zips[ref["input"]["zcta"]]
        if ans["field"] == "educationNeedTier":
            return m.tier(p, "education")
        if ans["field"] == "populationNeedTier":
            return m.tier(p, "population")
        return p[ans["field"]]
    if t in ("zip_set", "ranked_zips"):
        rows = m.find_zips(ref["input"])
        zcs = [p["zcta"] for p in rows]
        return sorted(zcs) if t == "zip_set" else zcs[: ans["n"]]
    if t == "nearest_place":
        # Several places can tie (e.g. all schools inside the ZIP are 0 miles away): any of them is right.
        i = ref["input"]
        rows = m.nearby(i["nearZip"], i["kind"])
        best = rows[0][0]
        tied = [p for d, p in rows if d <= best + 0.05]
        return {"ids": [p["id"] for p in tied], "names": [p["name"] for p in tied], "miles": round(best, 2)}
    if t == "count":
        i = ref["input"]
        if ref["tool"] == "find_zips":
            return len(m.find_zips({**i, "limit": 10_000}))
        return len(m.nearby(i["nearZip"], i["kind"], i.get("withinMiles")))
    if t == "argmax_region":
        totals = {r: v for r, v in m.region_totals(ans["field"]).items() if r in ref["input"]["regions"]}
        return {"winner": max(totals, key=totals.get), "values": totals}
    if t == "region_values":
        return m.region_totals(ans["field"])
    if t == "refusal":
        return None
    raise ValueError(f"unknown answer type {t}")


def main() -> int:
    golden = json.loads((ROOT / "eval" / "golden.json").read_text())
    metros: dict[str, Metro] = {}
    expected = {}
    for q in golden["questions"]:
        m = metros.setdefault(q["metro"], Metro(q["metro"]))
        expected[q["id"]] = expected_for(q, m)

    problems = [f"[{k}] {p}" for k, m in metros.items() for p in m.check_scores()]
    for k, m in metros.items():
        for z, p in m.zips.items():
            if p["reliable"] and m.tier(p) != p["educationNeedTier"]:
                problems.append(f"[{k}] {z}: tier {p['educationNeedTier']} != recomputed {m.tier(p)}")

    out = {
        "generatedFrom": {k: m.manifest["createdAt"] for k, m in metros.items()},
        "expected": expected,
    }
    (ROOT / "eval" / "golden.expected.json").write_text(json.dumps(out, indent=2) + "\n")
    for qid, v in expected.items():
        print(f"{qid}: {json.dumps(v)[:140]}")
    if problems:
        print("\nScore/tier recomputation mismatches:", *problems[:20], sep="\n  ")
        return 1
    print("\nNeed scores and tiers recomputed independently: all match.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
