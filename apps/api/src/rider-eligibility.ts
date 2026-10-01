import type { PoolClient } from "pg";
import { getGoogleRoadRoute } from "./google-routes.js";
import { MAX_ACTIVE_ORDERS, secondOrderLimits, debitEligible } from "./operational-rules.js";

export async function assertRiderEligible(client: Pick<PoolClient, "query">, riderId: string, orderId: string, apiKey: string) {
  const result = await client.query(`SELECT rp.is_online, rp.status, u.status AS user_status,
      rp.vehicle_type, rp.debit_limit_all, o.route_distance_meters,
      (SELECT COALESCE(sum(amount),0) FROM ledger_entries WHERE rider_id=rp.id
        AND direction='RIDER_OWES_PLATFORM' AND status='OPEN') AS debit
      FROM rider_profiles rp JOIN users u ON u.id=rp.user_id CROSS JOIN orders o
      WHERE rp.id=$1 AND o.id=$2`, [riderId, orderId]);
  const rider = result.rows[0];
  if (!rider?.is_online || rider.status !== "ACTIVE" || rider.user_status !== "ACTIVE") throw new Error("RIDER_NOT_ELIGIBLE");
  if (!debitEligible(Number(rider.debit), Number(rider.debit_limit_all))) throw new Error("RIDER_DEBIT_LIMIT_REACHED");
  if (!['ELECTRIC', 'DIESEL'].includes(rider.vehicle_type) || (Number(rider.route_distance_meters) > 3000 && rider.vehicle_type !== 'DIESEL'))
    throw new Error("RIDER_VEHICLE_NOT_ELIGIBLE");
  await assertSecondOrderEligible(client, riderId, orderId, apiKey);
}

// Caller holds the rider_profiles row lock for both dispatch and acceptance.
export async function assertSecondOrderEligible(client: Pick<PoolClient, "query">, riderId: string, orderId: string, apiKey: string) {
  const active = await client.query(
    "SELECT id, status FROM orders WHERE assigned_rider_id=$1 AND status IN ('ACCEPTED','PICKED_UP') ORDER BY accepted_at", [riderId]);
  if (active.rows.length >= MAX_ACTIVE_ORDERS) throw new Error("RIDER_ORDER_CAPACITY_REACHED");
  if (!active.rows.length) return;
  if (active.rows[0].status !== "PICKED_UP") throw new Error("SECOND_ORDER_REQUIRES_PICKUP");
  const limits = secondOrderLimits();
  const result = await client.query(`SELECT first_order.business_id AS first_business_id,
      second_order.business_id AS second_business_id,
      first_business.lat AS first_business_lat, first_business.lng AS first_business_lng,
      second_business.lat AS second_business_lat, second_business.lng AS second_business_lng,
      first_destination.lat AS first_destination_lat, first_destination.lng AS first_destination_lng,
      second_destination.lat AS second_destination_lat, second_destination.lng AS second_destination_lng
      FROM orders first_order
      JOIN businesses first_business ON first_business.id=first_order.business_id
      JOIN addresses first_destination ON first_destination.id=first_order.delivery_address_id
      CROSS JOIN orders second_order
      JOIN businesses second_business ON second_business.id=second_order.business_id
      JOIN addresses second_destination ON second_destination.id=second_order.delivery_address_id
      WHERE first_order.id=$1 AND second_order.id=$2`, [active.rows[0].id, orderId]);
  const point = result.rows[0];
  if (!point || [point.first_business_lat,point.first_business_lng,point.second_business_lat,point.second_business_lng,
    point.first_destination_lat,point.first_destination_lng,point.second_destination_lat,point.second_destination_lng]
    .some(v => v == null || !Number.isFinite(Number(v))))
    throw new Error("SECOND_ORDER_LOCATION_REQUIRED");
  if (point.first_business_id === point.second_business_id) throw new Error("SECOND_ORDER_SAME_BUSINESS");
  async function distanceMeters(originLat: number, originLng: number, destinationLat: number, destinationLng: number) {
    if (originLat === destinationLat && originLng === destinationLng) return 0;
    const route = await getGoogleRoadRoute(apiKey, { originLat, originLng, destinationLat, destinationLng }, { allowEstimate: false });
    return route.distanceMeters;
  }
  const [businessDistance, destinationDistance] = await Promise.all([
    distanceMeters(Number(point.first_business_lat), Number(point.first_business_lng),
      Number(point.second_business_lat), Number(point.second_business_lng)),
    distanceMeters(Number(point.first_destination_lat), Number(point.first_destination_lng),
      Number(point.second_destination_lat), Number(point.second_destination_lng)),
  ]);
  if (businessDistance > limits.business) throw new Error("SECOND_ORDER_BUSINESS_TOO_FAR");
  if (destinationDistance > limits.destination) throw new Error("SECOND_ORDER_DESTINATION_TOO_FAR");
}
