import { getGoogleRoadRoute } from "./google-routes.js";

const googleMapsHttpReferrer =
  process.env.GOOGLE_MAPS_HTTP_REFERRER?.trim() ?? "";

export interface Point {
  lat: number;
  lng: number;
}
export interface ItineraryOrder {
  id: string;
  code: string;
  status: string;
  businessName: string;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffAddress: string;
  dropoffLat: number;
  dropoffLng: number;
}
export interface Stop extends Point {
  orderId: string;
  code: string;
  kind: "pickup" | "dropoff";
  title: string;
  address: string;
}
export function orderStops(orders: ItineraryOrder[]): Stop[] {
  return orders.flatMap((order) => {
    if (!["ACCEPTED", "PICKED_UP"].includes(order.status)) return [];
    const stops: Stop[] = [];
    if (order.status === "ACCEPTED")
      stops.push({
        orderId: order.id,
        code: order.code,
        kind: "pickup",
        title: order.businessName,
        address: order.pickupAddress,
        lat: order.pickupLat,
        lng: order.pickupLng,
      });
    stops.push({
      orderId: order.id,
      code: order.code,
      kind: "dropoff",
      title: "Dorëzim " + order.code,
      address: order.dropoffAddress,
      lat: order.dropoffLat,
      lng: order.dropoffLng,
    });
    return stops;
  });
}

// Exact shortest open path on directed road distances, subject to pickup precedence.
// Matrix index 0 is the rider; index i + 1 corresponds to stops[i].
export function optimizeStops(stops: Stop[], distances: number[][]): Stop[] {
  if (stops.length > 4) throw new Error("RIDER_ORDER_CAPACITY_REACHED");
  const full = (1 << stops.length) - 1;
  const memo = new Map<string, { cost: number; path: number[] }>();
  function visit(mask: number, last: number): { cost: number; path: number[] } {
    if (mask === full) return { cost: 0, path: [] };
    const key = mask + ":" + last;
    const cached = memo.get(key);
    if (cached) return cached;
    let best = { cost: Infinity, path: [] as number[] };
    for (let i = 0; i < stops.length; i++) {
      if (mask & (1 << i)) continue;
      const pickup = stops.findIndex(
        (s) => s.orderId === stops[i].orderId && s.kind === "pickup",
      );
      if (stops[i].kind === "dropoff" && pickup >= 0 && !(mask & (1 << pickup)))
        continue;
      const edge = distances[last]?.[i + 1] ?? Infinity;
      if (!Number.isFinite(edge)) continue;
      const tail = visit(mask | (1 << i), i + 1);
      if (edge + tail.cost < best.cost)
        best = { cost: edge + tail.cost, path: [i, ...tail.path] };
    }
    memo.set(key, best);
    return best;
  }
  const best = visit(0, 0);
  if (!Number.isFinite(best.cost))
    throw new Error("GOOGLE_DIRECTIONS_ROUTE_NOT_FOUND");
  return best.path.map((i) => stops[i]);
}

export async function buildItinerary(
  key: string,
  origin: Point,
  orders: ItineraryOrder[],
) {
  const stops = orderStops(orders);
  if (!stops.length)
    return {
      stops: [],
      distanceMeters: 0,
      durationSeconds: 0,
      encodedPolyline: "",
    };
  if (stops.length > 4) throw new Error("RIDER_ORDER_CAPACITY_REACHED");
  let ordered = stops;
  if (orders.length > 1) {
    const points = [origin, ...stops];
    const distances: number[][] = [];
    // Same shortest-road selection as billing, for every directed leg.
    // No air-distance fallback: unavailable road data must be visible.
    for (let i = 0; i < points.length; i++) {
      distances[i] = [];
      for (let j = 0; j < points.length; j++) {
        distances[i][j] = i === j ? 0 : (await getGoogleRoadRoute(key, {
          originLat: points[i].lat, originLng: points[i].lng,
          destinationLat: points[j].lat, destinationLng: points[j].lng,
        }, {allowEstimate:false})).distanceMeters;
      }
    }
    ordered = optimizeStops(stops, distances);
  }
  const destination = ordered[ordered.length - 1];
  const route = await getGoogleRoadRoute(key, {
    originLat: origin.lat,
    originLng: origin.lng,
    destinationLat: destination.lat,
    destinationLng: destination.lng,
    intermediates: ordered.slice(0, -1),
  }, {allowEstimate:false});
  return { ...route, stops: ordered };
}
