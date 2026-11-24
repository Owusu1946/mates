import type { TripPoint } from "./sail.js";

export type RideHandoff = { url: string; fallbackUrl?: string; prefilled: boolean };

const validPoint = (point: TripPoint) => Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 && Number.isFinite(point.lng) && Math.abs(point.lng) <= 180;

/** Only provider-owned URLs are built here. Never use a link returned in a quote. */
export function rideHandoff(provider: string, from: TripPoint, to: TripPoint): RideHandoff | null {
  const name = provider.toLowerCase();
  if (name === "bolt") return { url: "https://bolt.eu/en/rides/", prefilled: false };
  if (!validPoint(from) || !validPoint(to)) return null;

  if (name === "uber") {
    const app = new URL("uber://riderequest");
    const web = new URL("https://m.uber.com/looking");
    app.searchParams.set("pickup[latitude]", String(from.lat));
    app.searchParams.set("pickup[longitude]", String(from.lng));
    app.searchParams.set("pickup[nickname]", from.name ?? "Pickup");
    app.searchParams.set("dropoff[latitude]", String(to.lat));
    app.searchParams.set("dropoff[longitude]", String(to.lng));
    app.searchParams.set("dropoff[nickname]", to.name ?? "Destination");
    web.searchParams.set("pickup", JSON.stringify({ latitude: from.lat, longitude: from.lng, addressLine1: from.name ?? "Pickup" }));
    web.searchParams.set("drop[0]", JSON.stringify({ latitude: to.lat, longitude: to.lng, addressLine1: to.name ?? "Destination" }));
    if (process.env.UBER_CLIENT_ID) web.searchParams.set("client_id", process.env.UBER_CLIENT_ID);
    return { url: app.toString(), fallbackUrl: web.toString(), prefilled: true };
  }

  if (name === "yango") {
    const fallback = new URL("https://yango.com/en_int/order/");
    fallback.searchParams.set("gfrom", `${from.lng},${from.lat}`);
    fallback.searchParams.set("gto", `${to.lng},${to.lat}`);
    fallback.searchParams.set("ref", "mates");
    const link = new URL("https://yango.go.link/route");
    link.searchParams.set("start-lat", String(from.lat));
    link.searchParams.set("start-lon", String(from.lng));
    link.searchParams.set("end-lat", String(to.lat));
    link.searchParams.set("end-lon", String(to.lng));
    link.searchParams.set("ref", "mates");
    link.searchParams.set("adj_t", "vokme8e_nd9s9z9");
    link.searchParams.set("lang", "en");
    link.searchParams.set("adj_deeplink_js", "1");
    link.searchParams.set("adj_fallback", fallback.toString());
    return { url: link.toString(), fallbackUrl: fallback.toString(), prefilled: true };
  }

  return null;
}
