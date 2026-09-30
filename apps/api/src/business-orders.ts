import type { PoolClient } from "pg";
import { z } from "zod";
import { getGoogleRoadRoute } from "./google-routes.js";

import { isGoogleMapsUrl } from "./maps-location.js";
export { getOrderWindow, assertOrderingOpen, isOperationalDay, isWithinOperationalHours } from "./operational-rules.js";

const optionalCoordinate = (min: number, max: number) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().finite().min(min).max(max).optional(),
  );
export const businessQuoteSchema = z.object({
  addressText: z.string().trim().max(1000).optional(),
  lat: optionalCoordinate(-90, 90),
  lng: optionalCoordinate(-180, 180),
  googleMapsUrl: z.string().trim().min(1).max(2048).refine(isGoogleMapsUrl, "INVALID_GOOGLE_MAPS_LINK"),
});

export const businessOrderSchema = businessQuoteSchema.extend({
  customerName: z.string().trim().max(150).optional(),
  customerPhone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s()-]{6,25}$/)
    .refine((value) => value.replace(/\D/g, "").length >= 6),
  orderValue: z.number().finite().min(-9999999).max(9999999).multipleOf(0.01),
  productDescription: z.string().trim().max(2000).optional(),
  readyMinutes: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.number().int().min(0).max(180),
  ),
});

export function calculateTransportPrice(
  distanceMeters: number,
  outsideTariffZone: boolean,
) {
  if (!Number.isInteger(distanceMeters) || distanceMeters < 0)
    throw new Error("INVALID_ROUTE_DISTANCE");
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
    finalTransportFee: calculatedTransportFee,
    transportFeeOverridden: false,
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
  },
) {
  const business = await client.query(
    "SELECT id, lat, lng FROM businesses WHERE id = $1 AND status = 'ACTIVE' AND deleted_at IS NULL FOR SHARE",
    [input.businessId],
  );
  const origin = business.rows[0];
  if (!origin) throw new Error("BUSINESS_NOT_FOUND");
  if (origin.lat == null || origin.lng == null) throw new Error("BUSINESS_LOCATION_REQUIRED");
  const originLat = Number(origin.lat), originLng = Number(origin.lng);
  if (!Number.isFinite(originLat) || !Number.isFinite(originLng))
    throw new Error("BUSINESS_LOCATION_REQUIRED");

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
