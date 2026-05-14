export const runtime = "nodejs";

type OSRMResponse = {
  code: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: {
      type: "LineString";
      coordinates: [number, number][];
    };
  }>;
  message?: string;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = (searchParams.get("from") ?? "").trim(); // "lng,lat"
  const to = (searchParams.get("to") ?? "").trim(); // "lng,lat"
  const profile = (searchParams.get("profile") ?? "walking").trim(); // walking|driving|cycling

  if (!from || !to) {
    return new Response(
      JSON.stringify({ error: "Missing from/to" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  const profileSafe =
    profile === "driving" || profile === "cycling" ? profile : "walking";

  // OSRM public demo server (OSM-based). For production, self-host OSRM or swap to a paid provider.
  const osrm = new URL(
    `https://router.project-osrm.org/route/v1/${profileSafe}/${from};${to}`
  );
  osrm.searchParams.set("overview", "full");
  osrm.searchParams.set("geometries", "geojson");
  osrm.searchParams.set("alternatives", "false");
  osrm.searchParams.set("steps", "false");

  const res = await fetch(osrm.toString(), { cache: "no-store" });
  if (!res.ok) {
    return new Response(
      JSON.stringify({ error: `Routing failed (${res.status})` }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  const data = (await res.json()) as OSRMResponse;
  const route = data.routes?.[0];
  if (!route || data.code !== "Ok") {
    return new Response(
      JSON.stringify({ error: data.message ?? "No route found" }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  const feature = {
    type: "Feature" as const,
    properties: {
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      profile: profileSafe,
      provider: "osrm",
    },
    geometry: route.geometry,
  };

  return Response.json({
    route: {
      type: "FeatureCollection" as const,
      features: [feature],
    },
  });
}

