import "dotenv/config";
import crypto from "node:crypto";
import http from "node:http";
import type { PoolClient } from "pg";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { Server } from "socket.io";
import { z } from "zod";
import { pool } from "@happy-tirana/db";

const app = express();
const server = http.createServer(app);
const sampleBusinessIds = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
  "10000000-0000-4000-8000-000000000004",
  "10000000-0000-4000-8000-000000000005",
  "10000000-0000-4000-8000-000000000006",
  "10000000-0000-4000-8000-000000000007",
  "10000000-0000-4000-8000-000000000008",
  "10000000-0000-4000-8000-000000000009",
  "10000000-0000-4000-8000-000000000010",
  "10000000-0000-4000-8000-000000000011",
  "10000000-0000-4000-8000-000000000012",
  "10000000-0000-4000-8000-000000000013",
  "10000000-0000-4000-8000-000000000014",
];
const io = new Server(server, {
  cors: {
    origin: [/^http:\/\/localhost:300\d$/, /^http:\/\/127\.0\.0\.1:300\d$/],
    credentials: true,
  },
});
const nearbyRiderOfferLimit = 5;
const orderOfferTtlMinutes = 3;

app.use(helmet());
app.use(
  cors({
    origin: [/^http:\/\/localhost:300\d$/, /^http:\/\/127\.0\.0\.1:300\d$/],
    credentials: true,
  }),
);
app.use(express.json({ limit: "5mb" }));

io.on("connection", (socket) => {
  socket.on("admin.join", () => socket.join("admin"));
  socket.on("business.join", (businessId: string) =>
    socket.join(`business:${businessId}`),
  );
  socket.on("rider.join", (riderId: string) => socket.join(`rider:${riderId}`));
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "happy-tirana-api" });
});

function hashPassword(
  password: string,
  salt = crypto.randomBytes(16).toString("hex"),
) {
  const hash = crypto
    .pbkdf2Sync(password, salt, 120000, 32, "sha256")
    .toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  return hashPassword(password, salt) === stored;
}

function customerIdFromHeader(req: express.Request) {
  const value = req.header("x-customer-id");
  return value && z.string().uuid().safeParse(value).success ? value : null;
}

function guestTokenFromHeader(req: express.Request) {
  const value = req.header("x-guest-cart-id")?.trim();
  const result = z
    .string()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/)
    .safeParse(value);
  return result.success ? result.data : null;
}

function numericOrUndefined(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function mapCustomer(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    defaultAddress: row.default_address,
    defaultLat: numericOrUndefined(row.default_lat),
    defaultLng: numericOrUndefined(row.default_lng),
  };
}

async function mergeGuestCartIntoCustomerCart(
  client: PoolClient,
  guestToken: string | null,
  customerAccountId: string,
) {
  if (!guestToken) return;

  const guestCart = await client.query(
    "SELECT id, business_id FROM customer_carts WHERE guest_token = $1 FOR UPDATE",
    [guestToken],
  );
  if (!guestCart.rows[0]) return;

  const customerCart = await client.query(
    `INSERT INTO customer_carts (customer_account_id, business_id)
     VALUES ($1, $2)
     ON CONFLICT (customer_account_id) DO UPDATE
     SET business_id = COALESCE(EXCLUDED.business_id, customer_carts.business_id),
         updated_at = now()
     RETURNING id`,
    [customerAccountId, guestCart.rows[0].business_id ?? null],
  );

  if (guestCart.rows[0].business_id) {
    await client.query(
      "UPDATE customer_carts SET business_id = $2, updated_at = now() WHERE id = $1",
      [customerCart.rows[0].id, guestCart.rows[0].business_id],
    );
    await client.query(
      `DELETE FROM customer_cart_items cci
       USING products p
       WHERE cci.product_id = p.id
         AND cci.cart_id = $1
         AND p.business_id <> $2`,
      [customerCart.rows[0].id, guestCart.rows[0].business_id],
    );
  }

  await client.query(
    `INSERT INTO customer_cart_items (cart_id, product_id, quantity)
     SELECT $1, product_id, quantity
     FROM customer_cart_items
     WHERE cart_id = $2
     ON CONFLICT (cart_id, product_id) DO UPDATE
     SET quantity = customer_cart_items.quantity + EXCLUDED.quantity,
         updated_at = now()`,
    [customerCart.rows[0].id, guestCart.rows[0].id],
  );

  await client.query("DELETE FROM customer_carts WHERE id = $1", [
    guestCart.rows[0].id,
  ]);
}

type NominatimPlace = {
  osm_id?: number | string;
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: {
    road?: string;
    pedestrian?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    country?: string;
  };
};

type AddressSuggestion = {
  id: string;
  label: string;
  area: string;
  city: string;
  details: string;
  lat: number;
  lng: number;
};

function mapAddressRow(row: Record<string, unknown>): AddressSuggestion {
  return {
    id: String(row.id),
    label: String(row.label),
    area: String(row.area ?? ""),
    city: String(row.city ?? ""),
    details: String(row.details ?? ""),
    lat: Number(row.lat),
    lng: Number(row.lng),
  };
}

function mapRiderProfile(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    phone: row.phone,
    vehicleType: row.vehicle_type,
    licenseNumber: row.license_number,
    isOnline: row.is_online,
    status: row.status,
    lastSeenAt: row.last_seen_at,
  };
}

function mapRiderOrder(row: Record<string, unknown>) {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    businessName: row.business_name,
    businessPhone: row.business_phone,
    pickupAddress: row.pickup_address,
    pickupLat: Number(row.pickup_lat ?? 41.3275),
    pickupLng: Number(row.pickup_lng ?? 19.8187),
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    dropoffAddress: row.dropoff_address,
    dropoffLat: Number(row.dropoff_lat),
    dropoffLng: Number(row.dropoff_lng),
    productDescription: row.product_description,
    productValue: Number(row.product_value),
    transportFee: Number(row.transport_fee),
    platformCommission: Number(row.platform_commission),
    riderEarning: Number(row.rider_earning),
    totalAmount: Number(row.total_amount),
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
    pickedUpAt: row.picked_up_at,
    deliveredAt: row.delivered_at,
    offerExpiresAt: row.offer_expires_at,
  };
}

function mapBusinessProduct(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    imageUrl: row.image_url,
    section: row.section,
    isAvailable: row.is_available,
    createdAt: row.created_at,
  };
}

function mapBusinessCategory(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    sortOrder: Number(row.sort_order ?? 0),
    active: row.active,
    productCount: Number(row.product_count ?? 0),
  };
}

function mapBusinessDashboardOrder(row: Record<string, unknown>) {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    deliveryAddress: row.delivery_address,
    productDescription: row.product_description,
    productValue: Number(row.product_value),
    transportFee: Number(row.transport_fee),
    totalAmount: Number(row.total_amount),
    riderEarning: Number(row.rider_earning),
    platformCommission: Number(row.platform_commission),
    riderName: row.rider_name,
    offeredRiderCount: Number(row.offered_rider_count ?? 0),
    createdAt: row.created_at,
  };
}

async function getBusinessDashboardOrderById(
  orderId: string,
  businessId?: string,
) {
  const { rows } = await pool.query(
    `SELECT o.id,
            o.code,
            o.status,
            o.product_description,
            o.product_value,
            o.transport_fee,
            o.total_amount,
            o.rider_earning,
            o.platform_commission,
            o.created_at,
            c.name AS customer_name,
            c.phone AS customer_phone,
            a.address_text AS delivery_address,
            u.name AS rider_name,
            COUNT(oo.id) FILTER (WHERE oo.status = 'PENDING')::int AS offered_rider_count
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     JOIN addresses a ON a.id = o.delivery_address_id
     LEFT JOIN rider_profiles rp ON rp.id = o.assigned_rider_id
     LEFT JOIN users u ON u.id = rp.user_id
     LEFT JOIN order_offers oo ON oo.order_id = o.id
     WHERE o.id = $1
       AND ($2::uuid IS NULL OR o.business_id = $2)
     GROUP BY o.id, c.id, a.id, u.name
     LIMIT 1`,
    [orderId, businessId ?? null],
  );

  return rows[0] ? mapBusinessDashboardOrder(rows[0]) : null;
}

function mapAdminBusiness(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    legalName: row.legal_name,
    phone: row.phone,
    email: row.email,
    addressText: row.address_text,
    lat: numericOrUndefined(row.lat),
    lng: numericOrUndefined(row.lng),
    status: row.status,
    category: row.category,
    rating: Number(row.rating ?? 0),
    etaMinutes: Number(row.eta_minutes ?? 0),
    coverImageUrl: row.cover_image_url,
    description: row.description,
    orderCount: Number(row.order_count ?? 0),
    productCount: Number(row.product_count ?? 0),
  };
}

function mapAdminBusinessCategory(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    sortOrder: Number(row.sort_order ?? 0),
    businessCount: Number(row.business_count ?? 0),
  };
}

function mapAdminRider(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    vehicleType: row.vehicle_type,
    licenseNumber: row.license_number,
    isOnline: row.is_online,
    status: row.status,
    lastSeenAt: row.last_seen_at,
    lastLat: numericOrUndefined(row.last_lat),
    lastLng: numericOrUndefined(row.last_lng),
    deliveriesToday: Number(row.deliveries_today ?? 0),
  };
}

function mapAdminSession(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
  };
}

function mapBusinessSession(row: Record<string, unknown>) {
  return {
    id: row.business_id,
    userId: row.user_id,
    name: row.business_name,
    legalName: row.legal_name,
    phone: row.phone,
    email: row.email,
    status: row.status,
    userName: row.user_name,
  };
}

function mapAdminZone(row: Record<string, unknown>) {
  const geometry = row.geometry as { coordinates?: number[][][] } | null;
  const ring = geometry?.coordinates?.[0] ?? [];

  return {
    id: row.id,
    name: row.name,
    city: row.city,
    transportFee: Number(row.transport_fee),
    active: row.active,
    createdAt: row.created_at,
    points: ring.map(([lng, lat]) => ({ lat, lng })),
  };
}

async function offerBusinessOrderToNearestRiders(
  client: PoolClient,
  orderId: string,
) {
  const nearestRiders = await client.query(
    `WITH pickup AS (
       SELECT COALESCE(b.lat, 41.3275)::numeric AS lat,
              COALESCE(b.lng, 19.8187)::numeric AS lng
       FROM orders o
       JOIN businesses b ON b.id = o.business_id
       WHERE o.id = $1
     )
     SELECT rp.id,
            rp.user_id,
            u.name,
            latest.lat,
            latest.lng,
            CASE
              WHEN latest.point IS NULL THEN NULL
              ELSE ST_Distance(
                latest.point,
                ST_SetSRID(ST_MakePoint((SELECT lng FROM pickup), (SELECT lat FROM pickup)), 4326)::geography
              )
            END AS distance_meters
     FROM rider_profiles rp
     JOIN users u ON u.id = rp.user_id
     LEFT JOIN LATERAL (
       SELECT rl.point, rl.lat, rl.lng, rl.recorded_at
       FROM rider_locations rl
       WHERE rl.rider_id = rp.id
       ORDER BY rl.recorded_at DESC
       LIMIT 1
     ) latest ON true
     WHERE rp.is_online = true
       AND rp.status = 'ACTIVE'
       AND u.status = 'ACTIVE'
     ORDER BY distance_meters ASC NULLS LAST, rp.last_seen_at DESC NULLS LAST
     LIMIT $2`,
    [orderId, nearbyRiderOfferLimit],
  );

  if (nearestRiders.rows.length === 0) return [];

  await client.query(
    `UPDATE orders
     SET status = 'OFFERED',
         version = version + 1
     WHERE id = $1
       AND status = 'CREATED'
       AND assigned_rider_id IS NULL`,
    [orderId],
  );

  for (const rider of nearestRiders.rows) {
    await client.query(
      `INSERT INTO order_offers (order_id, rider_id, status, expires_at)
       VALUES ($1, $2, 'PENDING', now() + ($3::int * interval '1 minute'))
       ON CONFLICT (order_id, rider_id) DO UPDATE
       SET status = 'PENDING',
           sent_at = now(),
           responded_at = NULL,
           expires_at = EXCLUDED.expires_at
       WHERE order_offers.status IN ('PENDING', 'EXPIRED', 'CANCELLED')`,
      [orderId, rider.id, orderOfferTtlMinutes],
    );
    await client.query(
      `INSERT INTO notifications (user_id, order_id, type, channel, status, payload, sent_at)
       VALUES (
         $1,
         $2,
         'ORDER_OFFERED_NEARBY',
         'SOCKET',
         'SENT',
         jsonb_build_object(
           'riderId', $3::uuid,
           'distanceMeters', $4::numeric,
           'message', 'Ke nje porosi te re afer teje.'
         ),
         now()
       )`,
      [rider.user_id, orderId, rider.id, rider.distance_meters ?? null],
    );
  }

  return nearestRiders.rows.map((rider) => ({
    id: String(rider.id),
    name: String(rider.name),
    distanceMeters:
      rider.distance_meters === null || rider.distance_meters === undefined
        ? null
        : Number(rider.distance_meters),
  }));
}

async function refreshOffersForRider(client: PoolClient, riderId: string) {
  const rider = await client.query(
    "SELECT is_online FROM rider_profiles WHERE id = $1 AND status = 'ACTIVE'",
    [riderId],
  );
  if (!rider.rows[0]?.is_online) return;

  await client.query(
    "UPDATE order_offers SET status = 'EXPIRED' WHERE status = 'PENDING' AND expires_at <= now()",
  );

  const created = await client.query(
    `UPDATE orders
     SET status = 'OFFERED',
         version = version + 1
     WHERE status = 'CREATED'
       AND assigned_rider_id IS NULL
     RETURNING id`,
  );

  for (const order of created.rows) {
    await client.query(
      "INSERT INTO order_status_history (order_id, from_status, to_status, note) VALUES ($1, 'CREATED', 'OFFERED', 'Offered automatically to online riders')",
      [order.id],
    );
    await offerBusinessOrderToNearestRiders(client, order.id);
  }

  await client.query(
    "UPDATE notifications SET status = 'SENT', sent_at = COALESCE(sent_at, now()) WHERE user_id = (SELECT user_id FROM rider_profiles WHERE id = $1) AND status = 'PENDING'",
    [riderId],
  );
}

async function getRiderOrderById(orderId: string, riderId?: string) {
  const { rows } = await pool.query(
    `SELECT o.id,
            o.code,
            o.status,
            o.product_description,
            o.product_value,
            o.transport_fee,
            o.platform_commission,
            o.rider_earning,
            o.total_amount,
            o.created_at,
            o.accepted_at,
            o.picked_up_at,
            o.delivered_at,
            b.name AS business_name,
            b.phone AS business_phone,
            b.address_text AS pickup_address,
            b.lat AS pickup_lat,
            b.lng AS pickup_lng,
            c.name AS customer_name,
            c.phone AS customer_phone,
            a.address_text AS dropoff_address,
            a.lat AS dropoff_lat,
            a.lng AS dropoff_lng,
            oo.expires_at AS offer_expires_at
     FROM orders o
     JOIN businesses b ON b.id = o.business_id
     LEFT JOIN customers c ON c.id = o.customer_id
     JOIN addresses a ON a.id = o.delivery_address_id
     LEFT JOIN order_offers oo ON oo.order_id = o.id AND ($2::uuid IS NULL OR oo.rider_id = $2)
     WHERE o.id = $1
     LIMIT 1`,
    [orderId, riderId ?? null],
  );

  return rows[0] ? mapRiderOrder(rows[0]) : null;
}

async function buildRiderDashboard(riderId: string) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await refreshOffersForRider(client, riderId);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const rider = await pool.query(
    `SELECT rp.id,
            rp.user_id,
            u.name,
            u.phone,
            rp.vehicle_type,
            rp.license_number,
            rp.is_online,
            rp.status,
            rp.last_seen_at
     FROM rider_profiles rp
     JOIN users u ON u.id = rp.user_id
     WHERE rp.id = $1`,
    [riderId],
  );

  if (!rider.rows[0]) throw new Error("RIDER_NOT_FOUND");

  const orderSelect = `
    SELECT o.id,
           o.code,
           o.status,
           o.product_description,
           o.product_value,
           o.transport_fee,
           o.platform_commission,
           o.rider_earning,
           o.total_amount,
           o.created_at,
           o.accepted_at,
           o.picked_up_at,
           o.delivered_at,
           b.name AS business_name,
           b.phone AS business_phone,
           b.address_text AS pickup_address,
           b.lat AS pickup_lat,
           b.lng AS pickup_lng,
           c.name AS customer_name,
           c.phone AS customer_phone,
           a.address_text AS dropoff_address,
           a.lat AS dropoff_lat,
           a.lng AS dropoff_lng,
           oo.expires_at AS offer_expires_at
    FROM orders o
    JOIN businesses b ON b.id = o.business_id
    LEFT JOIN customers c ON c.id = o.customer_id
    JOIN addresses a ON a.id = o.delivery_address_id
    LEFT JOIN order_offers oo ON oo.order_id = o.id AND oo.rider_id = $1`;

  const activeOrder = await pool.query(
    `${orderSelect}
     WHERE o.assigned_rider_id = $1
       AND o.status IN ('ACCEPTED', 'PICKED_UP')
     ORDER BY o.accepted_at DESC
     LIMIT 1`,
    [riderId],
  );

  const pendingOffers = await pool.query(
    `${orderSelect}
     WHERE oo.rider_id = $1
       AND oo.status = 'PENDING'
       AND oo.expires_at > now()
       AND o.status = 'OFFERED'
       AND o.assigned_rider_id IS NULL
       AND EXISTS (
         SELECT 1
         FROM rider_profiles rp
         WHERE rp.id = $1
           AND rp.is_online = true
       )
     ORDER BY oo.sent_at DESC
     LIMIT 5`,
    [riderId],
  );

  const recentOrders = await pool.query(
    `${orderSelect}
     WHERE o.assigned_rider_id = $1
       AND o.status IN ('DELIVERED', 'CANCELLED')
     ORDER BY COALESCE(o.delivered_at, o.cancelled_at, o.created_at) DESC
     LIMIT 8`,
    [riderId],
  );

  const metrics = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE o.status = 'DELIVERED' AND o.delivered_at >= date_trunc('day', now()))::int AS today_deliveries,
       COUNT(*) FILTER (WHERE o.status = 'DELIVERED' AND o.delivered_at >= date_trunc('week', now()))::int AS week_deliveries,
       COALESCE(SUM(o.transport_fee) FILTER (WHERE o.status = 'DELIVERED' AND o.delivered_at >= date_trunc('day', now())), 0) AS today_transport,
       COALESCE(SUM(o.rider_earning) FILTER (WHERE o.status = 'DELIVERED' AND o.delivered_at >= date_trunc('day', now())), 0) AS today_earnings,
       COALESCE(SUM(o.rider_earning) FILTER (WHERE o.status = 'DELIVERED' AND o.delivered_at >= date_trunc('week', now())), 0) AS week_earnings,
       COALESCE(SUM(o.platform_commission) FILTER (WHERE o.status = 'DELIVERED' AND o.delivered_at >= date_trunc('week', now())), 0) AS platform_due
     FROM orders o
     WHERE o.assigned_rider_id = $1`,
    [riderId],
  );

  const metricRow = metrics.rows[0];

  return {
    rider: mapRiderProfile(rider.rows[0]),
    activeOrder: activeOrder.rows[0]
      ? mapRiderOrder(activeOrder.rows[0])
      : null,
    pendingOffers: pendingOffers.rows.map(mapRiderOrder),
    recentOrders: recentOrders.rows.map(mapRiderOrder),
    metrics: {
      todayDeliveries: Number(metricRow.today_deliveries),
      weekDeliveries: Number(metricRow.week_deliveries),
      todayTransport: Number(metricRow.today_transport),
      todayEarnings: Number(metricRow.today_earnings),
      weekEarnings: Number(metricRow.week_earnings),
      platformDue: Number(metricRow.platform_due),
    },
  };
}

function addressFromOsm(place: NominatimPlace): AddressSuggestion | null {
  const lat = Number(place.lat);
  const lng = Number(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const address = place.address ?? {};
  const label =
    address.road ??
    address.pedestrian ??
    place.display_name?.split(",")[0] ??
    "Adrese ne Shqiperi";
  const city =
    address.city ??
    address.town ??
    address.village ??
    address.county ??
    "Shqiperi";
  const area = address.neighbourhood ?? address.suburb ?? city;

  return {
    id: `osm-${place.osm_id ?? `${lat}-${lng}`}`,
    label,
    area,
    city,
    details: place.display_name ?? `${label}, ${city}`,
    lat,
    lng,
  };
}

async function searchCachedAddresses(query: string, limit = 8) {
  const { rows } = await pool.query(
    `SELECT id, label, area, city, details, lat, lng
     FROM address_suggestions
     WHERE $1 = ''
        OR to_tsvector('simple', label || ' ' || COALESCE(area, '') || ' ' || COALESCE(city, '')) @@ plainto_tsquery('simple', $1)
        OR label ILIKE '%' || $1 || '%'
        OR area ILIKE '%' || $1 || '%'
        OR city ILIKE '%' || $1 || '%'
     ORDER BY city NULLS LAST, label
     LIMIT $2`,
    [query, limit],
  );
  return rows.map(mapAddressRow);
}

async function cacheAddressSuggestion(suggestion: AddressSuggestion) {
  await pool.query(
    `INSERT INTO address_suggestions (osm_id, label, area, city, details, lat, lng)
     VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), $6, $7)
     ON CONFLICT (osm_id) DO UPDATE SET
       label = EXCLUDED.label,
       area = EXCLUDED.area,
       city = EXCLUDED.city,
       details = EXCLUDED.details,
       lat = EXCLUDED.lat,
       lng = EXCLUDED.lng,
       updated_at = now()`,
    [
      suggestion.id,
      suggestion.label,
      suggestion.area,
      suggestion.city,
      suggestion.details,
      suggestion.lat,
      suggestion.lng,
    ],
  );
}

app.post("/admin/auth/login", async (req, res, next) => {
  try {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(6),
      })
      .parse(req.body);
    const { rows } = await pool.query(
      `SELECT id, name, email, phone, password_hash, role
       FROM users
       WHERE email = $1
         AND role IN ('ADMIN', 'OPERATOR')
         AND status = 'ACTIVE'`,
      [body.email],
    );

    if (!rows[0] || !verifyPassword(body.password, rows[0].password_hash)) {
      res.status(401).json({ error: "INVALID_ADMIN_LOGIN" });
      return;
    }

    res.json({ admin: mapAdminSession(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.get("/admin/businesses", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.id,
              b.name,
              b.legal_name,
              b.phone,
              b.email,
              b.address_text,
              b.lat,
              b.lng,
              b.status,
              b.category,
              b.rating,
              b.eta_minutes,
              b.cover_image_url,
              b.description,
              COUNT(DISTINCT o.id)::int AS order_count,
              COUNT(DISTINCT p.id)::int AS product_count
       FROM businesses b
       LEFT JOIN orders o ON o.business_id = b.id
       LEFT JOIN products p ON p.business_id = b.id AND p.is_available = true
       WHERE b.id <> ALL($1::uuid[])
       GROUP BY b.id
       ORDER BY b.created_at DESC`,
      [sampleBusinessIds],
    );

    res.json({ businesses: rows.map(mapAdminBusiness) });
  } catch (error) {
    next(error);
  }
});

app.get("/admin/business-categories", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT bc.id,
              bc.name,
              bc.active,
              bc.sort_order,
              COUNT(b.id)::int AS business_count
       FROM business_categories bc
       LEFT JOIN businesses b ON b.category = bc.name AND b.id <> ALL($1::uuid[])
       GROUP BY bc.id
       ORDER BY bc.sort_order, bc.name`,
      [sampleBusinessIds],
    );

    res.json({ categories: rows.map(mapAdminBusinessCategory) });
  } catch (error) {
    next(error);
  }
});

app.post("/admin/business-categories", async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(2),
        active: z.boolean().optional(),
        sortOrder: z.coerce.number().int().optional(),
      })
      .parse(req.body);

    const { rows } = await pool.query(
      `INSERT INTO business_categories (name, active, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE
       SET active = EXCLUDED.active,
           sort_order = EXCLUDED.sort_order,
           updated_at = now()
       RETURNING id,
                 name,
                 active,
                 sort_order,
                 (SELECT COUNT(*)::int FROM businesses b WHERE b.category = business_categories.name) AS business_count`,
      [body.name.trim(), body.active ?? true, body.sortOrder ?? 50],
    );

    io.to("admin").emit("business_category.created", {
      categoryId: rows[0].id,
    });
    res.status(201).json({ category: mapAdminBusinessCategory(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.post("/admin/businesses", async (req, res, next) => {
  const client = await pool.connect();

  try {
    const body = z
      .object({
        name: z.string().min(2),
        legalName: z.string().optional().or(z.literal("")),
        phone: z.string().min(6),
        email: z.string().email().optional().or(z.literal("")),
        password: z.string().min(6),
        addressText: z.string().min(4),
        lat: z.number().optional().nullable(),
        lng: z.number().optional().nullable(),
        category: z.string().min(2).optional().or(z.literal("")),
        status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
        etaMinutes: z.coerce.number().int().min(1).max(120).optional(),
        coverImageUrl: z.string().optional().or(z.literal("")),
        description: z.string().optional().or(z.literal("")),
      })
      .parse(req.body);

    await client.query("BEGIN");

    const categoryName = body.category?.trim() || "Te tjera";
    await client.query(
      `INSERT INTO business_categories (name, active, sort_order)
       VALUES ($1, true, 50)
       ON CONFLICT (name) DO UPDATE
       SET active = true,
           updated_at = now()`,
      [categoryName],
    );

    const businessResult = await client.query(
      `INSERT INTO businesses (
         name,
         legal_name,
         phone,
         email,
         address_text,
         lat,
         lng,
         status,
         category,
         eta_minutes,
         cover_image_url,
         accepts_customer_orders,
         description
       )
       VALUES ($1, NULLIF($2, ''), $3, NULLIF($4, ''), $5, $6, $7, $8, $9, $10, NULLIF($11, ''), true, NULLIF($12, ''))
       RETURNING id`,
      [
        body.name.trim(),
        body.legalName ?? "",
        body.phone.trim(),
        body.email ?? "",
        body.addressText.trim(),
        body.lat ?? null,
        body.lng ?? null,
        body.status ?? "ACTIVE",
        categoryName,
        body.etaMinutes ?? 25,
        body.coverImageUrl ?? "",
        body.description ?? "",
      ],
    );

    const userResult = await client.query(
      `INSERT INTO users (name, email, phone, password_hash, role, status)
       VALUES ($1, NULLIF($2, ''), $3, $4, 'BUSINESS', 'ACTIVE')
       RETURNING id`,
      [
        body.name.trim(),
        body.email ?? "",
        body.phone.trim(),
        hashPassword(body.password),
      ],
    );

    await client.query(
      `INSERT INTO business_users (business_id, user_id, position, is_primary)
       VALUES ($1, $2, 'Owner', true)`,
      [businessResult.rows[0].id, userResult.rows[0].id],
    );

    const created = await client.query(
      `SELECT b.id,
              b.name,
              b.legal_name,
              b.phone,
              b.email,
              b.address_text,
              b.lat,
              b.lng,
              b.status,
              b.category,
              b.rating,
              b.eta_minutes,
              b.cover_image_url,
              b.description,
              0::int AS order_count,
              0::int AS product_count
       FROM businesses b
       WHERE b.id = $1`,
      [businessResult.rows[0].id],
    );

    await client.query("COMMIT");
    io.to("admin").emit("business.created", {
      businessId: businessResult.rows[0].id,
    });
    res.status(201).json({ business: mapAdminBusiness(created.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.get("/admin/riders", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT rp.id,
              rp.user_id,
              u.name,
              u.phone,
              u.email,
              rp.vehicle_type,
              rp.license_number,
              rp.is_online,
              rp.status,
              rp.last_seen_at,
              latest.lat AS last_lat,
              latest.lng AS last_lng,
              COUNT(o.id) FILTER (WHERE o.status = 'DELIVERED' AND o.delivered_at >= date_trunc('day', now()))::int AS deliveries_today
       FROM rider_profiles rp
       JOIN users u ON u.id = rp.user_id
       LEFT JOIN LATERAL (
         SELECT rl.lat, rl.lng
         FROM rider_locations rl
         WHERE rl.rider_id = rp.id
         ORDER BY rl.recorded_at DESC
         LIMIT 1
       ) latest ON true
       LEFT JOIN orders o ON o.assigned_rider_id = rp.id
       GROUP BY rp.id, u.id, latest.lat, latest.lng
       ORDER BY rp.created_at DESC`,
    );

    res.json({ riders: rows.map(mapAdminRider) });
  } catch (error) {
    next(error);
  }
});

app.post("/admin/riders", async (req, res, next) => {
  const client = await pool.connect();

  try {
    const body = z
      .object({
        name: z.string().min(2),
        phone: z.string().min(6),
        email: z.string().email().optional().or(z.literal("")),
        password: z.string().min(6),
        vehicleType: z.string().min(2).optional().or(z.literal("")),
        licenseNumber: z.string().optional().or(z.literal("")),
        status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
      })
      .parse(req.body);

    await client.query("BEGIN");

    const userResult = await client.query(
      `INSERT INTO users (name, email, phone, password_hash, role, status)
       VALUES ($1, NULLIF($2, ''), $3, $4, 'RIDER', 'ACTIVE')
       RETURNING id`,
      [
        body.name.trim(),
        body.email ?? "",
        body.phone.trim(),
        hashPassword(body.password),
      ],
    );

    const riderResult = await client.query(
      `INSERT INTO rider_profiles (user_id, vehicle_type, license_number, is_online, status)
       VALUES ($1, $2, NULLIF($3, ''), false, $4)
       RETURNING id`,
      [
        userResult.rows[0].id,
        body.vehicleType?.trim() || "MOTORBIKE",
        body.licenseNumber ?? "",
        body.status ?? "ACTIVE",
      ],
    );

    const created = await client.query(
      `SELECT rp.id,
              rp.user_id,
              u.name,
              u.phone,
              u.email,
              rp.vehicle_type,
              rp.license_number,
              rp.is_online,
              rp.status,
              rp.last_seen_at,
              NULL::numeric AS last_lat,
              NULL::numeric AS last_lng,
              0::int AS deliveries_today
       FROM rider_profiles rp
       JOIN users u ON u.id = rp.user_id
       WHERE rp.id = $1`,
      [riderResult.rows[0].id],
    );

    await client.query("COMMIT");
    io.to("admin").emit("rider.created", { riderId: riderResult.rows[0].id });
    res.status(201).json({ rider: mapAdminRider(created.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.get("/admin/zones", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id,
              name,
              city,
              transport_fee,
              active,
              created_at,
              ST_AsGeoJSON(polygon)::json AS geometry
       FROM zones
       ORDER BY created_at DESC`,
    );

    res.json({ zones: rows.map(mapAdminZone) });
  } catch (error) {
    next(error);
  }
});

app.post("/admin/zones", async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(2),
        city: z.string().min(2).optional().or(z.literal("")),
        transportFee: z.coerce.number().min(0),
        points: z.array(z.object({ lat: z.number(), lng: z.number() })).min(3),
      })
      .parse(req.body);

    const closedPoints = [...body.points];
    const first = closedPoints[0];
    const last = closedPoints[closedPoints.length - 1];
    if (first.lat !== last.lat || first.lng !== last.lng)
      closedPoints.push(first);

    const wkt = `POLYGON((${closedPoints.map((point) => `${point.lng} ${point.lat}`).join(", ")}))`;
    const { rows } = await pool.query(
      `INSERT INTO zones (name, city, transport_fee, polygon, active)
       VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromText($4), 4326), true)
       RETURNING id,
                 name,
                 city,
                 transport_fee,
                 active,
                 created_at,
                 ST_AsGeoJSON(polygon)::json AS geometry`,
      [body.name.trim(), body.city?.trim() || "Tirana", body.transportFee, wkt],
    );

    io.to("admin").emit("zone.created", { zoneId: rows[0].id });
    res.status(201).json({ zone: mapAdminZone(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.get("/admin/live-map", async (_req, res, next) => {
  try {
    const riders = await pool.query(
      `SELECT rp.id,
              rp.user_id,
              u.name,
              u.phone,
              u.email,
              rp.vehicle_type,
              rp.license_number,
              rp.is_online,
              rp.status,
              rp.last_seen_at,
              COALESCE(latest.lat, 41.3275) AS last_lat,
              COALESCE(latest.lng, 19.8187) AS last_lng,
              COUNT(o.id) FILTER (WHERE o.status = 'DELIVERED' AND o.delivered_at >= date_trunc('day', now()))::int AS deliveries_today
       FROM rider_profiles rp
       JOIN users u ON u.id = rp.user_id
       LEFT JOIN LATERAL (
         SELECT rl.lat, rl.lng
         FROM rider_locations rl
         WHERE rl.rider_id = rp.id
         ORDER BY rl.recorded_at DESC
         LIMIT 1
       ) latest ON true
       LEFT JOIN orders o ON o.assigned_rider_id = rp.id
       WHERE rp.status = 'ACTIVE'
       GROUP BY rp.id, u.id, latest.lat, latest.lng
       ORDER BY rp.is_online DESC, rp.last_seen_at DESC NULLS LAST
       LIMIT 40`,
    );

    const orders = await pool.query(
      `SELECT o.id,
              o.code,
              o.status,
              o.total_amount,
              b.name AS business_name,
              b.address_text AS pickup_address,
              b.lat AS pickup_lat,
              b.lng AS pickup_lng,
              a.address_text AS dropoff_address,
              a.lat AS dropoff_lat,
              a.lng AS dropoff_lng
       FROM orders o
       JOIN businesses b ON b.id = o.business_id
       JOIN addresses a ON a.id = o.delivery_address_id
       WHERE o.status IN ('CREATED', 'OFFERED', 'ACCEPTED', 'PICKED_UP')
        AND o.business_id <> ALL($1::uuid[])
       ORDER BY o.created_at DESC
       LIMIT 40`,
      [sampleBusinessIds],
    );

    res.json({
      riders: riders.rows.map(mapAdminRider),
      orders: orders.rows.map((row) => ({
        id: row.id,
        code: row.code,
        status: row.status,
        totalAmount: Number(row.total_amount),
        businessName: row.business_name,
        pickupAddress: row.pickup_address,
        pickupLat: Number(row.pickup_lat ?? 41.3275),
        pickupLng: Number(row.pickup_lng ?? 19.8187),
        dropoffAddress: row.dropoff_address,
        dropoffLat: Number(row.dropoff_lat),
        dropoffLng: Number(row.dropoff_lng),
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/admin/finance", async (_req, res, next) => {
  try {
    const metrics = await pool.query(
      `SELECT COALESCE(SUM(transport_fee), 0)::numeric AS total_transport_fee,
              COALESCE(SUM(rider_earning), 0)::numeric AS rider_earnings,
              COALESCE(SUM(platform_commission), 0)::numeric AS platform_commission,
              COUNT(*)::int AS delivered_orders
         FROM orders
       WHERE status = 'DELIVERED'
         AND business_id <> ALL($1::uuid[])`,
      [sampleBusinessIds],
    );

    const settlements = await pool.query(
      `SELECT rp.id AS rider_id,
              u.name AS rider_name,
              COALESCE(SUM(le.amount), 0)::numeric AS platform_due
       FROM ledger_entries le
       JOIN rider_profiles rp ON rp.id = le.rider_id
       JOIN users u ON u.id = rp.user_id
       WHERE le.direction = 'RIDER_OWES_PLATFORM'
         AND le.status = 'OPEN'
         AND le.business_id <> ALL($1::uuid[])
       GROUP BY rp.id, u.name
       HAVING COALESCE(SUM(le.amount), 0) > 0
       ORDER BY platform_due DESC`,
      [sampleBusinessIds],
    );

    res.json({
      metrics: {
        totalTransportFee: Number(metrics.rows[0]?.total_transport_fee ?? 0),
        riderEarnings: Number(metrics.rows[0]?.rider_earnings ?? 0),
        platformCommission: Number(metrics.rows[0]?.platform_commission ?? 0),
        deliveredOrders: Number(metrics.rows[0]?.delivered_orders ?? 0),
      },
      settlements: settlements.rows.map((row) => ({
        riderId: row.rider_id,
        riderName: row.rider_name,
        platformDue: Number(row.platform_due),
        status: "OPEN",
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/public/addresses/search", async (req, res, next) => {
  try {
    const query = (z.string().optional().parse(req.query.q) ?? "").trim();
    const cached = await searchCachedAddresses(query, query.length < 2 ? 8 : 5);

    if (query.length < 2) {
      res.json({ suggestions: cached });
      return;
    }

    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("countrycodes", "al");
      url.searchParams.set("limit", "8");
      url.searchParams.set("q", query);

      const response = await fetch(url, {
        headers: {
          "User-Agent": "HappyTiranaCourierLocal/0.1 (local-dev)",
        },
      });
      const places = (await response.json()) as NominatimPlace[];
      const remote = places
        .map(addressFromOsm)
        .filter((item): item is AddressSuggestion => item !== null);
      await Promise.all(remote.map(cacheAddressSuggestion));

      const merged = [...remote, ...cached].filter((suggestion, index, all) => {
        return (
          all.findIndex(
            (item) =>
              item.label === suggestion.label && item.city === suggestion.city,
          ) === index
        );
      });
      res.json({ suggestions: merged.slice(0, 8) });
    } catch {
      res.json({ suggestions: cached });
    }
  } catch (error) {
    next(error);
  }
});

app.get("/public/addresses/reverse", async (req, res, next) => {
  try {
    const params = z
      .object({
        lat: z.coerce.number(),
        lng: z.coerce.number(),
      })
      .parse(req.query);

    try {
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("lat", String(params.lat));
      url.searchParams.set("lon", String(params.lng));

      const response = await fetch(url, {
        headers: {
          "User-Agent": "HappyTiranaCourierLocal/0.1 (local-dev)",
        },
      });
      const suggestion = addressFromOsm(
        (await response.json()) as NominatimPlace,
      );
      if (suggestion) {
        await cacheAddressSuggestion(suggestion);
        res.json({ address: suggestion });
        return;
      }
    } catch {
      // Fall through to nearest cached address.
    }

    const { rows } = await pool.query(
      `SELECT id, label, area, city, details, lat, lng
       FROM address_suggestions
       ORDER BY ST_Distance(
         ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
         ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
       )
       LIMIT 1`,
      [params.lat, params.lng],
    );
    res.json({ address: rows[0] ? mapAddressRow(rows[0]) : null });
  } catch (error) {
    next(error);
  }
});

app.get("/public/routes", async (req, res, next) => {
  try {
    const params = z
      .object({
        fromLat: z.coerce.number(),
        fromLng: z.coerce.number(),
        toLat: z.coerce.number(),
        toLng: z.coerce.number(),
      })
      .parse(req.query);

    try {
      const url = new URL(
        `https://router.project-osrm.org/route/v1/driving/${params.fromLng},${params.fromLat};${params.toLng},${params.toLat}`,
      );
      url.searchParams.set("overview", "full");
      url.searchParams.set("geometries", "geojson");
      url.searchParams.set("steps", "true");

      const response = await fetch(url);
      const data = (await response.json()) as {
        routes?: Array<{
          duration: number;
          distance: number;
          geometry: { coordinates: Array<[number, number]> };
        }>;
      };
      const route = data.routes?.[0];

      if (route) {
        res.json({
          durationSeconds: route.duration,
          distanceMeters: route.distance,
          coordinates: route.geometry.coordinates.map(([lng, lat]) => ({
            lat,
            lng,
          })),
        });
        return;
      }
    } catch {
      // A local straight fallback keeps the UI usable if OSRM is offline.
    }

    res.json({
      durationSeconds: 900,
      distanceMeters: 0,
      coordinates: [
        { lat: params.fromLat, lng: params.fromLng },
        { lat: params.toLat, lng: params.toLng },
      ],
    });
  } catch (error) {
    next(error);
  }
});

app.post("/businesses/auth/login", async (req, res, next) => {
  try {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(6),
      })
      .parse(req.body);
    const { rows } = await pool.query(
      `SELECT b.id AS business_id,
              b.name AS business_name,
              b.legal_name,
              b.phone,
              b.email,
              b.status,
              u.id AS user_id,
              u.name AS user_name,
              u.password_hash
       FROM users u
       JOIN business_users bu ON bu.user_id = u.id
       JOIN businesses b ON b.id = bu.business_id
       WHERE u.role = 'BUSINESS'
         AND u.status = 'ACTIVE'
         AND b.status = 'ACTIVE'
         AND b.id <> ALL($2::uuid[])
         AND (u.email = $1 OR b.email = $1)
       ORDER BY bu.is_primary DESC
       LIMIT 1`,
      [body.email, sampleBusinessIds],
    );

    if (!rows[0] || !verifyPassword(body.password, rows[0].password_hash)) {
      res.status(401).json({ error: "INVALID_BUSINESS_LOGIN" });
      return;
    }

    res.json({ business: mapBusinessSession(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.post("/riders/auth/login", async (req, res, next) => {
  try {
    const body = z
      .object({ email: z.string().email(), password: z.string().min(4) })
      .parse(req.body);
    const { rows } = await pool.query(
      `SELECT rp.id,
              rp.user_id,
              u.name,
              u.phone,
              u.password_hash,
              rp.vehicle_type,
              rp.license_number,
              rp.is_online,
              rp.status,
              rp.last_seen_at
       FROM users u
       JOIN rider_profiles rp ON rp.user_id = u.id
       WHERE u.email = $1
         AND u.role = 'RIDER'
         AND u.status = 'ACTIVE'`,
      [body.email],
    );

    if (!rows[0] || !verifyPassword(body.password, rows[0].password_hash)) {
      res.status(401).json({ error: "INVALID_RIDER_LOGIN" });
      return;
    }

    res.json({ rider: mapRiderProfile(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.get("/riders/:id/dashboard", async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    res.json(await buildRiderDashboard(params.id));
  } catch (error) {
    next(error);
  }
});

app.post("/riders/:id/availability", async (req, res, next) => {
  const client = await pool.connect();

  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        isOnline: z.boolean(),
        lat: z.coerce.number().optional(),
        lng: z.coerce.number().optional(),
      })
      .parse(req.body);

    await client.query("BEGIN");
    const rider = await client.query(
      `UPDATE rider_profiles
       SET is_online = $2,
           last_seen_at = now(),
           updated_at = now()
       WHERE id = $1
         AND status = 'ACTIVE'
       RETURNING id`,
      [params.id, body.isOnline],
    );

    if (!rider.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "RIDER_NOT_FOUND" });
      return;
    }

    if (body.isOnline) {
      if (body.lat !== undefined && body.lng !== undefined) {
        await client.query(
          `INSERT INTO rider_locations (rider_id, point, lat, lng)
           VALUES ($1, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography, $2, $3)`,
          [params.id, body.lat, body.lng],
        );
        io.to("admin").emit("rider.location_updated", {
          riderId: params.id,
          orderId: null,
          lat: body.lat,
          lng: body.lng,
        });
      }

      await refreshOffersForRider(client, params.id);
    }

    await client.query("COMMIT");
    res.json(await buildRiderDashboard(params.id));
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/public/auth/signup", async (req, res, next) => {
  const client = await pool.connect();

  try {
    const guestToken = guestTokenFromHeader(req);
    const body = z
      .object({
        name: z.string().min(2),
        phone: z.string().min(6),
        email: z.string().email().optional().or(z.literal("")),
        password: z.string().min(4),
        defaultAddress: z.string().min(5),
        defaultLat: z.coerce.number().optional(),
        defaultLng: z.coerce.number().optional(),
      })
      .parse(req.body);

    await client.query("BEGIN");
    const customer = await client.query(
      "INSERT INTO customers (name, phone) VALUES ($1, $2) RETURNING id",
      [body.name, body.phone],
    );
    const account = await client.query(
      `INSERT INTO customer_accounts (customer_id, name, phone, email, password_hash, default_address, default_lat, default_lng)
       VALUES ($1, $2, $3, NULLIF($4, ''), $5, $6, $7, $8)
       RETURNING id, name, phone, email, default_address, default_lat, default_lng`,
      [
        customer.rows[0].id,
        body.name,
        body.phone,
        body.email ?? "",
        hashPassword(body.password),
        body.defaultAddress,
        body.defaultLat ?? null,
        body.defaultLng ?? null,
      ],
    );
    await client.query(
      "INSERT INTO customer_carts (customer_account_id) VALUES ($1)",
      [account.rows[0].id],
    );
    await mergeGuestCartIntoCustomerCart(
      client,
      guestToken,
      account.rows[0].id,
    );
    await client.query("COMMIT");

    res.status(201).json({ customer: mapCustomer(account.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/public/auth/login", async (req, res, next) => {
  const client = await pool.connect();

  try {
    const guestToken = guestTokenFromHeader(req);
    const body = z
      .object({ phone: z.string().min(6), password: z.string().min(4) })
      .parse(req.body);
    const { rows } = await client.query(
      `SELECT id, name, phone, email, password_hash, default_address, default_lat, default_lng
       FROM customer_accounts
       WHERE phone = $1`,
      [body.phone],
    );

    if (!rows[0] || !verifyPassword(body.password, rows[0].password_hash)) {
      res.status(401).json({ error: "INVALID_CUSTOMER_LOGIN" });
      return;
    }

    await client.query("BEGIN");
    await mergeGuestCartIntoCustomerCart(client, guestToken, rows[0].id);
    await client.query("COMMIT");

    res.json({ customer: mapCustomer(rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.get("/public/me", async (req, res, next) => {
  try {
    const customerId = customerIdFromHeader(req);
    if (!customerId) {
      res.status(401).json({ error: "CUSTOMER_REQUIRED" });
      return;
    }

    const { rows } = await pool.query(
      `SELECT id, name, phone, email, default_address, default_lat, default_lng
       FROM customer_accounts
       WHERE id = $1`,
      [customerId],
    );

    if (!rows[0]) {
      res.status(404).json({ error: "CUSTOMER_NOT_FOUND" });
      return;
    }

    res.json({ customer: mapCustomer(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.patch("/public/me", async (req, res, next) => {
  try {
    const customerId = customerIdFromHeader(req);
    if (!customerId) {
      res.status(401).json({ error: "CUSTOMER_REQUIRED" });
      return;
    }

    const body = z
      .object({
        name: z.string().min(2),
        phone: z.string().min(6),
        email: z.string().email().optional().or(z.literal("")),
        defaultAddress: z.string().min(5),
        defaultLat: z.coerce.number().optional(),
        defaultLng: z.coerce.number().optional(),
      })
      .parse(req.body);

    const { rows } = await pool.query(
      `UPDATE customer_accounts
       SET name = $2,
           phone = $3,
           email = NULLIF($4, ''),
           default_address = $5,
           default_lat = $6,
           default_lng = $7,
           updated_at = now()
       WHERE id = $1
       RETURNING id, name, phone, email, default_address, default_lat, default_lng`,
      [
        customerId,
        body.name,
        body.phone,
        body.email ?? "",
        body.defaultAddress,
        body.defaultLat ?? null,
        body.defaultLng ?? null,
      ],
    );

    res.json({ customer: mapCustomer(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.get("/public/businesses", async (req, res, next) => {
  try {
    const query = z
      .object({
        lat: z.coerce.number().optional(),
        lng: z.coerce.number().optional(),
      })
      .parse(req.query);

    const { rows } = await pool.query(
      `SELECT
        b.id,
        b.name,
        b.category,
        b.address_text,
        b.lat,
        b.lng,
        b.rating,
        CASE
          WHEN $1::numeric IS NOT NULL
            AND $2::numeric IS NOT NULL
            AND b.lat IS NOT NULL
            AND b.lng IS NOT NULL
          THEN CEIL(
            GREATEST(
              10,
              (
                ST_Distance(
                  ST_SetSRID(ST_MakePoint(b.lng, b.lat), 4326)::geography,
                  ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
                ) / 1000.0 / 22.0 * 60.0
              ) + 8
            )
          )::int
          ELSE COALESCE(b.eta_minutes, 25)
        END AS eta_minutes,
        b.cover_image_url,
        b.description,
        (SELECT MIN(transport_fee) FROM zones WHERE active = true) AS delivery_fee,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', p.id,
              'businessId', p.business_id,
              'categoryId', p.category_id,
              'section', pc.name,
              'name', p.name,
              'description', p.description,
              'price', p.price,
              'imageUrl', p.image_url,
              'isAvailable', p.is_available
            )
            ORDER BY p.sort_order, p.name
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'::jsonb
        ) AS products
      FROM businesses b
      LEFT JOIN products p ON p.business_id = b.id AND p.is_available = true
      LEFT JOIN product_categories pc ON pc.id = p.category_id
      WHERE b.status = 'ACTIVE'
        AND b.accepts_customer_orders = true
        AND b.id <> ALL($3::uuid[])
      GROUP BY b.id
      ORDER BY b.name`,
      [query.lat ?? null, query.lng ?? null, sampleBusinessIds],
    );

    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get("/public/businesses/:id", async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const query = z
      .object({
        lat: z.coerce.number().optional(),
        lng: z.coerce.number().optional(),
      })
      .parse(req.query);
    const { rows } = await pool.query(
      `SELECT
        b.id,
        b.name,
        b.category,
        b.address_text,
        b.lat,
        b.lng,
        b.rating,
        CASE
          WHEN $2::numeric IS NOT NULL
            AND $3::numeric IS NOT NULL
            AND b.lat IS NOT NULL
            AND b.lng IS NOT NULL
          THEN CEIL(
            GREATEST(
              10,
              (
                ST_Distance(
                  ST_SetSRID(ST_MakePoint(b.lng, b.lat), 4326)::geography,
                  ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography
                ) / 1000.0 / 22.0 * 60.0
              ) + 8
            )
          )::int
          ELSE COALESCE(b.eta_minutes, 25)
        END AS eta_minutes,
        b.cover_image_url,
        b.description,
        (SELECT MIN(transport_fee) FROM zones WHERE active = true) AS delivery_fee,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', p.id,
              'businessId', p.business_id,
              'categoryId', p.category_id,
              'section', pc.name,
              'name', p.name,
              'description', p.description,
              'price', p.price,
              'imageUrl', p.image_url,
              'isAvailable', p.is_available
            )
            ORDER BY pc.sort_order, p.sort_order, p.name
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'::jsonb
        ) AS products
      FROM businesses b
      LEFT JOIN products p ON p.business_id = b.id AND p.is_available = true
      LEFT JOIN product_categories pc ON pc.id = p.category_id
      WHERE b.id = $1
        AND b.status = 'ACTIVE'
        AND b.accepts_customer_orders = true
        AND b.id <> ALL($4::uuid[])
      GROUP BY b.id`,
      [params.id, query.lat ?? null, query.lng ?? null, sampleBusinessIds],
    );

    if (!rows[0]) {
      res.status(404).json({ error: "BUSINESS_NOT_FOUND" });
      return;
    }

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get("/businesses/:id/dashboard", async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);

    const business = await pool.query(
      `SELECT id,
              name,
              legal_name,
              phone,
              email,
              address_text,
              lat,
              lng,
              status,
              category,
              rating,
              eta_minutes,
              cover_image_url,
              description
       FROM businesses
       WHERE id = $1`,
      [params.id],
    );

    if (!business.rows[0]) {
      res.status(404).json({ error: "BUSINESS_NOT_FOUND" });
      return;
    }

    const products = await pool.query(
      `SELECT p.id,
              p.name,
              p.description,
              p.price,
              p.image_url,
              p.is_available,
              p.created_at,
              pc.name AS section
       FROM products p
       LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.active = true
       WHERE p.business_id = $1
         AND p.is_available = true
       ORDER BY pc.sort_order NULLS LAST, p.sort_order, p.created_at DESC`,
      [params.id],
    );

    const categories = await pool.query(
      `SELECT pc.id,
              pc.name,
              pc.sort_order,
              pc.active,
              COUNT(p.id)::int AS product_count
       FROM product_categories pc
       LEFT JOIN products p ON p.category_id = pc.id AND p.is_available = true
       WHERE pc.business_id = $1
         AND pc.active = true
       GROUP BY pc.id
       ORDER BY pc.sort_order, pc.name`,
      [params.id],
    );

    const orders = await pool.query(
      `SELECT o.id,
              o.code,
              o.status,
              o.product_description,
              o.product_value,
              o.transport_fee,
              o.total_amount,
              o.rider_earning,
              o.platform_commission,
              o.created_at,
              c.name AS customer_name,
              c.phone AS customer_phone,
              a.address_text AS delivery_address,
              u.name AS rider_name,
              COUNT(oo.id) FILTER (WHERE oo.status = 'PENDING')::int AS offered_rider_count
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       JOIN addresses a ON a.id = o.delivery_address_id
       LEFT JOIN rider_profiles rp ON rp.id = o.assigned_rider_id
       LEFT JOIN users u ON u.id = rp.user_id
       LEFT JOIN order_offers oo ON oo.order_id = o.id
       WHERE o.business_id = $1
       GROUP BY o.id, c.id, a.id, u.name
       ORDER BY o.created_at DESC
       LIMIT 24`,
      [params.id],
    );

    const metrics = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('CREATED', 'OFFERED'))::int AS pending_orders,
         COUNT(*) FILTER (WHERE status IN ('ACCEPTED', 'PICKED_UP'))::int AS active_orders,
         COUNT(*) FILTER (WHERE status = 'DELIVERED' AND delivered_at >= date_trunc('day', now()))::int AS delivered_today,
         COALESCE(SUM(product_value) FILTER (WHERE status = 'DELIVERED' AND delivered_at >= date_trunc('day', now())), 0) AS product_revenue_today,
         COALESCE(SUM(total_amount) FILTER (WHERE status = 'DELIVERED' AND delivered_at >= date_trunc('day', now())), 0) AS total_collected_today
       FROM orders
       WHERE business_id = $1`,
      [params.id],
    );

    const metricRow = metrics.rows[0];

    res.json({
      business: {
        id: business.rows[0].id,
        name: business.rows[0].name,
        legalName: business.rows[0].legal_name,
        phone: business.rows[0].phone,
        email: business.rows[0].email,
        addressText: business.rows[0].address_text,
        lat: Number(business.rows[0].lat),
        lng: Number(business.rows[0].lng),
        status: business.rows[0].status,
        category: business.rows[0].category,
        rating: Number(business.rows[0].rating),
        etaMinutes: Number(business.rows[0].eta_minutes),
        coverImageUrl: business.rows[0].cover_image_url,
        description: business.rows[0].description,
      },
      categories: categories.rows.map(mapBusinessCategory),
      products: products.rows.map(mapBusinessProduct),
      orders: orders.rows.map(mapBusinessDashboardOrder),
      metrics: {
        pendingOrders: Number(metricRow.pending_orders),
        activeOrders: Number(metricRow.active_orders),
        deliveredToday: Number(metricRow.delivered_today),
        productRevenueToday: Number(metricRow.product_revenue_today),
        totalCollectedToday: Number(metricRow.total_collected_today),
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/businesses/:id/orders", async (req, res, next) => {
  const client = await pool.connect();

  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        customerName: z.string().min(2),
        customerPhone: z.string().min(6),
        addressText: z.string().min(5),
        lat: z.coerce.number(),
        lng: z.coerce.number(),
        productDescription: z.string().min(2).optional(),
        productValue: z.coerce.number().min(0).optional(),
        items: z
          .array(
            z.object({
              productId: z.string().uuid(),
              quantity: z.number().int().positive(),
            }),
          )
          .optional(),
      })
      .refine(
        (value) =>
          Boolean(value.items?.length) ||
          (Boolean(value.productDescription) && value.productValue !== undefined),
        {
          message: "ORDER_PRODUCTS_REQUIRED",
        },
      )
      .parse(req.body);

    await client.query("BEGIN");

    const business = await client.query(
      "SELECT id FROM businesses WHERE id = $1 AND status = 'ACTIVE'",
      [params.id],
    );
    if (!business.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "BUSINESS_NOT_FOUND" });
      return;
    }

    const zoneResult = await client.query(
      "SELECT * FROM resolve_zone_for_point($1, $2)",
      [body.lat, body.lng],
    );
    const zone = zoneResult.rows[0];
    if (!zone) {
      await client.query("ROLLBACK");
      res.status(422).json({ error: "DELIVERY_ZONE_NOT_FOUND" });
      return;
    }

    const productIds = body.items?.map((item) => item.productId) ?? [];
    const productResult = productIds.length
      ? await client.query(
          `SELECT id, name, price
           FROM products
           WHERE business_id = $1
             AND is_available = true
             AND id = ANY($2::uuid[])`,
          [params.id, productIds],
        )
      : { rows: [] };

    if (productIds.length && productResult.rows.length !== productIds.length) {
      await client.query("ROLLBACK");
      res.status(422).json({ error: "PRODUCT_NOT_AVAILABLE" });
      return;
    }

    const productsById = new Map(
      productResult.rows.map((product) => [product.id, product]),
    );
    const productValue = body.items?.length
      ? body.items.reduce((sum, item) => {
          const product = productsById.get(item.productId);
          return sum + Number(product.price) * item.quantity;
        }, 0)
      : Number(body.productValue ?? 0);
    const productDescription = body.items?.length
      ? body.items
          .map((item) => {
            const product = productsById.get(item.productId);
            return `${item.quantity}x ${product.name}`;
          })
          .join(", ")
      : body.productDescription?.trim() ?? "Porosi biznesi";
    const transportFee = Number(zone.transport_fee);
    const platformCommission = Number((transportFee * 0.2).toFixed(2));
    const riderEarning = Number((transportFee - platformCommission).toFixed(2));
    const totalAmount = productValue + transportFee;

    const customerResult = await client.query(
      `INSERT INTO customers (name, phone)
       VALUES ($1, $2)
       RETURNING id`,
      [body.customerName.trim(), body.customerPhone.trim()],
    );

    const addressResult = await client.query(
      `INSERT INTO addresses (customer_id, zone_id, label, address_text, lat, lng)
       VALUES ($1, $2, 'Dorezim', $3, $4, $5)
       RETURNING id`,
      [
        customerResult.rows[0].id,
        zone.zone_id,
        body.addressText.trim(),
        body.lat,
        body.lng,
      ],
    );

    const orderResult = await client.query(
      `INSERT INTO orders (
        code,
        business_id,
        customer_id,
        delivery_address_id,
        zone_id,
        product_description,
        product_value,
        transport_fee,
        total_amount,
        platform_commission,
        rider_earning,
        status
      )
      VALUES (
        'HTC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'CREATED'
      )
      RETURNING *`,
      [
        params.id,
        customerResult.rows[0].id,
        addressResult.rows[0].id,
        zone.zone_id,
        productDescription,
        productValue,
        transportFee,
        totalAmount,
        platformCommission,
        riderEarning,
      ],
    );

    for (const item of body.items ?? []) {
      const product = productsById.get(item.productId);
      const unitPrice = Number(product.price);
      await client.query(
        `INSERT INTO order_items (order_id, product_id, name_snapshot, unit_price, quantity, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          orderResult.rows[0].id,
          item.productId,
          product.name,
          unitPrice,
          item.quantity,
          unitPrice * item.quantity,
        ],
      );
    }

    await client.query(
      "INSERT INTO order_status_history (order_id, to_status, note) VALUES ($1, 'CREATED', 'Created by business dashboard')",
      [orderResult.rows[0].id],
    );

    const offeredRiders = await offerBusinessOrderToNearestRiders(
      client,
      orderResult.rows[0].id,
    );
    if (offeredRiders.length > 0) {
      await client.query(
        "INSERT INTO order_status_history (order_id, from_status, to_status, note) VALUES ($1, 'CREATED', 'OFFERED', 'Offered to nearest online riders')",
        [orderResult.rows[0].id],
      );
    }

    await client.query("COMMIT");

    const order = await getBusinessDashboardOrderById(
      orderResult.rows[0].id,
      params.id,
    );
    io.to("admin").emit("order.created", order);
    io.to(`business:${params.id}`).emit("order.created", order);

    if (offeredRiders.length > 0) {
      io.to("admin").emit("order.offered", {
        orderId: orderResult.rows[0].id,
        riderIds: offeredRiders.map((rider) => rider.id),
        expiresAt: new Date(
          Date.now() + orderOfferTtlMinutes * 60 * 1000,
        ).toISOString(),
      });
      for (const rider of offeredRiders) {
        io.to(`rider:${rider.id}`).emit("order.offered", {
          orderId: orderResult.rows[0].id,
          message: "Ke nje porosi te re afer teje.",
          distanceMeters: rider.distanceMeters,
        });
      }
    }

    res.status(201).json({ order, offeredRiders });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/businesses/:id/products", async (req, res, next) => {
  const client = await pool.connect();

  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        name: z.string().min(2),
        description: z.string().optional().or(z.literal("")),
        price: z.coerce.number().min(0),
        section: z.string().min(2).optional().or(z.literal("")),
        imageUrl: z.string().optional().or(z.literal("")),
      })
      .parse(req.body);

    await client.query("BEGIN");

    const business = await client.query(
      "SELECT id FROM businesses WHERE id = $1",
      [params.id],
    );
    if (!business.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "BUSINESS_NOT_FOUND" });
      return;
    }

    const sectionName = body.section?.trim() || "Te preferuarat";
    const category = await client.query(
      `INSERT INTO product_categories (business_id, name, sort_order, active)
       VALUES ($1, $2, 1, true)
       ON CONFLICT (business_id, name) DO UPDATE SET active = true
       RETURNING id`,
      [params.id, sectionName],
    );

    const product = await client.query(
      `INSERT INTO products (business_id, category_id, name, description, price, image_url, is_available)
       VALUES ($1, $2, $3, NULLIF($4, ''), $5, NULLIF($6, ''), true)
       RETURNING id, name, description, price, image_url, is_available, created_at`,
      [
        params.id,
        category.rows[0].id,
        body.name.trim(),
        body.description ?? "",
        body.price,
        body.imageUrl ?? "",
      ],
    );

    await client.query("COMMIT");
    res.status(201).json({
      product: mapBusinessProduct({
        ...product.rows[0],
        section: sectionName,
      }),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/businesses/:id/categories", async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        name: z.string().min(2),
        sortOrder: z.coerce.number().int().optional(),
      })
      .parse(req.body);

    const business = await pool.query(
      "SELECT id FROM businesses WHERE id = $1",
      [params.id],
    );
    if (!business.rows[0]) {
      res.status(404).json({ error: "BUSINESS_NOT_FOUND" });
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO product_categories (business_id, name, sort_order, active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (business_id, name) DO UPDATE
       SET active = true,
           sort_order = EXCLUDED.sort_order
       RETURNING id, name, sort_order, active,
         (SELECT COUNT(*)::int FROM products p WHERE p.category_id = product_categories.id AND p.is_available = true) AS product_count`,
      [params.id, body.name.trim(), body.sortOrder ?? 1],
    );

    res.status(201).json({ category: mapBusinessCategory(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.patch("/businesses/:id/categories/:categoryId", async (req, res, next) => {
  try {
    const params = z
      .object({ id: z.string().uuid(), categoryId: z.string().uuid() })
      .parse(req.params);
    const body = z
      .object({
        name: z.string().min(2),
        sortOrder: z.coerce.number().int().optional(),
      })
      .parse(req.body);

    const { rows } = await pool.query(
      `UPDATE product_categories
       SET name = $3,
           sort_order = $4,
           active = true
       WHERE id = $1
         AND business_id = $2
       RETURNING id, name, sort_order, active,
         (SELECT COUNT(*)::int FROM products p WHERE p.category_id = product_categories.id AND p.is_available = true) AS product_count`,
      [params.categoryId, params.id, body.name.trim(), body.sortOrder ?? 1],
    );

    if (!rows[0]) {
      res.status(404).json({ error: "CATEGORY_NOT_FOUND" });
      return;
    }

    res.json({ category: mapBusinessCategory(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.delete("/businesses/:id/categories/:categoryId", async (req, res, next) => {
  const client = await pool.connect();

  try {
    const params = z
      .object({ id: z.string().uuid(), categoryId: z.string().uuid() })
      .parse(req.params);

    await client.query("BEGIN");
    const category = await client.query(
      "SELECT id FROM product_categories WHERE id = $1 AND business_id = $2 FOR UPDATE",
      [params.categoryId, params.id],
    );

    if (!category.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "CATEGORY_NOT_FOUND" });
      return;
    }

    await client.query(
      "UPDATE products SET category_id = NULL, updated_at = now() WHERE category_id = $1 AND business_id = $2",
      [params.categoryId, params.id],
    );
    await client.query(
      "UPDATE product_categories SET active = false WHERE id = $1 AND business_id = $2",
      [params.categoryId, params.id],
    );

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.patch("/businesses/:id/products/:productId", async (req, res, next) => {
  const client = await pool.connect();

  try {
    const params = z
      .object({ id: z.string().uuid(), productId: z.string().uuid() })
      .parse(req.params);
    const body = z
      .object({
        name: z.string().min(2),
        description: z.string().optional().or(z.literal("")),
        price: z.coerce.number().min(0),
        section: z.string().min(2).optional().or(z.literal("")),
        imageUrl: z.string().optional().or(z.literal("")),
      })
      .parse(req.body);

    await client.query("BEGIN");

    const current = await client.query(
      "SELECT id FROM products WHERE id = $1 AND business_id = $2",
      [params.productId, params.id],
    );
    if (!current.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
      return;
    }

    const sectionName = body.section?.trim() || "Te preferuarat";
    const category = await client.query(
      `INSERT INTO product_categories (business_id, name, sort_order, active)
       VALUES ($1, $2, 1, true)
       ON CONFLICT (business_id, name) DO UPDATE SET active = true
       RETURNING id`,
      [params.id, sectionName],
    );

    const product = await client.query(
      `UPDATE products
       SET category_id = $3,
           name = $4,
           description = NULLIF($5, ''),
           price = $6,
           image_url = NULLIF($7, ''),
           updated_at = now()
       WHERE id = $1
         AND business_id = $2
       RETURNING id, name, description, price, image_url, is_available, created_at`,
      [
        params.productId,
        params.id,
        category.rows[0].id,
        body.name.trim(),
        body.description ?? "",
        body.price,
        body.imageUrl ?? "",
      ],
    );

    await client.query("COMMIT");
    res.json({
      product: mapBusinessProduct({ ...product.rows[0], section: sectionName }),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.delete("/businesses/:id/products/:productId", async (req, res, next) => {
  try {
    const params = z
      .object({ id: z.string().uuid(), productId: z.string().uuid() })
      .parse(req.params);
    const { rowCount } = await pool.query(
      `UPDATE products
       SET is_available = false,
           updated_at = now()
       WHERE id = $1
         AND business_id = $2`,
      [params.productId, params.id],
    );

    if (!rowCount) {
      res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.patch(
  "/businesses/:id/orders/:orderId/decision",
  async (req, res, next) => {
    const client = await pool.connect();

    try {
      const params = z
        .object({ id: z.string().uuid(), orderId: z.string().uuid() })
        .parse(req.params);
      const body = z
        .object({ action: z.enum(["CONFIRM", "REFUSE"]) })
        .parse(req.body);

      await client.query("BEGIN");
      const locked = await client.query(
        "SELECT * FROM orders WHERE id = $1 AND business_id = $2 FOR UPDATE",
        [params.orderId, params.id],
      );
      const order = locked.rows[0];

      if (!order) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "ORDER_NOT_FOUND" });
        return;
      }

      if (body.action === "REFUSE") {
        if (!["CREATED", "OFFERED"].includes(order.status)) {
          await client.query("ROLLBACK");
          res.status(409).json({ error: "ORDER_CANNOT_BE_REFUSED" });
          return;
        }

        await client.query(
          `UPDATE orders
         SET status = 'CANCELLED',
             cancelled_at = now(),
             version = version + 1
         WHERE id = $1`,
          [params.orderId],
        );
        await client.query(
          "UPDATE order_offers SET status = 'CANCELLED', responded_at = now() WHERE order_id = $1 AND status = 'PENDING'",
          [params.orderId],
        );
        await client.query(
          "INSERT INTO order_status_history (order_id, from_status, to_status, note) VALUES ($1, $2, 'CANCELLED', 'Refused by business')",
          [params.orderId, order.status],
        );
      } else if (order.status === "CREATED") {
        const offeredRiders = await offerBusinessOrderToNearestRiders(
          client,
          params.orderId,
        );
        await client.query(
          "INSERT INTO order_status_history (order_id, from_status, to_status, note) VALUES ($1, 'CREATED', 'OFFERED', 'Confirmed by business')",
          [params.orderId],
        );
        io.to("admin").emit("order.offered", {
          orderId: params.orderId,
          riderIds: offeredRiders.map((rider) => rider.id),
          expiresAt: new Date(
            Date.now() + orderOfferTtlMinutes * 60 * 1000,
          ).toISOString(),
        });
        for (const rider of offeredRiders)
          io.to(`rider:${rider.id}`).emit("order.offered", {
            orderId: params.orderId,
            message: "Ke nje porosi te re afer teje.",
            distanceMeters: rider.distanceMeters,
          });
      }

      await client.query("COMMIT");
      const updated = await getRiderOrderById(params.orderId);
      io.to("admin").emit("order.status_changed", {
        orderId: params.orderId,
        status: body.action === "REFUSE" ? "CANCELLED" : updated?.status,
      });
      io.to(`business:${params.id}`).emit("order.status_changed", {
        orderId: params.orderId,
        action: body.action,
      });
      res.json({ order: updated });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  },
);

app.get("/public/cart", async (req, res, next) => {
  try {
    const customerId = customerIdFromHeader(req);
    const guestToken = guestTokenFromHeader(req);
    const ownerId = customerId ?? guestToken;
    if (!ownerId) {
      res.json({ business_id: null, items: [] });
      return;
    }

    const { rows } = await pool.query(
      `SELECT cc.id,
              cc.business_id,
              COALESCE(
                jsonb_agg(
                  jsonb_build_object(
                    'productId', cci.product_id,
                    'quantity', cci.quantity,
                    'name', p.name,
                    'price', p.price,
                    'imageUrl', p.image_url
                  )
                ) FILTER (WHERE cci.id IS NOT NULL),
                '[]'::jsonb
              ) AS items
       FROM customer_carts cc
       LEFT JOIN customer_cart_items cci ON cci.cart_id = cc.id
       LEFT JOIN products p ON p.id = cci.product_id
       WHERE ${customerId ? "cc.customer_account_id" : "cc.guest_token"} = $1
       GROUP BY cc.id`,
      [ownerId],
    );

    res.json(rows[0] ?? { business_id: null, items: [] });
  } catch (error) {
    next(error);
  }
});

app.put("/public/cart/items", async (req, res, next) => {
  const client = await pool.connect();

  try {
    const customerId = customerIdFromHeader(req);
    const guestToken = guestTokenFromHeader(req);
    if (!customerId && !guestToken) {
      res.status(401).json({ error: "CART_OWNER_REQUIRED" });
      return;
    }

    const body = z
      .object({
        businessId: z.string().uuid(),
        productId: z.string().uuid(),
        quantity: z.number().int().min(0),
      })
      .parse(req.body);

    await client.query("BEGIN");
    const cartResult = customerId
      ? await client.query(
          `INSERT INTO customer_carts (customer_account_id, business_id)
           VALUES ($1, $2)
           ON CONFLICT (customer_account_id) DO UPDATE
           SET business_id = EXCLUDED.business_id,
               updated_at = now()
           RETURNING id`,
          [customerId, body.businessId],
        )
      : await client.query(
          `INSERT INTO customer_carts (guest_token, business_id)
           VALUES ($1, $2)
           ON CONFLICT (guest_token) DO UPDATE
           SET business_id = EXCLUDED.business_id,
               updated_at = now()
           RETURNING id`,
          [guestToken, body.businessId],
        );

    await client.query(
      `DELETE FROM customer_cart_items cci
       USING products p
       WHERE cci.product_id = p.id
         AND cci.cart_id = $1
         AND p.business_id <> $2`,
      [cartResult.rows[0].id, body.businessId],
    );

    if (body.quantity === 0) {
      await client.query(
        "DELETE FROM customer_cart_items WHERE cart_id = $1 AND product_id = $2",
        [cartResult.rows[0].id, body.productId],
      );
    } else {
      await client.query(
        `INSERT INTO customer_cart_items (cart_id, product_id, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (cart_id, product_id) DO UPDATE
         SET quantity = EXCLUDED.quantity,
             updated_at = now()`,
        [cartResult.rows[0].id, body.productId, body.quantity],
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/public/cart/clear", async (req, res, next) => {
  try {
    const customerId = customerIdFromHeader(req);
    const guestToken = guestTokenFromHeader(req);
    const ownerId = customerId ?? guestToken;
    if (!ownerId) {
      res.json({ ok: true });
      return;
    }

    await pool.query(
      `DELETE FROM customer_cart_items
       WHERE cart_id IN (SELECT id FROM customer_carts WHERE ${customerId ? "customer_account_id" : "guest_token"} = $1)`,
      [ownerId],
    );
    await pool.query(
      `UPDATE customer_carts SET business_id = NULL, updated_at = now() WHERE ${customerId ? "customer_account_id" : "guest_token"} = $1`,
      [ownerId],
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/public/orders", async (req, res, next) => {
  const client = await pool.connect();

  try {
    const customerAccountId = customerIdFromHeader(req);
    const body = z
      .object({
        businessId: z.string().uuid(),
        customerName: z.string().min(1).optional(),
        customerPhone: z.string().min(6).optional(),
        addressText: z.string().min(5).optional(),
        lat: z.coerce.number().optional(),
        lng: z.coerce.number().optional(),
        items: z
          .array(
            z.object({
              productId: z.string().uuid(),
              quantity: z.number().int().positive(),
            }),
          )
          .min(1),
      })
      .parse(req.body);

    await client.query("BEGIN");

    let account = null;
    if (customerAccountId) {
      const accountResult = await client.query(
        `SELECT id, customer_id, name, phone, default_address, default_lat, default_lng
         FROM customer_accounts
         WHERE id = $1`,
        [customerAccountId],
      );
      account = accountResult.rows[0] ?? null;
      if (!account) {
        await client.query("ROLLBACK");
        res.status(401).json({ error: "CUSTOMER_SESSION_EXPIRED" });
        return;
      }
    }

    const customerName = body.customerName ?? account?.name ?? null;
    const customerPhone = body.customerPhone ?? account?.phone;
    const addressText = body.addressText ?? account?.default_address;
    const lat = body.lat ?? Number(account?.default_lat ?? 41.3198);
    const lng = body.lng ?? Number(account?.default_lng ?? 19.8172);

    if (!customerPhone || !addressText)
      throw new Error("CUSTOMER_DETAILS_REQUIRED");

    const zoneResult = await client.query(
      "SELECT * FROM resolve_zone_for_point($1, $2)",
      [lat, lng],
    );
    const zone = zoneResult.rows[0];
    if (!zone) throw new Error("ZONE_NOT_FOUND");

    const productIds = body.items.map((item) => item.productId);
    const productResult = await client.query(
      `SELECT id, name, price
       FROM products
       WHERE business_id = $1
         AND is_available = true
         AND id = ANY($2::uuid[])`,
      [body.businessId, productIds],
    );

    if (productResult.rows.length !== productIds.length)
      throw new Error("PRODUCT_NOT_AVAILABLE");

    const productsById = new Map(
      productResult.rows.map((product) => [product.id, product]),
    );
    const productValue = body.items.reduce((sum, item) => {
      const product = productsById.get(item.productId);
      return sum + Number(product.price) * item.quantity;
    }, 0);
    const transportFee = Number(zone.transport_fee);
    const platformCommission = Number((transportFee * 0.2).toFixed(2));
    const riderEarning = Number((transportFee - platformCommission).toFixed(2));
    const totalAmount = productValue + transportFee;

    const customerResult = account?.customer_id
      ? { rows: [{ id: account.customer_id }] }
      : await client.query(
          `INSERT INTO customers (name, phone)
           VALUES ($1, $2)
           RETURNING id`,
          [customerName, customerPhone],
        );

    const addressResult = await client.query(
      `INSERT INTO addresses (customer_id, zone_id, address_text, lat, lng)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [customerResult.rows[0].id, zone.zone_id, addressText, lat, lng],
    );

    const orderResult = await client.query(
      `INSERT INTO orders (
        code,
        business_id,
        customer_id,
        delivery_address_id,
        zone_id,
        product_description,
        product_value,
        transport_fee,
        total_amount,
        platform_commission,
        rider_earning,
        status
      )
      VALUES (
        'HTC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'CREATED'
      )
      RETURNING *`,
      [
        body.businessId,
        customerResult.rows[0].id,
        addressResult.rows[0].id,
        zone.zone_id,
        "Customer online order",
        productValue,
        transportFee,
        totalAmount,
        platformCommission,
        riderEarning,
      ],
    );

    for (const item of body.items) {
      const product = productsById.get(item.productId);
      const unitPrice = Number(product.price);
      await client.query(
        `INSERT INTO order_items (order_id, product_id, name_snapshot, unit_price, quantity, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          orderResult.rows[0].id,
          item.productId,
          product.name,
          unitPrice,
          item.quantity,
          unitPrice * item.quantity,
        ],
      );
    }

    const offeredRiders = await offerBusinessOrderToNearestRiders(
      client,
      orderResult.rows[0].id,
    );
    if (offeredRiders.length > 0) {
      await client.query(
        "INSERT INTO order_status_history (order_id, from_status, to_status, note) VALUES ($1, 'CREATED', 'OFFERED', 'Offered to nearest online riders')",
        [orderResult.rows[0].id],
      );
      orderResult.rows[0].status = "OFFERED";
    }

    if (customerAccountId) {
      await client.query(
        `DELETE FROM customer_cart_items
         WHERE cart_id IN (SELECT id FROM customer_carts WHERE customer_account_id = $1)`,
        [customerAccountId],
      );
      await client.query(
        "UPDATE customer_carts SET business_id = NULL, updated_at = now() WHERE customer_account_id = $1",
        [customerAccountId],
      );
    }

    await client.query("COMMIT");

    io.to("admin").emit("order.created", orderResult.rows[0]);
    if (offeredRiders.length > 0) {
      io.to("admin").emit("order.offered", {
        orderId: orderResult.rows[0].id,
        riderIds: offeredRiders.map((rider) => rider.id),
        expiresAt: new Date(
          Date.now() + orderOfferTtlMinutes * 60 * 1000,
        ).toISOString(),
      });
      for (const rider of offeredRiders) {
        io.to(`rider:${rider.id}`).emit("order.offered", {
          orderId: orderResult.rows[0].id,
          message: "Ke nje porosi te re afer teje.",
          distanceMeters: rider.distanceMeters,
        });
      }
    }
    res.status(201).json(orderResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.get("/public/orders/:code/track", async (req, res, next) => {
  try {
    const params = z
      .object({ code: z.string().min(4).max(32) })
      .parse(req.params);
    const { rows } = await pool.query(
      `SELECT o.id,
              o.code,
              o.status,
              o.total_amount,
              o.created_at,
              b.name AS business_name,
              b.lat AS pickup_lat,
              b.lng AS pickup_lng,
              a.address_text AS delivery_address,
              a.lat AS dropoff_lat,
              a.lng AS dropoff_lng
       FROM orders o
       JOIN businesses b ON b.id = o.business_id
       JOIN addresses a ON a.id = o.delivery_address_id
       WHERE o.code = $1`,
      [params.code],
    );

    if (!rows[0]) {
      res.status(404).json({ error: "ORDER_NOT_FOUND" });
      return;
    }

    res.json({ order: rows[0] });
  } catch (error) {
    next(error);
  }
});

app.get("/public/me/orders", async (req, res, next) => {
  try {
    const customerId = customerIdFromHeader(req);
    if (!customerId) {
      res.status(401).json({ error: "CUSTOMER_REQUIRED" });
      return;
    }

    const { rows } = await pool.query(
      `SELECT o.id,
              o.code,
              o.status,
              o.product_value,
              o.transport_fee,
              o.total_amount,
              o.created_at,
              b.name AS business_name,
              COALESCE(
                jsonb_agg(
                  jsonb_build_object(
                    'name', oi.name_snapshot,
                    'quantity', oi.quantity,
                    'lineTotal', oi.line_total
                  )
                ) FILTER (WHERE oi.id IS NOT NULL),
                '[]'::jsonb
              ) AS items
       FROM customer_accounts ca
       JOIN orders o ON o.customer_id = ca.customer_id
       JOIN businesses b ON b.id = o.business_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE ca.id = $1
       GROUP BY o.id, b.name
       ORDER BY o.created_at DESC`,
      [customerId],
    );

    res.json({ orders: rows });
  } catch (error) {
    next(error);
  }
});

app.post("/zones/resolve", async (req, res, next) => {
  try {
    const body = z.object({ lat: z.number(), lng: z.number() }).parse(req.body);
    const { rows } = await pool.query(
      "SELECT * FROM resolve_zone_for_point($1, $2)",
      [body.lat, body.lng],
    );

    if (!rows[0]) {
      res.status(404).json({ error: "ZONE_NOT_FOUND" });
      return;
    }

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.post("/orders/:id/accept", async (req, res, next) => {
  const client = await pool.connect();

  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ riderId: z.string().uuid() }).parse(req.body);
    const rider = await client.query(
      "SELECT is_online FROM rider_profiles WHERE id = $1 AND status = 'ACTIVE'",
      [body.riderId],
    );

    if (!rider.rows[0]?.is_online) {
      res.status(403).json({ error: "RIDER_MUST_BE_ONLINE_TO_ACCEPT" });
      return;
    }

    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT * FROM accept_order_atomic($1, $2)",
      [params.id, body.riderId],
    );
    await client.query("COMMIT");

    io.to("admin").emit("order.accepted", {
      orderId: params.id,
      riderId: body.riderId,
    });
    io.to(`rider:${body.riderId}`).emit("order.accepted", rows[0]);
    const order = await getRiderOrderById(params.id, body.riderId);
    res.json(order ?? rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/orders/:id/reject", async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ riderId: z.string().uuid() }).parse(req.body);

    const { rowCount } = await pool.query(
      `UPDATE order_offers
       SET status = 'REJECTED',
           responded_at = now()
       WHERE order_id = $1
         AND rider_id = $2
         AND status = 'PENDING'`,
      [params.id, body.riderId],
    );

    if (!rowCount) {
      res.status(404).json({ error: "OFFER_NOT_FOUND" });
      return;
    }

    io.to("admin").emit("order.offer_rejected", {
      orderId: params.id,
      riderId: body.riderId,
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.patch("/riders/orders/:id/status", async (req, res, next) => {
  const client = await pool.connect();

  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        riderId: z.string().uuid(),
        status: z.enum(["PICKED_UP", "DELIVERED", "CANCELLED"]),
      })
      .parse(req.body);

    await client.query("BEGIN");
    const locked = await client.query(
      "SELECT * FROM orders WHERE id = $1 AND assigned_rider_id = $2 FOR UPDATE",
      [params.id, body.riderId],
    );
    const order = locked.rows[0];

    if (!order) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "ORDER_NOT_FOUND" });
      return;
    }

    const nextStatus = body.status;
    const validTransition =
      (order.status === "ACCEPTED" &&
        (nextStatus === "PICKED_UP" || nextStatus === "CANCELLED")) ||
      (order.status === "PICKED_UP" &&
        (nextStatus === "DELIVERED" || nextStatus === "CANCELLED"));

    if (!validTransition) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "INVALID_ORDER_STATUS_TRANSITION" });
      return;
    }

    const timestampColumn =
      nextStatus === "PICKED_UP"
        ? "picked_up_at"
        : nextStatus === "DELIVERED"
          ? "delivered_at"
          : "cancelled_at";
    await client.query(
      `UPDATE orders
       SET status = $3,
           ${timestampColumn} = now(),
           version = version + 1
       WHERE id = $1
         AND assigned_rider_id = $2`,
      [params.id, body.riderId, nextStatus],
    );

    await client.query(
      "INSERT INTO order_status_history (order_id, from_status, to_status, note) VALUES ($1, $2, $3, 'Updated by rider app')",
      [params.id, order.status, nextStatus],
    );

    if (nextStatus === "DELIVERED") {
      await client.query(
        `INSERT INTO ledger_entries (order_id, rider_id, business_id, entry_type, amount, direction, status)
         VALUES
           ($1, $2, $3, 'RIDER_EARNING_80', $4, 'RIDER_EARNS', 'OPEN'),
           ($1, $2, $3, 'PLATFORM_COMMISSION_20', $5, 'RIDER_OWES_PLATFORM', 'OPEN')`,
        [
          params.id,
          body.riderId,
          order.business_id,
          order.rider_earning,
          order.platform_commission,
        ],
      );
    }

    await client.query("COMMIT");

    const updatedOrder = await getRiderOrderById(params.id, body.riderId);
    io.to("admin").emit("order.status_changed", {
      orderId: params.id,
      status: nextStatus,
    });
    io.to(`rider:${body.riderId}`).emit("order.status_changed", {
      orderId: params.id,
      status: nextStatus,
    });
    io.to(`business:${order.business_id}`).emit("order.status_changed", {
      orderId: params.id,
      status: nextStatus,
    });
    res.json(updatedOrder);
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/riders/me/location", async (req, res, next) => {
  try {
    const body = z
      .object({
        riderId: z.string().uuid(),
        orderId: z.string().uuid().nullable().optional(),
        lat: z.number(),
        lng: z.number(),
        speed: z.number().optional(),
        heading: z.number().optional(),
      })
      .parse(req.body);

    const allowed = await pool.query(
      `SELECT EXISTS (
        SELECT 1
        FROM rider_profiles rp
        WHERE rp.id = $1
          AND (
            rp.is_online = true
            OR EXISTS (
              SELECT 1 FROM orders o
              WHERE o.assigned_rider_id = rp.id
                AND o.status IN ('ACCEPTED', 'PICKED_UP')
            )
          )
      ) AS can_track`,
      [body.riderId],
    );

    if (!allowed.rows[0]?.can_track) {
      res
        .status(403)
        .json({ error: "GPS_ALLOWED_ONLY_WHEN_ONLINE_OR_ACTIVE_ORDER" });
      return;
    }

    await pool.query(
      `INSERT INTO rider_locations (rider_id, order_id, point, lat, lng, speed, heading)
       VALUES ($1, $2, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, $3, $4, $5, $6)`,
      [
        body.riderId,
        body.orderId ?? null,
        body.lat,
        body.lng,
        body.speed ?? null,
        body.heading ?? null,
      ],
    );

    io.to("admin").emit("rider.location_updated", body);
    if (body.orderId)
      io.to(`order:${body.orderId}`).emit("rider.location_updated", body);

    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === "23505"
    ) {
      const constraint = "constraint" in error ? String(error.constraint) : "";
      if (constraint.includes("customer_accounts_phone")) {
        res.status(409).json({ error: "CUSTOMER_PHONE_EXISTS" });
        return;
      }
      if (constraint.includes("customer_accounts_email")) {
        res.status(409).json({ error: "CUSTOMER_EMAIL_EXISTS" });
        return;
      }
    }

    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = message.includes("NOT_FOUND")
      ? 404
      : message.includes("NOT_AVAILABLE")
        ? 409
        : 400;
    res.status(status).json({ error: message });
  },
);

const port = Number(process.env.PORT ?? 4000);
server.listen(port, () => {
  console.log(`Happy Tirana API listening on http://localhost:${port}`);
});
