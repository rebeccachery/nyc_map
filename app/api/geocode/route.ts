export const runtime = "nodejs";

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(
    10,
    Math.max(1, Number(searchParams.get("limit") ?? "5"))
  );

  if (!q) {
    return Response.json({ results: [] });
  }

  // NYC-ish bounding box (west, south, east, north)
  const viewbox = "-74.35,40.48,-73.65,40.94";

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("bounded", "1");
  url.searchParams.set("viewbox", viewbox);

  // Nominatim requires a real User-Agent identifying the application.
  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "nyc-map-dev (local)",
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return new Response(
      JSON.stringify({ error: `Geocode failed (${res.status})` }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  const raw = (await res.json()) as NominatimResult[];
  const results = raw
    .map((r) => ({
      id: String(r.place_id),
      name: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon),
    }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));

  return Response.json({ results });
}

