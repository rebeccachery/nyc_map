export const runtime = "nodejs";

import { transit_realtime } from "gtfs-realtime-bindings";

const FEEDS: Record<string, string> = {
  // MTA realtime GTFS-RT feed ids (nyct)
  // See: https://api.mta.info/
  ace: "nyct%2Fgtfs-ace",
  bdfm: "nyct%2Fgtfs-bdfm",
  g: "nyct%2Fgtfs-g",
  jz: "nyct%2Fgtfs-jz",
  nqrw: "nyct%2Fgtfs-nqrw",
  l: "nyct%2Fgtfs-l",
  "123": "nyct%2Fgtfs",
  "4567": "nyct%2Fgtfs",
  si: "nyct%2Fgtfs-si",
};

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const feedKey = (searchParams.get("feed") ?? "ace").toLowerCase();
  const feed = FEEDS[feedKey] ?? FEEDS.ace;

  const apiKey = process.env.MTA_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error:
          "Missing MTA_API_KEY. Set it in your environment to enable MTA realtime.",
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const url = `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/${feed}`;
  const res = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return new Response(
      JSON.stringify({ error: `MTA feed failed (${res.status})` }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const message = transit_realtime.FeedMessage.decode(buf);

  const features = message.entity
    .map((e) => e.vehicle)
    .filter(Boolean)
    .map((v) => {
      const lat = toNumber(v?.position?.latitude);
      const lng = toNumber(v?.position?.longitude);
      if (lat === null || lng === null) return null;

      const ts = v?.timestamp ? Number(v.timestamp) : null;
      const routeId = v?.trip?.routeId ?? null;
      const tripId = v?.trip?.tripId ?? null;
      const vehicleId = v?.vehicle?.id ?? null;

      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [lng, lat] as const },
        properties: {
          source: "mta",
          mode: "subway",
          feed: feedKey,
          routeId,
          tripId,
          vehicleId,
          timestamp: ts,
        },
      };
    })
    .filter(Boolean);

  return Response.json({
    type: "FeatureCollection",
    features,
  });
}

