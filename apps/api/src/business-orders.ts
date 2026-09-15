import type { PoolClient } from "pg";
import { z } from "zod";
import { getGoogleRoadRoute } from "./google-routes.js";

const tiranaFallback = { lat: 41.3275, lng: 19.8187 };

const optionalCoordinate = (min: number, max: number) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().finite().min(min).max(max).optional(),
  );
const money = z.number().finite().min(0).max(9999999).multipleOf(0.01);
export const businessQuoteSchema = z.object({
  addressText: z.string().trim().max(1000).optional(),
  lat: optionalCoordinate(-90, 90),
  lng: optionalCoordinate(-180, 180),
  googleMapsUrl: z.string().trim().max(2048).optional(),
  transportFeeOverride: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    money.optional(),
  ),
});

export const businessOrderSchema = businessQuoteSchema.extend({
  customerName: z.string().trim().min(1).max(150),
  customerPhone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s()-]{6,25}$/)
    .refine((value) => value.replace(/\D/g, "").length >= 6),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        price: money.positive(),
      }),
    )
    .min(1)
    .max(50),
  productDescription: z.string().trim().max(2000).optional(),
  readyMinutes: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().int().min(0).max(180).default(10),
  ),
});

const tiranaClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Tirane",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function getOrderWindow(now = new Date()) {
  const parts = Object.fromEntries(
    tiranaClock.formatToParts(now).map((p) => [p.type, p.value]),
  );
  const seconds =
    Number(parts.hour) * 3600 +
    Number(parts.minute) * 60 +
    Number(parts.second);
  const isOpen = seconds >= 7 * 3600 && seconds < 23 * 3600;
  const untilChange = isOpen
    ? 23 * 3600 - seconds
    : (7 * 3600 - seconds + 86400) % 86400;
  return {
    isOpen,
    timeZone: "Europe/Tirane",
    opensAt: "07:00",
    closesAt: "23:00",
    nextCheckInSeconds: Math.min(30, untilChange),
    serverTime: now.toISOString(),
  };
}

export function assertOrderingOpen(now = new Date()) {
  if (!getOrderWindow(now).isOpen) throw new Error("ORDERING_CLOSED");
}

export function calculateTransportPrice(
  distanceMeters: number,
  outsideTariffZone: boolean,
  override?: number,
) {
  if (!Number.isInteger(distanceMeters) || distanceMeters < 0)
    throw new Error("INVALID_ROUTE_DISTANCE");
  if (override !== undefined && !money.safeParse(override).success)
    throw new Error("INVALID_TRANSPORT_FEE");
  const baseFee = 300;
  const extraDistanceFee =
    Math.round(Math.max(0, distanceMeters - 3000) * 10) / 100;
  const ringSurchargeFee = outsideTariffZone ? 100 : 0;
  const calculatedTransportFee =
    Math.round((baseFee + extraDistanceFee + ringSurchargeFee) * 100) / 100;
  return {
    baseFee,
    extraDistanceFee,
    ringSurchargeFee,
    ringSurchargeApplied: outsideTariffZone,
    calculatedTransportFee,
    finalTransportFee: override ?? calculatedTransportFee,
    transportFeeOverridden: override !== undefined,
  };
}

export async function calculateBusinessTransportQuote(
  client: Pick<PoolClient, "query">,
  apiKey: string,
  input: {
    businessId: string;
    lat: number;
    lng: number;
    googleMapsUrl?: string | null;
    transportFeeOverride?: number;
  },
) {
  const business = await client.query(
    "SELECT id, lat, lng FROM businesses WHERE id = $1 AND status = 'ACTIVE'",
    [input.businessId],
  );
  const origin = business.rows[0];
  if (!origin) throw new Error("BUSINESS_NOT_FOUND");
  const storedLat = Number(origin.lat);
  const storedLng = Number(origin.lng);
  const originLat =
    Number.isFinite(storedLat) && Math.abs(storedLat) > 0.0001
      ? storedLat
      : tiranaFallback.lat;
  const originLng =
    Number.isFinite(storedLng) && Math.abs(storedLng) > 0.0001
      ? storedLng
      : tiranaFallback.lng;

  // Coverage and tariff areas have separate roles. Boundaries count as inside.
  const coverage = await client.query(
    `SELECT id, name FROM zones
    WHERE active = true AND is_surcharge_area = false
      AND ST_Covers(polygon, ST_SetSRID(ST_MakePoint($1, $2), 4326))
    ORDER BY created_at, id LIMIT 1`,
    [input.lng, input.lat],
  );
  const zone = coverage.rows[0];
  if (!zone) throw new Error("DELIVERY_ZONE_NOT_FOUND");
  const pickupCoverage = await client.query(
    `SELECT id FROM zones
    WHERE active = true AND is_surcharge_area = false
      AND ST_Covers(polygon, ST_SetSRID(ST_MakePoint($1, $2), 4326)) LIMIT 1`,
    [originLng, originLat],
  );
  if (!pickupCoverage.rows[0]) throw new Error("BUSINESS_OUTSIDE_COVERAGE");
  const tariff = await client.query(
    `SELECT COUNT(*)::int AS count,
    COALESCE(BOOL_OR(ST_Covers(polygon, ST_SetSRID(ST_MakePoint($1, $2), 4326))), false) AS inside
    FROM zones WHERE active = true AND is_surcharge_area = true`,
    [input.lng, input.lat],
  );
  if (!Number(tariff.rows[0]?.count)) throw new Error("TARIFF_ZONE_REQUIRED");

  const route = await getGoogleRoadRoute(
    apiKey,
    {
      originLat,
      originLng,
      destinationLat: input.lat,
      destinationLng: input.lng,
    },
    { allowEstimate: false },
  );
  const price = calculateTransportPrice(
    route.distanceMeters,
    !tariff.rows[0].inside,
    input.transportFeeOverride,
  );
  return {
    ...price,
    zoneId: zone.id as string,
    zoneName: zone.name as string,
    distanceMeters: route.distanceMeters,
    distanceKm: route.distanceMeters / 1000,
    distanceSource: route.source,
    routePreference: "SHORTEST_ROAD_IGNORE_TRAFFIC",
    googleMapsUrl: input.googleMapsUrl?.trim() || null,
  };
}
