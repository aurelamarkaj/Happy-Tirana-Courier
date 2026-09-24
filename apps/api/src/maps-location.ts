export function isGoogleMapsUrl(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (["maps.app.goo.gl", "goo.gl", "maps.google.com"].includes(url.hostname) ||
       (["google.com", "www.google.com"].includes(url.hostname) && url.pathname.startsWith("/maps")));
  } catch { return false; }
}
function coordinates(text: string) {
  let decoded = text;
  try { decoded = decodeURIComponent(text); } catch { /* HTML can contain literal percent signs. */ }
  // Place coordinates have priority over the @ camera centre in Maps links.
  const match = decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) ??
    decoded.match(/[?&](?:q|query|destination|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const lat = Number(match[1]), lng = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
export async function resolveGoogleMapsDestination(originalUrl: string) {
  if (!isGoogleMapsUrl(originalUrl)) throw new Error("INVALID_GOOGLE_MAPS_LINK");
  let url = originalUrl;
  for (let redirect = 0; redirect < 6; redirect++) {
    if (!isGoogleMapsUrl(url)) throw new Error("INVALID_GOOGLE_MAPS_LINK");
    const direct = coordinates(url);
    if (direct) return { ...direct, originalUrl, resolvedUrl: url, addressText: `Google Maps: ${direct.lat}, ${direct.lng}` };
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) break;
      url = new URL(location, url).href;
      continue;
    }
    if (!response.ok) break;
    const html = await response.text();
    const point = coordinates(html);
    if (point) return { ...point, originalUrl, resolvedUrl: url, addressText: `Google Maps: ${point.lat}, ${point.lng}` };
    break;
  }
  throw new Error("GOOGLE_MAPS_LOCATION_NOT_RESOLVED");
}
