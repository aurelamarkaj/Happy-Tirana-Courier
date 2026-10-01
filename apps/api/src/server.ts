import dotenv from "dotenv";
import { pathToFileURL } from "node:url";
import { resolveGoogleMapsDestination } from "./maps-location.js";
import { assertRiderEligible } from "./rider-eligibility.js";
import { isOperationalDay, firstOfferDelayMinutes, debitLimit, debitEligible, MAX_ACTIVE_ORDERS, OFFER_ESCALATION_SECONDS, ADMIN_ALERT_DELAY_SECONDS } from "./operational-rules.js";
import crypto from "node:crypto";
import http from "node:http";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { Server } from "socket.io";
import { z } from "zod";
import { getGoogleRoadRoute, type RouteInput } from "./google-routes.js";
import { buildItinerary } from "./rider-itinerary.js";
import {
  businessOrderSchema,
  businessQuoteSchema,
  assertOrderingOpen,
  getOrderWindow,
  calculateBusinessTransportQuote as calculateQuote,
} from "./business-orders.js";

dotenv.config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
});

const { pool } = await import("@happy-tirana/db");

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOrigins = [
  /^http:\/\/localhost:30\d\d$/,
  /^http:\/\/localhost:31\d\d$/,
  /^http:\/\/127\.0\.0\.1:30\d\d$/,
  /^http:\/\/127\.0\.0\.1:31\d\d$/,
  ...allowedOrigins,
];
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
    origin: corsOrigins,
    credentials: true,
  },
});
const riderDebitLimitAll = debitLimit();
const nearbyRiderRadiusMeters = Number(process.env.NEARBY_RIDER_RADIUS_METERS ?? 1000);
const offerEscalationSeconds = OFFER_ESCALATION_SECONDS;

const ringSurchargeDefaultAll = 100;
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "";
const googleMapsHttpReferrer =
  process.env.GOOGLE_MAPS_HTTP_REFERRER?.trim() ?? "";
const googleMapsRequestHeaders = googleMapsHttpReferrer
  ? { Referer: googleMapsHttpReferrer }
  : undefined;

app.use(helmet());
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);
app.use(express.json({ limit: "5mb" }));
app.use("/admin", (req, res, next) =>
  req.path === "/auth/login" ? next() : requireAdmin(req, res, next));
app.use("/businesses", (req, res, next) =>
  req.path === "/auth/login" || req.path === "/order-window"
    ? next() : requireBusiness(req, res, next));
app.use("/riders", (req, res, next) =>
  req.path === "/auth/login" ? next() : requireRider(req, res, next));
app.use("/orders", requireRider);
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, service: "happy-tirana-api", database: "connected" });
  } catch {
    res.status(503).json({ ok: false, service: "happy-tirana-api", database: "unavailable" });
  }
});

app.get("/businesses/order-window", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(getOrderWindow());
});

function orderingHours(
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  try {
    assertOrderingOpen();
    next();
  } catch {
    res.status(409).json({ error: "ORDERING_CLOSED", ...getOrderWindow() });
  }
}

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

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function parseLatLngFromText(value: string) {
  const text = decodeURIComponent(value);
  const patterns = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /(?:q|ll|query|destination|daddr)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  return null;
}

function decodeGooglePolyline(encoded: string) {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

async function resolveGoogleMapsLink(googleMapsUrl?: string | null) {
  const rawUrl = googleMapsUrl?.trim();
  if (!rawUrl) return null;

  const direct = parseLatLngFromText(rawUrl);
  if (direct) return { ...direct, resolvedUrl: rawUrl };

  try {
    const url = new URL(rawUrl);
    if (!["maps.app.goo.gl", "goo.gl"].includes(url.hostname)) return null;

    const response = await fetch(rawUrl, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    const resolvedUrl = response.url || rawUrl;
    const fromRedirect = parseLatLngFromText(resolvedUrl);
    if (fromRedirect) return { ...fromRedirect, resolvedUrl };

    const body = await response.text();
    const fromBody = parseLatLngFromText(body);
    return fromBody ? { ...fromBody, resolvedUrl } : null;
  } catch {
    return null;
  }
}

async function getRouteDistanceMeters(input: RouteInput) {
  return getGoogleRoadRoute(googleMapsApiKey, input);
}

async function calculateBusinessTransportQuote(
  client: PoolClient,
  input: Parameters<typeof calculateQuote>[2],
) {
  return calculateQuote(client, googleMapsApiKey, input);
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

type GoogleGeocodeResult = {
  place_id?: string;
  formatted_address?: string;
  address_components?: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
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
    personalId: row.personal_id ?? null,
    accountBalanceAll: Number(row.account_balance_all ?? 0),
    isOnline: row.is_online,
    status: row.status,
    lastSeenAt: row.last_seen_at,
    platformDue: Number(row.platform_due ?? 0),
    debitLimitAll: Math.min(Number(row.debit_limit_all ?? riderDebitLimitAll), riderDebitLimitAll),
    isDebitBlocked:
      Number(row.platform_due ?? 0) >=
      Math.min(Number(row.debit_limit_all ?? riderDebitLimitAll), riderDebitLimitAll),
  };
}

function mapRiderOrder(row: Record<string, unknown>) {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    businessName: row.business_name,
    businessCategory: row.business_category ?? null,
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
    readyMinutes: Number(row.ready_minutes ?? 10),
    routeDistanceMeters: numericOrUndefined(row.route_distance_meters),
    routeDistanceSource: row.route_distance_source,
    routePreference: row.route_preference,
    googleMapsUrl: row.google_maps_url,
    calculatedTransportFee: numericOrUndefined(row.calculated_transport_fee),
    transportFeeOverridden: Boolean(row.transport_fee_overridden),
    ringSurchargeApplied: Boolean(row.ring_surcharge_applied),
    ringSurchargeFee: Number(row.ring_surcharge_fee ?? 0),
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
    readyMinutes: Number(row.ready_minutes ?? 10),
    routeDistanceMeters: numericOrUndefined(row.route_distance_meters),
    routeDistanceSource: row.route_distance_source,
    routePreference: row.route_preference,
    googleMapsUrl: row.google_maps_url,
    calculatedTransportFee: numericOrUndefined(row.calculated_transport_fee),
    transportFeeOverridden: Boolean(row.transport_fee_overridden),
    ringSurchargeApplied: Boolean(row.ring_surcharge_applied),
    ringSurchargeFee: Number(row.ring_surcharge_fee ?? 0),
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
            o.ready_minutes,
            o.route_distance_meters,
            o.route_distance_source,
            o.route_preference,
            o.google_maps_url,
            o.calculated_transport_fee,
            o.transport_fee_overridden,
            o.ring_surcharge_applied,
            o.ring_surcharge_fee,
            o.created_at,
            c.name AS customer_name,
            c.phone AS customer_phone,
            a.address_text AS delivery_address,
            u.name AS rider_name,
            COUNT(oo.id)::int AS offered_rider_count
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
    personalId: row.personal_id ?? null,
    accountBalanceAll: Number(row.account_balance_all ?? 0),
    isOnline: row.is_online,
    status: row.status,
    lastSeenAt: row.last_seen_at,
    lastLat: numericOrUndefined(row.last_lat),
    lastLng: numericOrUndefined(row.last_lng),
    gpsAccuracy: numericOrUndefined(row.gps_accuracy),
    gpsRecordedAt: row.gps_recorded_at ?? null,
    platformDue: Number(row.platform_due ?? 0),
    debitLimitAll: Math.min(Number(row.debit_limit_all ?? riderDebitLimitAll), riderDebitLimitAll),
    isDebitBlocked:
      Number(row.platform_due ?? 0) >=
      Math.min(Number(row.debit_limit_all ?? riderDebitLimitAll), riderDebitLimitAll),
    deliveriesToday: Number(row.deliveries_today ?? 0),
  };
}

function signAdminToken(id: string) {
  const expires = Math.floor(Date.now()/1000)+12*3600;
  const payload = `${id}.${expires}`;
  const signature = crypto.createHmac("sha256", process.env.JWT_SECRET ?? "").update(payload).digest("hex");
  return `${payload}.${signature}`;
}
type AccountRole = "BUSINESS" | "RIDER";
function signAccountToken(id: string, role: AccountRole) {
  const expires = Math.floor(Date.now() / 1000) + 12 * 3600;
  const payload = `${role}:${id}.${expires}`;
  const signature = crypto.createHmac("sha256", process.env.JWT_SECRET ?? "").update(payload).digest("hex");
  return `${id}.${expires}.${signature}`;
}
function accountTokenId(token: string, role: AccountRole) {
  const [id, expiry, signature] = token.split(".");
  if (!z.string().uuid().safeParse(id).success || !expiry || !signature ||
      !Number.isInteger(Number(expiry)) || Number(expiry) < Date.now() / 1000) return null;
  const expected = crypto.createHmac("sha256", process.env.JWT_SECRET ?? "")
    .update(`${role}:${id}.${expiry}`).digest("hex");
  if (signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return id;
}
async function requireBusiness(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const id = accountTokenId(req.header("authorization")?.replace(/^Bearer /i, "") ?? "", "BUSINESS");
    if (!id || req.path.split("/")[1] !== id) throw new Error("BUSINESS_AUTH_REQUIRED");
    const account = await pool.query(`SELECT 1 FROM businesses b JOIN business_users bu ON bu.business_id=b.id
      JOIN users u ON u.id=bu.user_id WHERE b.id=$1 AND b.status='ACTIVE'
      AND u.role='BUSINESS' AND u.status='ACTIVE' LIMIT 1`, [id]);
    if (!account.rowCount) throw new Error("BUSINESS_AUTH_REQUIRED");
    next();
  } catch { res.status(401).json({ error: "BUSINESS_AUTH_REQUIRED" }); }
}
async function requireRider(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const id = accountTokenId(req.header("authorization")?.replace(/^Bearer /i, "") ?? "", "RIDER");
    if (!id) throw new Error("RIDER_AUTH_REQUIRED");
    const target = req.baseUrl === "/orders" || req.path.startsWith("/orders/") ||
      req.path === "/me/location" ? req.body?.riderId : req.path.split("/")[1];
    if (target !== id) throw new Error("RIDER_AUTH_REQUIRED");
    const account = await pool.query(`SELECT 1 FROM rider_profiles rp JOIN users u ON u.id=rp.user_id
      WHERE rp.id=$1 AND rp.status='ACTIVE' AND u.role='RIDER' AND u.status='ACTIVE'`, [id]);
    if (!account.rowCount) throw new Error("RIDER_AUTH_REQUIRED");
    next();
  } catch { res.status(401).json({ error: "RIDER_AUTH_REQUIRED" }); }
}
async function requireAdmin(req: express.Request,res: express.Response,next: express.NextFunction) {
  try {
    const token = req.header("authorization")?.replace(/^Bearer /i,"") ?? "";
    const [id,expiry,signature] = token.split(".");
    if (!id || !expiry || !signature || Number(expiry)<Date.now()/1000) throw new Error("ADMIN_AUTH_REQUIRED");
    const expected=crypto.createHmac("sha256",process.env.JWT_SECRET ?? "").update(`${id}.${expiry}`).digest("hex");
    if (signature.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) throw new Error("ADMIN_AUTH_REQUIRED");
    const admin=await pool.query("SELECT id FROM users WHERE id=$1 AND status='ACTIVE' AND role::text IN ('SUPERADMIN','ADMIN','OPERATOR')",[id]);
    if (!admin.rowCount) throw new Error("ADMIN_AUTH_REQUIRED");
    next();
  } catch {res.status(401).json({error:"ADMIN_AUTH_REQUIRED"});}
}

function mapAdminSession(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    token: signAdminToken(String(row.id)),
  };
}

io.on("connection", (socket) => {
  socket.on("rider.join", async (token: unknown, ack?: (ok:boolean)=>void) => {
    const id = typeof token === "string" ? accountTokenId(token, "RIDER") : null;
    if (!id) { ack?.(false); return; }
    const account = await pool.query(`SELECT 1 FROM rider_profiles rp JOIN users u ON u.id=rp.user_id
      WHERE rp.id=$1 AND rp.status='ACTIVE' AND u.status='ACTIVE'`, [id]);
    if (account.rowCount) { await socket.join(`rider:${id}`); ack?.(true); }
    else ack?.(false);
  });
  socket.on("business.join", async (token: unknown, ack?: (ok:boolean)=>void) => {
    const id = typeof token === "string" ? accountTokenId(token, "BUSINESS") : null;
    if (!id) { ack?.(false); return; }
    const account = await pool.query(`SELECT 1 FROM businesses b JOIN business_users bu ON bu.business_id=b.id
      JOIN users u ON u.id=bu.user_id WHERE b.id=$1 AND b.status='ACTIVE' AND u.status='ACTIVE' LIMIT 1`, [id]);
    if (account.rowCount) { await socket.join(`business:${id}`); ack?.(true); }
    else ack?.(false);
  });
  socket.on("admin.join", async (token: unknown, ack?: (ok:boolean)=>void) => {
    if (typeof token !== "string") return;
    const [id, expiry, signature] = token.split(".");
    if (!z.string().uuid().safeParse(id).success || !expiry || !signature || Number(expiry) < Date.now()/1000) return;
    const expected = crypto.createHmac("sha256", process.env.JWT_SECRET ?? "").update(`${id}.${expiry}`).digest("hex");
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return;
    try {
      const admin = await pool.query("SELECT id FROM users WHERE id=$1 AND status='ACTIVE' AND role::text IN ('SUPERADMIN','ADMIN','OPERATOR')", [id]);
      if (admin.rowCount) { await socket.join("admin"); ack?.(true); }
      else ack?.(false);
    } catch { /* Reconnect will retry when the database is available. */ }
  });
});

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
    isSurchargeArea: Boolean(row.is_surcharge_area),
    surchargeFee: Number(row.surcharge_fee ?? ringSurchargeDefaultAll),
    active: row.active,
    createdAt: row.created_at,
    points: ring.map(([lng, lat]) => ({ lat, lng })),
  };
}

type OfferScope = "NEARBY" | "ALL";

async function offerBusinessOrderToEligibleRiders(
  client: PoolClient,
  orderId: string,
  scope: OfferScope = "NEARBY",
) {
  assertOrderingOpen();
  const riders = await client.query(
    `WITH order_context AS (
       SELECT COALESCE(b.lat, 41.3275)::numeric AS lat,
              COALESCE(b.lng, 19.8187)::numeric AS lng,
              COALESCE(o.route_distance_meters, 0)::int AS route_distance_meters
       FROM orders o
       JOIN businesses b ON b.id = o.business_id
       WHERE o.id = $1
     )
     SELECT rp.id,
            rp.user_id,
            u.name,
            rp.vehicle_type,
            latest.lat,
            latest.lng,
            COALESCE(debt.platform_due, 0)::numeric AS platform_due,
            CASE
              WHEN latest.point IS NULL THEN NULL
              ELSE ST_Distance(
                latest.point,
                ST_SetSRID(ST_MakePoint((SELECT lng FROM order_context), (SELECT lat FROM order_context)), 4326)::geography
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
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(le.amount), 0)::numeric AS platform_due
       FROM ledger_entries le
       WHERE le.rider_id = rp.id
         AND le.direction = 'RIDER_OWES_PLATFORM'
         AND le.status = 'OPEN'
     ) debt ON true
     WHERE rp.is_online = true
       AND rp.status = 'ACTIVE'
       AND u.status = 'ACTIVE'
       AND COALESCE(debt.platform_due, 0) < LEAST(rp.debit_limit_all, $4)
       AND rp.vehicle_type IN ('ELECTRIC', 'DIESEL')
       AND ((SELECT route_distance_meters FROM order_context) <= 3000 OR rp.vehicle_type = 'DIESEL')
       AND (
         SELECT COUNT(*) FROM orders active_order
         WHERE active_order.assigned_rider_id = rp.id
           AND active_order.status IN ('ACCEPTED', 'PICKED_UP')
       ) < 2
       AND NOT EXISTS (
         SELECT 1
         FROM order_offers existing
         WHERE existing.order_id = $1
           AND existing.rider_id = rp.id
           AND existing.status IN ('PENDING', 'REJECTED')
       )
       AND (
         $2::text = 'ALL'
         OR (
           latest.point IS NOT NULL
           AND ST_Distance(
             latest.point,
             ST_SetSRID(ST_MakePoint((SELECT lng FROM order_context), (SELECT lat FROM order_context)), 4326)::geography
           ) <= $3
         )
       )
     ORDER BY distance_meters ASC NULLS LAST, rp.last_seen_at DESC NULLS LAST
     `,
    [
      orderId,
      scope,
      nearbyRiderRadiusMeters,
      riderDebitLimitAll,
    ],
  );

  const eligible = [];
  for (const rider of riders.rows) {
    const locked = await client.query("SELECT id FROM rider_profiles WHERE id=$1 FOR UPDATE SKIP LOCKED", [rider.id]);
    if (!locked.rowCount) continue;
    try {
      await assertRiderEligible(client, rider.id, orderId, googleMapsApiKey);
      eligible.push(rider);
    } catch (error) {
      if (!(error instanceof Error) || !/^(SECOND_ORDER_|RIDER_|GOOGLE_DIRECTIONS_)/.test(error.message)) throw error;
    }
  }
  assertOrderingOpen();
  await client.query(
    `UPDATE orders
     SET status = 'OFFERED',
         last_dispatch_checked_at = now(),
         version = version + 1,
         offer_scope = $2,
         initial_offer_sent_at = COALESCE(initial_offer_sent_at, now()),
         initial_offer_rider_id = COALESCE(initial_offer_rider_id, $3::uuid),
         escalated_at = CASE WHEN $2 = 'ALL' THEN COALESCE(escalated_at, now()) ELSE escalated_at END
     WHERE id = $1
       AND status IN ('CREATED', 'OFFERED')
       AND assigned_rider_id IS NULL`,
    [orderId, scope, scope === "NEARBY" ? eligible[0]?.id ?? null : null],
  );

  for (const rider of eligible) {
    await client.query(
      `INSERT INTO order_offers (order_id, rider_id, status, expires_at)
       VALUES ($1, $2, 'PENDING', CASE WHEN $4::text='ALL' THEN 'infinity'::timestamptz ELSE now() + ($3::int * interval '1 second') END)
       ON CONFLICT (order_id, rider_id) DO UPDATE
       SET status = 'PENDING',
           sent_at = now(),
           responded_at = NULL,
           expires_at = EXCLUDED.expires_at
       WHERE order_offers.status IN ('PENDING', 'EXPIRED', 'CANCELLED')`,
      [orderId, rider.id, offerEscalationSeconds, scope],
    );
    await client.query(
      `INSERT INTO notifications (user_id, order_id, type, channel, status, payload, sent_at)
       VALUES (
         $1,
         $2,
         $5,
         'SOCKET',
         'PENDING',
         jsonb_build_object(
           'riderId', $3::uuid,
           'distanceMeters', $4::numeric,
           'vehicleType', $6::text,
           'scope', $7::text,
           'message', CASE WHEN $7::text = 'NEARBY' THEN 'Ke nje porosi te re brenda 1km.' ELSE 'Porosia eshte hapur per te gjithe motorristet e lire.' END
         ),
         NULL
       )`,
      [
        rider.user_id,
        orderId,
        rider.id,
        rider.distance_meters ?? null,
        scope === "NEARBY" ? "ORDER_OFFERED_NEARBY_1KM" : "ORDER_OFFERED_ALL",
        rider.vehicle_type,
        scope,
      ],
    );
  }

  return eligible.map((rider) => ({
    id: String(rider.id),
    name: String(rider.name),
    vehicleType: String(rider.vehicle_type),
    distanceMeters:
      rider.distance_meters === null || rider.distance_meters === undefined
        ? null
        : Number(rider.distance_meters),
  }));
}

async function createAdminNotification(
  client: PoolClient,
  input: { type: string; orderId?: string; payload: Record<string, unknown> },
) {
  await client.query(
    `INSERT INTO notifications (user_id, order_id, type, channel, status, payload, sent_at)
     SELECT u.id, $1::uuid, $2, 'SOCKET', 'PENDING', $3::jsonb, NULL
     FROM users u
      WHERE u.role::text IN ('SUPERADMIN', 'ADMIN', 'OPERATOR')
        AND u.status = 'ACTIVE'
        AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id=u.id AND n.type=$2
          AND n.order_id IS NOT DISTINCT FROM $1::uuid AND n.read_at IS NULL
          AND n.payload->>'riderId' IS NOT DISTINCT FROM ($3::jsonb)->>'riderId')`,
    [input.orderId ?? null, input.type, JSON.stringify(input.payload)],
  );

}

// The existing notifications table is the transactional outbox. Only committed
// rows are visible here; disconnected clients recover through their read APIs.
export async function publishPendingNotifications() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT n.*, u.role::text AS role, rp.id AS rider_id,
      EXISTS (SELECT 1 FROM order_offers oo JOIN orders o ON o.id=oo.order_id
        WHERE oo.order_id=n.order_id AND oo.rider_id=rp.id AND oo.status='PENDING'
          AND oo.expires_at>now() AND o.assigned_rider_id IS NULL
          AND rp.is_online AND rp.status='ACTIVE' AND u.status='ACTIVE'
          AND (o.route_distance_meters <= 3000 OR rp.vehicle_type='DIESEL')
          AND (SELECT COALESCE(sum(amount),0) FROM ledger_entries WHERE rider_id=rp.id
            AND direction='RIDER_OWES_PLATFORM' AND status='OPEN') < LEAST(rp.debit_limit_all, 5000)) AS offer_valid
      FROM notifications n JOIN users u ON u.id=n.user_id
      LEFT JOIN rider_profiles rp ON rp.user_id=u.id
      WHERE n.status='PENDING' ORDER BY n.id FOR UPDATE OF n SKIP LOCKED`);
    for (const notification of rows) {
      const riderOffer = notification.type.startsWith("ORDER_OFFERED_");
      if (riderOffer && (!getOrderWindow().isOpen || !notification.offer_valid)) {
        await client.query("UPDATE notifications SET status='CLOSED' WHERE id=$1", [notification.id]);
        continue;
      }
      const room = riderOffer ? `rider:${notification.rider_id}` : "admin";
      if (!io.sockets.adapter.rooms.get(room)?.size) continue;
      if (riderOffer) io.to(room).emit("order.offered", {
        ...notification.payload, orderId: notification.order_id, notificationId: notification.id,
      });
      else io.to(room).emit("admin.alert", {
        id: notification.id, type: notification.type, orderId: notification.order_id,
        payload: notification.payload,
      });
      await client.query("UPDATE notifications SET status='SENT', sent_at=now() WHERE id=$1", [notification.id]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

app.get("/admin/notifications", async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT DISTINCT ON (n.type, n.order_id, n.payload)
      n.id, n.type, n.order_id, n.payload, n.sent_at
      FROM notifications n JOIN users u ON u.id=n.user_id
      WHERE u.role::text IN ('SUPERADMIN','ADMIN','OPERATOR') AND n.status IN ('PENDING','SENT')
        AND (n.type <> 'ORDER_UNASSIGNED_AFTER_ESCALATION' OR EXISTS (
          SELECT 1 FROM orders o WHERE o.id=n.order_id
            AND o.status IN ('CREATED','OFFERED') AND o.assigned_rider_id IS NULL
        ))
      ORDER BY n.type, n.order_id, n.payload, n.sent_at DESC NULLS FIRST LIMIT 50`);
    res.json({ notifications: rows });
  } catch (error) { next(error); }
});

async function processDueOrderDispatches(client: PoolClient) {
  if (!getOrderWindow().isOpen) return;
  const lock = await client.query("SELECT pg_try_advisory_xact_lock(740022) AS locked");
  if (!lock.rows[0].locked) return;
  await client.query(
    "UPDATE order_offers SET status = 'EXPIRED' WHERE status = 'PENDING' AND expires_at <= now()",
  );

  const dueCreated = await client.query(
    `SELECT id
     FROM orders
     WHERE status = 'CREATED'
       AND assigned_rider_id IS NULL
       AND offer_after <= now()
     ORDER BY created_at
     LIMIT 50 FOR UPDATE SKIP LOCKED`,
  );

  for (const order of dueCreated.rows) {
    const riders = await offerBusinessOrderToEligibleRiders(
      client,
      order.id,
      "NEARBY",
    );
    await client.query(
      "INSERT INTO order_status_history (order_id, from_status, to_status, note) VALUES ($1, 'CREATED', 'OFFERED', $2)",
      [
        order.id,
        riders.length > 0
          ? "Offered to riders within 1km of the business"
          : "Waiting 60 seconds before opening to all eligible riders",
      ],
    );
  }

  const dueEscalation = await client.query(
    `SELECT id
     FROM orders
     WHERE status = 'OFFERED'
       AND assigned_rider_id IS NULL
       AND initial_offer_sent_at <= now() - ($1::int * interval '1 second')
       AND escalated_at IS NULL
     ORDER BY initial_offer_sent_at
     LIMIT 50 FOR UPDATE SKIP LOCKED`,
    [offerEscalationSeconds],
  );

  for (const order of dueEscalation.rows) {
    await offerBusinessOrderToEligibleRiders(client, order.id, "ALL");
    await client.query(
      "INSERT INTO order_status_history (order_id, from_status, to_status, note) VALUES ($1, 'OFFERED', 'OFFERED', 'Escalated to all eligible riders after 60 seconds')",
      [order.id],
    );
  }

  // Also reach riders who come online after expansion. Existing pending and
  // rejected offers are excluded, so repeated checks do not resend the offer.
  const expanded = await client.query(`SELECT id FROM orders
    WHERE status='OFFERED' AND assigned_rider_id IS NULL AND escalated_at IS NOT NULL
      AND (last_dispatch_checked_at IS NULL OR last_dispatch_checked_at < now()-interval '5 seconds')
    ORDER BY last_dispatch_checked_at NULLS FIRST LIMIT 50 FOR UPDATE SKIP LOCKED`);
  for (const order of expanded.rows) {
    await offerBusinessOrderToEligibleRiders(client, order.id, "ALL");
  }

  const unassigned = await client.query(
    `UPDATE orders
     SET unassigned_alerted_at = now()
     WHERE status IN ('CREATED', 'OFFERED')
       AND assigned_rider_id IS NULL
       AND escalated_at <= now() - ($1::int * interval '1 second')
       AND unassigned_alerted_at IS NULL
     RETURNING id, code, created_at`,
    [ADMIN_ALERT_DELAY_SECONDS],
  );

  for (const order of unassigned.rows) {
    await createAdminNotification(client, {
      type: "ORDER_UNASSIGNED_AFTER_ESCALATION",
      orderId: order.id,
      payload: {
        orderId: order.id,
        code: order.code,
        message: "Porosia ende nuk eshte pranuar, 60 sekonda pas ofertimit te pergjithshem.",
      },
    });
  }
}

async function refreshOffersForRider(client: PoolClient, riderId: string) {
  const rider = await client.query(
    `SELECT rp.is_online,
            rp.debit_limit_all,
            rp.account_balance_all,
            COALESCE(debt.platform_due, 0)::numeric AS platform_due
     FROM rider_profiles rp
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(le.amount), 0)::numeric AS platform_due
       FROM ledger_entries le
       WHERE le.rider_id = rp.id
         AND le.direction = 'RIDER_OWES_PLATFORM'
         AND le.status = 'OPEN'
     ) debt ON true
     WHERE rp.id = $1
       AND rp.status = 'ACTIVE'`,
    [riderId],
  );
  if (!rider.rows[0]?.is_online) return;
  if (
    !debitEligible(Number(rider.rows[0].platform_due), Number(rider.rows[0].debit_limit_all))
  ) {
    await createAdminNotification(client, {
      type: "RIDER_DEBIT_LIMIT_REACHED",
      payload: {
        riderId,
        platformDue: Number(rider.rows[0].platform_due),
        debitLimitAll: Number(rider.rows[0].debit_limit_all),
      },
    });
    return;
  }

  await processDueOrderDispatches(client);
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
            o.ready_minutes,
            o.route_distance_meters,
            o.route_distance_source,
            o.route_preference,
            o.google_maps_url,
            o.calculated_transport_fee,
            o.transport_fee_overridden,
            o.ring_surcharge_applied,
            o.ring_surcharge_fee,
            o.created_at,
            o.accepted_at,
            o.picked_up_at,
            o.delivered_at,
            b.name AS business_name,
           b.category AS business_category,
            b.category AS business_category,
            b.phone AS business_phone,
            b.address_text AS pickup_address,
            b.lat AS pickup_lat,
            b.lng AS pickup_lng,
            c.name AS customer_name,
            c.phone AS customer_phone,
            a.address_text AS dropoff_address,
            a.lat AS dropoff_lat,
            a.lng AS dropoff_lng,
            CASE WHEN isfinite(oo.expires_at) THEN oo.expires_at ELSE NULL END AS offer_expires_at
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
  const rider = await pool.query(
    `SELECT rp.id,
            rp.user_id,
            u.name,
            u.phone,
            rp.vehicle_type,
            rp.license_number,
            rp.is_online,
            rp.status,
            rp.last_seen_at,
            rp.debit_limit_all,
            rp.account_balance_all,
            COALESCE(debt.platform_due, 0)::numeric AS platform_due
     FROM rider_profiles rp
     JOIN users u ON u.id = rp.user_id
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(le.amount), 0)::numeric AS platform_due
       FROM ledger_entries le
       WHERE le.rider_id = rp.id
         AND le.direction = 'RIDER_OWES_PLATFORM'
         AND le.status = 'OPEN'
     ) debt ON true
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
           o.ready_minutes,
           o.route_distance_meters,
           o.route_distance_source,
           o.route_preference,
           o.google_maps_url,
           o.calculated_transport_fee,
           o.transport_fee_overridden,
           o.ring_surcharge_applied,
           o.ring_surcharge_fee,
           o.created_at,
           o.accepted_at,
           o.picked_up_at,
           o.delivered_at,
           b.name AS business_name,
           b.category AS business_category,
           b.phone AS business_phone,
           b.address_text AS pickup_address,
           b.lat AS pickup_lat,
           b.lng AS pickup_lng,
           c.name AS customer_name,
           c.phone AS customer_phone,
           a.address_text AS dropoff_address,
           a.lat AS dropoff_lat,
           a.lng AS dropoff_lng,
           CASE WHEN isfinite(oo.expires_at) THEN oo.expires_at ELSE NULL END AS offer_expires_at
    FROM orders o
    JOIN businesses b ON b.id = o.business_id
    LEFT JOIN customers c ON c.id = o.customer_id
    JOIN addresses a ON a.id = o.delivery_address_id
    LEFT JOIN order_offers oo ON oo.order_id = o.id AND oo.rider_id = $1`;

  const activeOrder = await pool.query(
    `${orderSelect}
     WHERE o.assigned_rider_id = $1
       AND o.status IN ('ACCEPTED', 'PICKED_UP')
     ORDER BY o.accepted_at ASC, o.id ASC`,
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
           AND (o.route_distance_meters <= 3000 OR rp.vehicle_type='DIESEL')
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
       COALESCE(SUM(o.platform_commission) FILTER (WHERE o.status = 'DELIVERED' AND o.delivered_at >= date_trunc('week', now())), 0) AS week_platform_commission
     FROM orders o
     WHERE o.assigned_rider_id = $1`,
    [riderId],
  );

  const metricRow = metrics.rows[0];

  return {
    operationalWindow: getOrderWindow(),
    operationalDay: isOperationalDay(),
    maxActiveOrders: MAX_ACTIVE_ORDERS,
    rider: mapRiderProfile(rider.rows[0]),
    activeOrders: activeOrder.rows.map(mapRiderOrder),
    activeOrder: activeOrder.rows[0]
      ? mapRiderOrder(activeOrder.rows[0])
      : null,
    pendingOffers: getOrderWindow().isOpen ? pendingOffers.rows.map(mapRiderOrder) : [],
    recentOrders: recentOrders.rows.map(mapRiderOrder),
    metrics: {
      todayDeliveries: Number(metricRow.today_deliveries),
      weekDeliveries: Number(metricRow.week_deliveries),
      todayTransport: Number(metricRow.today_transport),
      todayEarnings: Number(metricRow.today_earnings),
      weekEarnings: Number(metricRow.week_earnings),
      platformDue: Number(rider.rows[0].platform_due),
    },
  };
}

function addressFromGoogleGeocode(
  place: GoogleGeocodeResult,
): AddressSuggestion | null {
  const lat = Number(place.geometry?.location?.lat);
  const lng = Number(place.geometry?.location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const component = (type: string) =>
    place.address_components?.find((item) => item.types.includes(type))
      ?.long_name;
  const label =
    component("route") ??
    component("street_address") ??
    place.formatted_address?.split(",")[0] ??
    "Adrese ne Shqiperi";
  const city =
    component("locality") ??
    component("administrative_area_level_2") ??
    component("administrative_area_level_1") ??
    "Shqiperi";
  const area =
    component("sublocality") ??
    component("neighborhood") ??
    component("administrative_area_level_3") ??
    city;

  return {
    id: `google-${place.place_id ?? `${lat}-${lng}`}`,
    label,
    area,
    city,
    details: place.formatted_address ?? `${label}, ${city}`,
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

async function resolveAddressTextLocation(addressText?: string | null) {
  const query = addressText?.trim();
  if (!query || query.length < 3) return null;

  const cached = await searchCachedAddresses(query, 1);
  if (cached[0]) return cached[0];

  if (googleMapsApiKey) {
    try {
      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      url.searchParams.set("address", query);
      url.searchParams.set("components", "country:AL");
      url.searchParams.set("region", "al");
      url.searchParams.set("key", googleMapsApiKey);

      const response = await fetch(url, {
        headers: googleMapsRequestHeaders,
        signal: AbortSignal.timeout(5000),
      });
      const data = (await response.json()) as {
        results?: GoogleGeocodeResult[];
      };
      const suggestion = data.results
        ?.map(addressFromGoogleGeocode)
        .find((item): item is AddressSuggestion => item !== null);
      if (suggestion) await cacheAddressSuggestion(suggestion);
      return suggestion ?? null;
    } catch {
      return null;
    }
  }

  return null;
}

app.post("/admin/auth/login", async (req, res, next) => {
  try {
    const body = z
      .object({
        email: z.string().trim().email(),
        password: z.string().min(6),
      })
      .parse(req.body);
    const { rows } = await pool.query(
      `SELECT id, name, email, phone, password_hash, role
       FROM users
       WHERE lower(email) = $1
         AND role::text IN ('SUPERADMIN', 'ADMIN', 'OPERATOR')
         AND status = 'ACTIVE'`,
      [body.email.toLowerCase()],
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
       WHERE b.id <> ALL($1::uuid[]) AND b.deleted_at IS NULL
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
       LEFT JOIN businesses b ON b.category = bc.name AND b.id <> ALL($1::uuid[]) AND b.deleted_at IS NULL
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
                 (SELECT COUNT(*)::int FROM businesses b WHERE b.category = business_categories.name AND b.deleted_at IS NULL) AS business_count`,
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
        email: z.string().trim().email(),
        password: z.string().min(6),
        addressText: z.string().min(4),
        googleMapsUrl: businessQuoteSchema.shape.googleMapsUrl,
        lat: z.number().optional().nullable(),
        lng: z.number().optional().nullable(),
        category: z.string().min(2).optional().or(z.literal("")),
        status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
        etaMinutes: z.coerce.number().int().min(1).max(120).optional(),
        coverImageUrl: z.string().optional().or(z.literal("")),
        description: z.string().optional().or(z.literal("")),
      })
      .parse(req.body);
    const location = await resolveGoogleMapsDestination(body.googleMapsUrl, 20000);

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
        body.email.trim().toLowerCase(),
        body.addressText.trim(),
        location.lat,
        location.lng,
        body.status ?? "ACTIVE",
        categoryName,
        body.etaMinutes ?? 25,
        body.coverImageUrl ?? "",
        body.description ?? "",
      ],
    );

    const userResult = await client.query(
      `INSERT INTO users (name, email, phone, password_hash, role, status)
       VALUES ($1, $2, $3, $4, 'BUSINESS', $5)
       RETURNING id`,
      [
        body.name.trim(),
        body.email.trim().toLowerCase(),
        body.phone.trim(),
        hashPassword(body.password),
        body.status ?? "ACTIVE",
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

app.patch("/admin/businesses/:id", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        name: z.string().min(2),
        legalName: z.string().optional().or(z.literal("")),
        phone: z.string().min(6),
        email: z.string().trim().email(),
        addressText: z.string().min(4),
        googleMapsUrl: businessQuoteSchema.shape.googleMapsUrl,
        lat: z.number().optional().nullable(),
        lng: z.number().optional().nullable(),
        category: z.string().min(2).optional().or(z.literal("")),
        status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
        etaMinutes: z.coerce.number().int().min(1).max(120),
        coverImageUrl: z.string().optional().or(z.literal("")),
        description: z.string().optional().or(z.literal("")),
      })
      .parse(req.body);
    const location = await resolveGoogleMapsDestination(body.googleMapsUrl, 20000);
    await client.query("BEGIN");
    const categoryName = body.category?.trim() || "Te tjera";
    await client.query(
      `INSERT INTO business_categories (name, active, sort_order)
       VALUES ($1, true, 50)
       ON CONFLICT (name) DO UPDATE SET active = true, updated_at = now()`,
      [categoryName],
    );
    const updated = await client.query(
      `UPDATE businesses SET name=$2, legal_name=NULLIF($3,''), phone=$4,
       email=NULLIF($5,''), address_text=$6, lat=$7, lng=$8, status=$9,
       category=$10, eta_minutes=$11, cover_image_url=NULLIF($12,''), description=NULLIF($13,'')
       WHERE id=$1 AND deleted_at IS NULL RETURNING id`,
      [
        id,
        body.name.trim(),
        body.legalName ?? "",
        body.phone.trim(),
        body.email.trim().toLowerCase(),
        body.addressText.trim(),
        location.lat,
        location.lng,
        body.status,
        categoryName,
        body.etaMinutes,
        body.coverImageUrl ?? "",
        body.description ?? "",
      ],
    );
    if (!updated.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "BUSINESS_NOT_FOUND" });
      return;
    }
    await client.query(
      `UPDATE users u SET name=$2, email=NULLIF($3,''), phone=$4, status=$5
       FROM business_users bu WHERE bu.business_id=$1 AND bu.user_id=u.id AND bu.is_primary=true`,
      [id, body.name.trim(), body.email.trim().toLowerCase(), body.phone.trim(), body.status],
    );
    const result = await client.query(
      `SELECT b.id, b.name, b.legal_name, b.phone, b.email, b.address_text, b.lat, b.lng,
              b.status, b.category, b.rating, b.eta_minutes, b.cover_image_url, b.description,
              COUNT(DISTINCT o.id)::int AS order_count, 0::int AS product_count
       FROM businesses b LEFT JOIN orders o ON o.business_id=b.id
       WHERE b.id=$1 GROUP BY b.id`,
      [id],
    );
    await client.query("COMMIT");
    io.to("admin").emit("business.updated", { businessId: id });
    res.json({ business: mapAdminBusiness(result.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.patch("/admin/businesses/:id/password", async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { password } = z.object({ password: z.string().min(6) }).parse(req.body);
    const result = await pool.query(
      `UPDATE users u SET password_hash=$2, updated_at=now()
       FROM business_users bu JOIN businesses b ON b.id=bu.business_id
       WHERE b.id=$1 AND b.deleted_at IS NULL AND bu.user_id=u.id AND bu.is_primary=true
       RETURNING u.id`,
      [id, hashPassword(password)],
    );
    if (!result.rowCount) { res.status(404).json({ error: "BUSINESS_NOT_FOUND" }); return; }
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.delete("/admin/businesses/:id", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await client.query("BEGIN");
    const business = await client.query(
      "SELECT id FROM businesses WHERE id=$1 AND deleted_at IS NULL FOR UPDATE", [id],
    );
    if (!business.rowCount) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "BUSINESS_NOT_FOUND" });
      return;
    }
    const active = await client.query(
      "SELECT 1 FROM orders WHERE business_id=$1 AND status IN ('CREATED','OFFERED','ACCEPTED','PICKED_UP') LIMIT 1", [id],
    );
    if (active.rowCount) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "BUSINESS_HAS_ACTIVE_ORDERS" });
      return;
    }
    await client.query(
      "UPDATE businesses SET status='INACTIVE', deleted_at=now(), updated_at=now() WHERE id=$1", [id],
    );
    // A business can have several users; only retire users with no other active business.
    await client.query(`UPDATE users u SET status='INACTIVE', email='deleted-' || u.id::text || '@accounts.invalid',
      phone=NULL, updated_at=now()
      FROM business_users bu WHERE bu.business_id=$1 AND bu.user_id=u.id
        AND NOT EXISTS (SELECT 1 FROM business_users other_link JOIN businesses other_business
          ON other_business.id=other_link.business_id WHERE other_link.user_id=u.id
          AND other_business.id<>$1 AND other_business.deleted_at IS NULL)`, [id]);
    await client.query("COMMIT");
    io.in(`business:${id}`).disconnectSockets(true);
    io.to("admin").emit("business.deleted", { businessId: id });
    res.json({ ok: true });
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
              rp.debit_limit_all,
              rp.account_balance_all, rp.personal_id,
              latest.lat AS last_lat,
              latest.lng AS last_lng,
              COALESCE(debt.platform_due, 0)::numeric AS platform_due,
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
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(le.amount), 0)::numeric AS platform_due
         FROM ledger_entries le
         WHERE le.rider_id = rp.id
           AND le.direction = 'RIDER_OWES_PLATFORM'
           AND le.status = 'OPEN'
       ) debt ON true
       LEFT JOIN orders o ON o.assigned_rider_id = rp.id
       WHERE rp.deleted_at IS NULL
       GROUP BY rp.id, u.id, latest.lat, latest.lng, debt.platform_due
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
        email: z.string().trim().email(),
        password: z.string().min(6),
        vehicleType: z.enum(["ELECTRIC", "DIESEL"]).optional(),
        licenseNumber: z.string().max(40).optional().or(z.literal("")),
        personalId: z.string().max(80).optional().or(z.literal("")),
        status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
      })
      .parse(req.body);

    await client.query("BEGIN");

    const userResult = await client.query(
      `INSERT INTO users (name, email, phone, password_hash, role, status)
       VALUES ($1, $2, $3, $4, 'RIDER', $5)
       RETURNING id`,
      [
        body.name.trim(),
        body.email.trim().toLowerCase(),
        body.phone.trim(),
        hashPassword(body.password),
        body.status ?? "ACTIVE",
      ],
    );

    const riderResult = await client.query(
      `INSERT INTO rider_profiles (user_id, vehicle_type, license_number, is_online, status, personal_id)
       VALUES ($1, $2, NULLIF($3, ''), false, $4, NULLIF($5, ''))
       RETURNING id`,
      [
        userResult.rows[0].id,
        body.vehicleType ?? "ELECTRIC",
        body.licenseNumber ?? "",
        body.status ?? "ACTIVE",
        body.personalId ?? "",
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
              rp.debit_limit_all, rp.account_balance_all, rp.personal_id,
              NULL::numeric AS last_lat,
              NULL::numeric AS last_lng,
              0::numeric AS platform_due,
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

app.patch("/admin/riders/:id", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        name: z.string().min(2),
        phone: z.string().min(6),
        email: z.string().trim().email(),
        vehicleType: z.enum(["ELECTRIC", "DIESEL"]),
        licenseNumber: z.string().max(40).optional().or(z.literal("")),
        personalId: z.string().max(80).optional().or(z.literal("")),
        status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
      })
      .parse(req.body);
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE rider_profiles rp SET vehicle_type=$2, license_number=NULLIF($3,''), personal_id=NULLIF($5,''),
       status=$4::rider_status,
       is_online=CASE WHEN $4::rider_status <> 'ACTIVE'::rider_status THEN false ELSE rp.is_online END
       WHERE rp.id=$1 AND rp.deleted_at IS NULL RETURNING rp.user_id`,
      [id, body.vehicleType, body.licenseNumber ?? "", body.status, body.personalId ?? ""],
    );
    if (!updated.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "RIDER_NOT_FOUND" });
      return;
    }
    await client.query(
      `UPDATE users SET name=$2, phone=$3, email=NULLIF($4,''), status=$5 WHERE id=$1`,
      [
        updated.rows[0].user_id,
        body.name.trim(),
        body.phone.trim(),
        body.email.trim().toLowerCase(),
        body.status,
      ],
    );
    const result = await client.query(
      `SELECT rp.id, rp.user_id, u.name, u.phone, u.email, rp.vehicle_type,
              rp.license_number, rp.is_online, rp.status, rp.last_seen_at, rp.debit_limit_all, rp.account_balance_all, rp.personal_id,
              NULL::numeric AS last_lat, NULL::numeric AS last_lng, 0::numeric AS platform_due,
              0::int AS deliveries_today
       FROM rider_profiles rp JOIN users u ON u.id=rp.user_id WHERE rp.id=$1`,
      [id],
    );
    await client.query("COMMIT");
    io.to("admin").emit("rider.updated", { riderId: id });
    res.json({ rider: mapAdminRider(result.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.patch("/admin/riders/:id/password", async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { password } = z.object({ password: z.string().min(6) }).parse(req.body);
    const result = await pool.query(
      `UPDATE users u SET password_hash=$2, updated_at=now()
       FROM rider_profiles rp
       WHERE rp.id=$1 AND rp.deleted_at IS NULL AND rp.user_id=u.id RETURNING u.id`,
      [id, hashPassword(password)],
    );
    if (!result.rowCount) { res.status(404).json({ error: "RIDER_NOT_FOUND" }); return; }
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.delete("/admin/riders/:id", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await client.query("BEGIN");
    const rider = await client.query(
      "SELECT id, user_id FROM rider_profiles WHERE id=$1 AND deleted_at IS NULL FOR UPDATE", [id],
    );
    if (!rider.rowCount) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "RIDER_NOT_FOUND" });
      return;
    }
    const active = await client.query(
      "SELECT 1 FROM orders WHERE assigned_rider_id=$1 AND status IN ('ACCEPTED','PICKED_UP') LIMIT 1", [id],
    );
    if (active.rowCount) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "RIDER_HAS_ACTIVE_ORDERS" });
      return;
    }
    await client.query(`UPDATE rider_profiles SET status='INACTIVE', is_online=false,
      deleted_at=now(), updated_at=now() WHERE id=$1`, [id]);
    await client.query(`UPDATE users SET status='INACTIVE',
      email='deleted-' || id::text || '@accounts.invalid', phone=NULL, updated_at=now()
      WHERE id=$1`, [rider.rows[0].user_id]);
    await client.query(
      "UPDATE order_offers SET status='CANCELLED', responded_at=now() WHERE rider_id=$1 AND status='PENDING'", [id],
    );
    await client.query(`UPDATE notifications SET status='CLOSED' WHERE user_id=$1
      AND type LIKE 'ORDER_OFFERED_%' AND status IN ('PENDING','SENT')`, [rider.rows[0].user_id]);
    await client.query("COMMIT");
    io.in(`rider:${id}`).disconnectSockets(true);
    io.to("admin").emit("rider.deleted", { riderId: id });
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.patch("/admin/riders/:id/account-balance",requireAdmin,async(req,res,next)=>{
 const client=await pool.connect();
 try {
  const {id}=z.object({id:z.string().uuid()}).parse(req.params);
  const {balance}=z.object({balance:z.number().finite().min(0).max(5000).multipleOf(0.01)}).parse(req.body);
  await client.query("BEGIN");
  const locked=await client.query("SELECT account_balance_all FROM rider_profiles WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[id]);
  if(!locked.rowCount){await client.query("ROLLBACK");res.status(404).json({error:"RIDER_NOT_FOUND"});return;}
  const current=Number(locked.rows[0].account_balance_all);
  if(balance>current){await client.query("ROLLBACK");res.status(409).json({error:"BALANCE_CAN_ONLY_DECREASE_AT_PAYOUT"});return;}
  const withdrawal=Number((current-balance).toFixed(2));
  if(withdrawal>0){
   await client.query("UPDATE rider_profiles SET account_balance_all=$2 WHERE id=$1",[id,balance]);
   await client.query("INSERT INTO ledger_entries(rider_id,entry_type,amount,direction,status) VALUES($1,'RIDER_PAYOUT',$2,'RIDER_EARNS','PAID')",[id,withdrawal]);
  }
  await client.query("COMMIT");
  io.to("admin").emit("rider.balance_changed",{riderId:id,balance});
  io.to(`rider:${id}`).emit("rider.balance_changed",{balance});
  res.json({balance,withdrawal});
 }catch(e){await client.query("ROLLBACK");next(e);}finally{client.release();}
});

app.get("/admin/zones", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id,
              name,
              city,
              transport_fee,
              is_surcharge_area,
              surcharge_fee,
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

const zoneSchema = z.object({
  name: z.string().trim().min(2).max(150),
  city: z.string().trim().max(100).optional(),
  isSurchargeArea: z.boolean().default(false),
  active: z.boolean().default(true),
  points: z
    .array(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      }),
    )
    .min(3)
    .max(500),
});

async function saveZone(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  try {
    const body = zoneSchema.parse(req.body);
    const id = req.params.id ? z.string().uuid().parse(req.params.id) : null;
    const points = [...body.points];
    const first = points[0],
      last = points[points.length - 1];
    if (first.lat !== last.lat || first.lng !== last.lng) points.push(first);
    const geometry = JSON.stringify({
      type: "Polygon",
      coordinates: [points.map((p) => [p.lng, p.lat])],
    });
    const valid = await pool.query(
      "SELECT ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)) AS valid",
      [geometry],
    );
    if (!valid.rows[0]?.valid) {
      res.status(422).json({ error: "INVALID_ZONE_POLYGON" });
      return;
    }
    const values = [
      body.name,
      body.city || "Tirana",
      geometry,
      body.isSurchargeArea,
      body.active,
    ];
    const returning =
      "RETURNING id, name, city, transport_fee, is_surcharge_area, surcharge_fee, active, created_at, ST_AsGeoJSON(polygon)::json AS geometry";
    const result = id
      ? await pool.query(
          `UPDATE zones SET name=$1, city=$2, polygon=ST_SetSRID(ST_GeomFromGeoJSON($3),4326),
          is_surcharge_area=$4, active=$5, transport_fee=300, surcharge_fee=100 WHERE id=$6 ${returning}`,
          [...values, id],
        )
      : await pool.query(
          `INSERT INTO zones (name, city, polygon, is_surcharge_area, active, transport_fee, surcharge_fee)
          VALUES ($1,$2,ST_SetSRID(ST_GeomFromGeoJSON($3),4326),$4,$5,300,100) ${returning}`,
          values,
        );
    if (!result.rows[0]) {
      res.status(404).json({ error: "ZONE_NOT_FOUND" });
      return;
    }
    io.to("admin").emit(id ? "zone.updated" : "zone.created", {
      zoneId: result.rows[0].id,
    });
    res.status(id ? 200 : 201).json({ zone: mapAdminZone(result.rows[0]) });
  } catch (error) {
    next(error);
  }
}
// Zone boundaries are managed by reviewed deployment data, not the admin form.
app.use("/admin/zones", (req,res,next)=>{
  if (["POST","PATCH","DELETE","PUT"].includes(req.method)) { res.status(405).json({error:"ZONES_READ_ONLY"}); return; }
  next();
});
app.post("/admin/zones", saveZone);
app.patch("/admin/zones/:id", saveZone);

app.delete("/admin/zones/:id", async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await client.query("BEGIN");

    const zoneResult = await client.query(
      `SELECT z.id,
              EXISTS (SELECT 1 FROM orders o WHERE o.zone_id = z.id) AS has_orders
       FROM zones z
       WHERE z.id = $1
       FOR UPDATE`,
      [id],
    );
    const zone = zoneResult.rows[0];

    if (!zone) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "ZONE_NOT_FOUND" });
      return;
    }

    if (zone.has_orders) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "ZONE_HAS_ORDERS" });
      return;
    }

    await client.query("DELETE FROM zones WHERE id = $1", [id]);
    await client.query("COMMIT");

    io.to("admin").emit("zone.deleted", { zoneId: id });
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
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
              latest.lat AS last_lat,
              latest.lng AS last_lng,
              latest.accuracy_meters AS gps_accuracy, latest.recorded_at AS gps_recorded_at,
              COUNT(o.id) FILTER (WHERE o.status = 'DELIVERED' AND o.delivered_at >= date_trunc('day', now()))::int AS deliveries_today
       FROM rider_profiles rp
       JOIN users u ON u.id = rp.user_id
       LEFT JOIN LATERAL (
         SELECT rl.lat, rl.lng, rl.accuracy_meters, rl.recorded_at
         FROM rider_locations rl
         WHERE rl.rider_id = rp.id
         ORDER BY rl.recorded_at DESC
         LIMIT 1
       ) latest ON true
       LEFT JOIN orders o ON o.assigned_rider_id = rp.id
       WHERE rp.status = 'ACTIVE'
       GROUP BY rp.id, u.id, latest.lat, latest.lng, latest.accuracy_meters, latest.recorded_at
       ORDER BY rp.is_online DESC, rp.last_seen_at DESC NULLS LAST
       LIMIT 40`,
    );

    const orders = await pool.query(
      `SELECT o.id,
              o.code,
              o.status,
              o.total_amount,
              b.name AS business_name,
              o.business_id,
              b.category AS business_category,
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
        businessId: row.business_id,
    businessCategory: row.business_category ?? null,
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
      if (!googleMapsApiKey) {
        res.json({ suggestions: cached });
        return;
      }

      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      url.searchParams.set("address", query);
      url.searchParams.set("components", "country:AL");
      url.searchParams.set("region", "al");
      url.searchParams.set("key", googleMapsApiKey);

      const response = await fetch(url, {
        headers: googleMapsRequestHeaders,
        signal: AbortSignal.timeout(5000),
      });
      const data = (await response.json()) as {
        results?: GoogleGeocodeResult[];
      };
      const remote =
        data.results
          ?.map(addressFromGoogleGeocode)
          .filter((item): item is AddressSuggestion => item !== null) ?? [];
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
        lat: z.coerce.number().min(-90).max(90),
        lng: z.coerce.number().min(-180).max(180),
      })
      .parse(req.query);

    if (googleMapsApiKey) {
      try {
        const url = new URL(
          "https://maps.googleapis.com/maps/api/geocode/json",
        );
        url.searchParams.set("latlng", `${params.lat},${params.lng}`);
        url.searchParams.set("region", "al");
        url.searchParams.set("key", googleMapsApiKey);

        const response = await fetch(url, {
          headers: googleMapsRequestHeaders,
          signal: AbortSignal.timeout(5000),
        });
        const data = (await response.json()) as {
          results?: GoogleGeocodeResult[];
        };
        const suggestion = data.results
          ?.map(addressFromGoogleGeocode)
          .find((item): item is AddressSuggestion => item !== null);
        if (suggestion) {
          await cacheAddressSuggestion(suggestion);
          res.json({ address: suggestion });
          return;
        }
      } catch {
        // No address is preferable to an unrelated cached street.
      }
    }

    res.json({ address: null });
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

    if (googleMapsApiKey) {
      try {
        const route = await getRouteDistanceMeters({
          originLat: params.fromLat,
          originLng: params.fromLng,
          destinationLat: params.toLat,
          destinationLng: params.toLng,
        });
        const coordinates = route.encodedPolyline
          ? decodeGooglePolyline(route.encodedPolyline)
          : [];
        if (coordinates.length > 1) {
          res.json({
            durationSeconds: route.durationSeconds,
            distanceMeters: route.distanceMeters,
            coordinates,
          });
          return;
        }
      } catch {
        // Fall through to the local preview below when Google is unavailable.
      }
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
        email: z.string().trim().email(),
        password: z.string().min(6),
      })
      .parse(req.body);
    const { rows } = await pool.query(
      `SELECT b.id AS business_id,
              b.name AS business_name,
            b.category AS business_category,
              b.legal_name,
              b.phone,
              b.email,
              b.status,
              u.id AS user_id,
              u.name AS user_name,
              u.status AS user_status,
              u.password_hash
       FROM users u
       JOIN business_users bu ON bu.user_id = u.id
       JOIN businesses b ON b.id = bu.business_id
       WHERE u.role = 'BUSINESS'
         AND b.deleted_at IS NULL
         AND b.id <> ALL($2::uuid[])
         AND (lower(u.email) = $1 OR lower(b.email) = $1)
       ORDER BY bu.is_primary DESC
       LIMIT 1`,
      [body.email.trim().toLowerCase(), sampleBusinessIds],
    );

    if (!rows[0] || !verifyPassword(body.password, rows[0].password_hash)) {
      res.status(401).json({ error: "INVALID_BUSINESS_LOGIN" });
      return;
    }

    if (rows[0].status !== "ACTIVE" || rows[0].user_status !== "ACTIVE") {
      const suspended = rows[0].status === "SUSPENDED" || rows[0].user_status === "SUSPENDED";
      res.status(403).json({ error: suspended ? "BUSINESS_SUSPENDED" : "BUSINESS_INACTIVE" });
      return;
    }

    res.json({ business: { ...mapBusinessSession(rows[0]), token: signAccountToken(String(rows[0].business_id), "BUSINESS") } });
  } catch (error) {
    next(error);
  }
});

app.post("/riders/auth/login", async (req, res, next) => {
  try {
    const body = z
      .object({ email: z.string().trim().email(), password: z.string().min(4) })
      .parse(req.body);
    const { rows } = await pool.query(
      `SELECT rp.id,
              rp.user_id,
              u.name,
              u.phone,
              u.password_hash,
              u.status AS user_status,
              rp.vehicle_type,
              rp.license_number,
              rp.is_online,
              rp.status,
              rp.last_seen_at
       FROM users u
       JOIN rider_profiles rp ON rp.user_id = u.id
       WHERE lower(u.email) = $1
         AND u.role = 'RIDER'
         AND rp.deleted_at IS NULL`,
      [body.email.trim().toLowerCase()],
    );

    if (!rows[0] || !verifyPassword(body.password, rows[0].password_hash)) {
      res.status(401).json({ error: "INVALID_RIDER_LOGIN" });
      return;
    }

    if (rows[0].status !== "ACTIVE" || rows[0].user_status !== "ACTIVE") {
      const suspended = rows[0].status === "SUSPENDED" || rows[0].user_status === "SUSPENDED";
      res.status(403).json({ error: suspended ? "RIDER_SUSPENDED" : "RIDER_INACTIVE" });
      return;
    }

    res.json({ rider: { ...mapRiderProfile(rows[0]), token: signAccountToken(String(rows[0].id), "RIDER") } });
  } catch (error) {
    next(error);
  }
});

app.get("/riders/:id/dashboard", async (req, res, next) => {
  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const dashboard = await buildRiderDashboard(params.id);
    res.json(dashboard);
    void runDispatchLoop();
  } catch (error) {
    next(error);
  }
});

app.post("/riders/:id/availability", async (req, res, next) => {
  const client = await pool.connect();
  let committed = false;

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
    }

    await client.query("COMMIT");
    committed = true;

    const dashboard = await buildRiderDashboard(params.id);
    res.json(dashboard);
    if (body.isOnline) void runDispatchLoop();
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
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

    const businessRow = business.rows[0];
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
              o.ready_minutes,
              o.route_distance_meters,
              o.route_distance_source,
              o.route_preference,
              o.google_maps_url,
              o.calculated_transport_fee,
              o.transport_fee_overridden,
              o.ring_surcharge_applied,
              o.ring_surcharge_fee,
              o.created_at,
              c.name AS customer_name,
              c.phone AS customer_phone,
              a.address_text AS delivery_address,
              u.name AS rider_name,
              COUNT(oo.id)::int AS offered_rider_count
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

    const mapLat = Number(businessRow.lat);
    const mapLng = Number(businessRow.lng);
    res.json({
      business: {
        id: businessRow.id,
        name: businessRow.name,
        legalName: businessRow.legal_name,
        phone: businessRow.phone,
        email: businessRow.email,
        addressText: businessRow.address_text,
        lat:
          Number.isFinite(mapLat) && Math.abs(mapLat) > 0.0001
            ? mapLat
            : 41.3275,
        lng:
          Number.isFinite(mapLng) && Math.abs(mapLng) > 0.0001
            ? mapLng
            : 19.8187,
        status: businessRow.status,
        category: businessRow.category,
        rating: Number(businessRow.rating),
        etaMinutes: Number(businessRow.eta_minutes),
        coverImageUrl: businessRow.cover_image_url,
        description: businessRow.description,
      },
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

app.post("/businesses/:id/orders/location", orderingHours, async (req, res, next) => {
  try {
    const { googleMapsUrl } = businessQuoteSchema.parse(req.body);
    const location = await resolveGoogleMapsDestination(googleMapsUrl);
    const coverage = await pool.query(`SELECT id FROM zones WHERE active=true AND is_surcharge_area=false
      AND ST_Covers(polygon,ST_SetSRID(ST_MakePoint($1,$2),4326)) LIMIT 1`, [location.lng,location.lat]);
    if (!coverage.rowCount) throw new Error("DELIVERY_ZONE_NOT_FOUND");
    assertOrderingOpen();
    res.json({location});
  } catch (error) { next(error); }
});

app.post("/businesses/:id/orders/quote", orderingHours, async (req, res, next) => {
  const client = await pool.connect();

  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = businessQuoteSchema.parse(req.body);

    const mapsLocation = await resolveGoogleMapsDestination(body.googleMapsUrl, 20000);
    const deliveryLat = mapsLocation.lat, deliveryLng = mapsLocation.lng;
    const quote = await calculateBusinessTransportQuote(client, {
      businessId: params.id,
      lat: deliveryLat as number,
      lng: deliveryLng as number,
      googleMapsUrl: body.googleMapsUrl,

    });

    assertOrderingOpen();
    res.json({
      quote: {
        ...quote,
        lat: deliveryLat,
        lng: deliveryLng,
        addressText:
          mapsLocation.addressText,
      },
    });
  } catch (error) {
    next(error);
  } finally {
    client.release();
  }
});

async function createBusinessOrder(req: express.Request, res: express.Response, next: express.NextFunction) {
  const client = await pool.connect();

  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = businessOrderSchema.parse(req.body);

    const mapsLocation = await resolveGoogleMapsDestination(body.googleMapsUrl, 20000);
    const deliveryLat = mapsLocation.lat, deliveryLng = mapsLocation.lng;
    const addressText = mapsLocation.addressText;

    await client.query("BEGIN");

    const quote = await calculateBusinessTransportQuote(client, {
      businessId: params.id,
      lat: deliveryLat as number,
      lng: deliveryLng as number,
      googleMapsUrl: body.googleMapsUrl,

    });

    const productValue = body.orderValue;
    const productDescription = body.productDescription ?? "";
    assertOrderingOpen();
    const transportFee = quote.finalTransportFee;
    const platformCommission = Number((transportFee * 0.2).toFixed(2));
    const riderEarning = Number((transportFee - platformCommission).toFixed(2));
    const totalAmount = Number((productValue + transportFee).toFixed(2));
    const readyMinutes = body.readyMinutes;
    const notificationDelayMinutes = firstOfferDelayMinutes(readyMinutes);
    const offerAfter = new Date(Date.now() + notificationDelayMinutes * 60_000);

    const customerResult = await client.query(
      `INSERT INTO customers (name, phone)
       VALUES ($1, $2)
       RETURNING id`,
      [body.customerName?.trim() || null, body.customerPhone.trim()],
    );

    const addressResult = await client.query(
      `INSERT INTO addresses (customer_id, zone_id, label, address_text, lat, lng)
       VALUES ($1, $2, 'Dorezim', $3, $4, $5)
       RETURNING id`,
      [
        customerResult.rows[0].id,
        quote.zoneId,
        addressText,
        deliveryLat,
        deliveryLng,
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
        status,
        ready_minutes,
        offer_after,
        route_distance_meters,
        route_distance_source,
        route_preference,
        google_maps_url,
        calculated_transport_fee,
        transport_fee_overridden,
        ring_surcharge_applied,
        ring_surcharge_fee,
        offer_scope
      )
      VALUES (
        'HTC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'CREATED',
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 'PENDING'
      )
      RETURNING *`,
      [
        params.id,
        customerResult.rows[0].id,
        addressResult.rows[0].id,
        quote.zoneId,
        productDescription,
        productValue,
        transportFee,
        totalAmount,
        platformCommission,
        riderEarning,
        readyMinutes,
        offerAfter,
        quote.distanceMeters,
        quote.distanceSource,
        quote.routePreference,
        quote.googleMapsUrl,
        quote.calculatedTransportFee,
        quote.transportFeeOverridden,
        quote.ringSurchargeApplied,
        quote.ringSurchargeFee,
      ],
    );

    await client.query(
      "INSERT INTO order_status_history (order_id, to_status, note) VALUES ($1, 'CREATED', 'Created by business dashboard')",
      [orderResult.rows[0].id],
    );

    const offeredRiders: Array<{id:string;name:string;distanceMeters:number|null;vehicleType:string}> = [];
    // All orders enter the queue. The dispatcher is the sole owner of offers.

    assertOrderingOpen();
    await client.query("COMMIT");

    const order = await getBusinessDashboardOrderById(
      orderResult.rows[0].id,
      params.id,
    );
    io.to("admin").emit("order.created", order);
    io.to(`business:${params.id}`).emit("order.created", order);

    res.status(201).json({
      order,
      offeredRiders,
      dispatchScheduledFor: offerAfter.toISOString(),
      quote,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
}
app.post("/businesses/:id/orders", orderingHours, createBusinessOrder);

app.patch(
  "/businesses/:id/orders/:orderId/decision",
  async (req, res, next) => {
    const client = await pool.connect();

    try {
      const params = z
        .object({ id: z.string().uuid(), orderId: z.string().uuid() })
        .parse(req.params);
      const body = z
        .object({ action: z.literal("CONFIRM") })
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
      if (order.status === "CREATED") {
        const offeredRiders = await offerBusinessOrderToEligibleRiders(
          client,
          params.orderId,
          "NEARBY",
        );
        await client.query(
          "INSERT INTO order_status_history (order_id, from_status, to_status, note) VALUES ($1, 'CREATED', 'OFFERED', 'Confirmed by business')",
          [params.orderId],
        );
        io.to("admin").emit("order.offered", {
          orderId: params.orderId,
          riderIds: offeredRiders.map((rider) => rider.id),
          expiresAt: new Date(
            Date.now() + offerEscalationSeconds * 1000,
          ).toISOString(),
        });
        for (const rider of offeredRiders)
          io.to(`rider:${rider.id}`).emit("order.offered", {
            orderId: params.orderId,
            message: "Ke nje porosi te re brenda 1km.",
            distanceMeters: rider.distanceMeters,
          });
      }

      await client.query("COMMIT");
      const updated = await getRiderOrderById(params.orderId);
      io.to("admin").emit("order.status_changed", {
        orderId: params.orderId,
        status: updated?.status,
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

app.post("/public/orders", orderingHours, (req, res, next) => {
  req.params.id = req.body.businessId;
  return createBusinessOrder(req, res, next);
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
           b.category AS business_category,
            b.category AS business_category,
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
           b.category AS business_category,
            b.category AS business_category,
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

app.post("/riders/:id/itinerary", async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    if (req.header("x-rider-id") !== id) {
      res.status(403).json({ error: "RIDER_NOT_AUTHORIZED" });
      return;
    }
    const origin = z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .parse(req.body);
    const dashboard = await buildRiderDashboard(id);
    const orders = dashboard.activeOrders.map((order) => ({
      id: String(order.id),
      code: String(order.code),
      status: String(order.status),
      businessName: String(order.businessName),
      pickupAddress: String(order.pickupAddress),
      pickupLat: order.pickupLat,
      pickupLng: order.pickupLng,
      dropoffAddress: String(order.dropoffAddress),
      dropoffLat: order.dropoffLat,
      dropoffLng: order.dropoffLng,
    }));
    const route = await buildItinerary(googleMapsApiKey, origin, orders);
    res.json({
      ...route,
      coordinates: route.encodedPolyline
        ? decodeGooglePolyline(route.encodedPolyline)
        : [],
    });
  } catch (error) {
    next(error);
  }
});

app.post("/orders/:id/accept", orderingHours, async (req, res, next) => {
  const client = await pool.connect();

  try {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ riderId: z.string().uuid() }).parse(req.body);
    const rider = await client.query(
      `SELECT rp.is_online,
              rp.debit_limit_all,
            rp.account_balance_all,
              COALESCE(debt.platform_due, 0)::numeric AS platform_due
       FROM rider_profiles rp
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(le.amount), 0)::numeric AS platform_due
         FROM ledger_entries le
         WHERE le.rider_id = rp.id
           AND le.direction = 'RIDER_OWES_PLATFORM'
           AND le.status = 'OPEN'
       ) debt ON true
       WHERE rp.id = $1
         AND rp.status = 'ACTIVE'`,
      [body.riderId],
    );

    if (!rider.rows[0]?.is_online) {
      res.status(403).json({ error: "RIDER_MUST_BE_ONLINE_TO_ACCEPT" });
      return;
    }
    if (
      !debitEligible(Number(rider.rows[0].platform_due), Number(rider.rows[0].debit_limit_all))
    ) {
      await createAdminNotification(client, {
        type: "RIDER_DEBIT_LIMIT_REACHED",
        payload: {
          riderId: body.riderId,
          platformDue: Number(rider.rows[0].platform_due),
          debitLimitAll: Number(rider.rows[0].debit_limit_all),
        },
      });
      res.status(403).json({ error: "RIDER_DEBIT_LIMIT_REACHED" });
      return;
    }

    await client.query("BEGIN");
    await client.query(
      "SELECT id FROM rider_profiles WHERE id = $1 FOR UPDATE",
      [body.riderId],
    );
    const capacity = await client.query(
      "SELECT COUNT(*)::int AS count FROM orders WHERE assigned_rider_id = $1 AND status IN ('ACCEPTED', 'PICKED_UP')",
      [body.riderId],
    );
    if (capacity.rows[0].count >= MAX_ACTIVE_ORDERS)
      throw new Error("RIDER_ORDER_CAPACITY_REACHED");
    await assertRiderEligible(client, body.riderId, params.id, googleMapsApiKey);
    assertOrderingOpen();
    const { rows } = await client.query(
      "SELECT * FROM accept_order_atomic($1, $2)",
      [params.id, body.riderId],
    );
    await client.query(
      "UPDATE notifications SET status='CLOSED' WHERE order_id=$1 AND type='ORDER_UNASSIGNED_AFTER_ESCALATION' AND status IN ('PENDING','SENT')",
      [params.id],
    );
    await client.query("COMMIT");

    io.to("admin").emit("order.accepted", {
      orderId: params.id,
      riderId: body.riderId,
    });
    io.emit("order.accepted", { orderId: params.id });
    const order = await getRiderOrderById(params.id, body.riderId);
    res.json(order ?? rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.get("/admin/orders", requireAdmin, async (req, res, next) => {
  try {
    const query = z.object({
      q: z.string().max(100).optional(),
      status: z.enum(["CREATED", "OFFERED", "ACCEPTED", "PICKED_UP", "DELIVERED", "CANCELLED"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
    }).parse(req.query);
    const search = `%${(query.q ?? "").trim()}%`;
    const where = `o.business_id <> ALL($1::uuid[])
      AND ($2::text IS NULL OR o.status::text = $2)
      AND (o.code ILIKE $3 OR b.name ILIKE $3 OR COALESCE(c.name,'') ILIKE $3)`;
    const params = [sampleBusinessIds, query.status ?? null, search];
    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM orders o
      JOIN businesses b ON b.id=o.business_id LEFT JOIN customers c ON c.id=o.customer_id
      WHERE ${where}`, params);
    const result = await pool.query(`SELECT o.id,o.code,o.status,o.created_at,o.escalated_at,o.assigned_rider_id,o.product_value,o.route_distance_meters,
      (o.escalated_at <= now()-interval '60 seconds') AS manual_assignment_ready,
      o.transport_fee,o.total_amount,o.rider_earning,o.business_id,b.name AS business_name,
      c.name AS customer_name,a.address_text AS dropoff_address
      FROM orders o JOIN businesses b ON b.id=o.business_id
      LEFT JOIN customers c ON c.id=o.customer_id
      JOIN addresses a ON a.id=o.delivery_address_id
      WHERE ${where} ORDER BY o.created_at DESC,o.id DESC LIMIT 50 OFFSET $4`,
      [...params, (query.page - 1) * 50]);
    res.json({ total: count.rows[0].total, page: query.page, orders: result.rows.map(row => ({
      id: row.id, code: row.code, status: row.status, createdAt: row.created_at,
      escalatedAt: row.escalated_at, assignedRiderId: row.assigned_rider_id,
      manualAssignmentReady: row.manual_assignment_ready === true,
      routeDistanceMeters: Number(row.route_distance_meters),
      productValue: Number(row.product_value), transportFee: Number(row.transport_fee),
      totalAmount: Number(row.total_amount), riderEarning: Number(row.rider_earning),
      businessId: row.business_id, businessName: row.business_name,
      customerName: row.customer_name, dropoffAddress: row.dropoff_address,
    })) });
  } catch (error) { next(error); }
});

app.post("/admin/orders/:id/assign", requireAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { riderId } = z.object({ riderId: z.string().uuid() }).parse(req.body);
    await client.query("BEGIN");
    const rider = await client.query(
      "SELECT id FROM rider_profiles WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
      [riderId],
    );
    if (!rider.rowCount) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "RIDER_NOT_FOUND" });
      return;
    }
    const result = await client.query(
      "SELECT id, business_id, status, escalated_at, assigned_rider_id, (escalated_at <= now()-interval '60 seconds') AS manual_assignment_ready FROM orders WHERE id=$1",
      [id],
    );
    const order = result.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "ORDER_NOT_FOUND" });
      return;
    }
    if (order.status !== "OFFERED" || order.assigned_rider_id || !order.manual_assignment_ready) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "MANUAL_ASSIGNMENT_NOT_AVAILABLE" });
      return;
    }
    await assertRiderEligible(client, riderId, id, googleMapsApiKey);
    await client.query(
      `INSERT INTO order_offers(order_id, rider_id, status, expires_at)
       VALUES($1,$2,'PENDING',now()+interval '5 minutes')
       ON CONFLICT(order_id,rider_id) DO UPDATE
       SET status='PENDING',sent_at=now(),responded_at=NULL,expires_at=EXCLUDED.expires_at`,
      [id, riderId],
    );
    await client.query("SELECT * FROM accept_order_atomic($1,$2)", [id, riderId]);
    await client.query(
      "UPDATE order_status_history SET note='Assigned by admin after escalation' WHERE id=(SELECT id FROM order_status_history WHERE order_id=$1 AND to_status='ACCEPTED' ORDER BY created_at DESC,id DESC LIMIT 1)",
      [id],
    );
    await client.query(
      "UPDATE notifications SET status='CLOSED' WHERE order_id=$1 AND type='ORDER_UNASSIGNED_AFTER_ESCALATION' AND status IN ('PENDING','SENT')",
      [id],
    );
    await client.query("COMMIT");
    io.to("admin").emit("order.accepted", { orderId: id, riderId });
    io.to(`rider:${riderId}`).emit("order.accepted", { orderId: id, riderId });
    io.to(`business:${order.business_id}`).emit("order.accepted", { orderId: id, riderId });
    res.json({ ok: true, orderId: id, riderId });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.get("/admin/businesses/:id/orders", requireAdmin, async(req,res,next)=>{
  try {
    const {id}=z.object({id:z.string().uuid()}).parse(req.params);
    const business=await pool.query("SELECT id,name,category FROM businesses WHERE id=$1",[id]);
    if(!business.rowCount){res.status(404).json({error:"BUSINESS_NOT_FOUND"});return;}
    const orders=await pool.query(`SELECT o.id,o.code,o.status,o.created_at,o.product_value,o.transport_fee,o.total_amount,
      o.rider_earning,a.address_text AS dropoff_address
      FROM orders o JOIN addresses a ON a.id=o.delivery_address_id
      WHERE o.business_id=$1 ORDER BY o.created_at DESC LIMIT 200`,[id]);
    res.json({business:business.rows[0],orders:orders.rows.map(row=>({
      id:row.id,code:row.code,status:row.status,createdAt:row.created_at,
      productValue:Number(row.product_value),transportFee:Number(row.transport_fee),
      totalAmount:Number(row.total_amount),riderEarning:Number(row.rider_earning),
      dropoffAddress:row.dropoff_address
    }))});
  }catch(error){next(error);}
});

app.patch("/admin/orders/:id/cancel", requireAdmin, async(req,res,next)=>{
 const client=await pool.connect();
 try {
  const {id}=z.object({id:z.string().uuid()}).parse(req.params);
  await client.query("BEGIN");
  const locked=await client.query("SELECT id,business_id,status,assigned_rider_id FROM orders WHERE id=$1 FOR UPDATE",[id]);
  const order=locked.rows[0];
  if(!order){await client.query("ROLLBACK");res.status(404).json({error:"ORDER_NOT_FOUND"});return;}
  if(order.status==='DELIVERED'||order.status==='CANCELLED'){await client.query("ROLLBACK");res.status(409).json({error:"ORDER_CANNOT_BE_CANCELLED"});return;}
  await client.query("UPDATE orders SET status='CANCELLED',cancelled_at=now(),version=version+1 WHERE id=$1",[id]);
  await client.query("UPDATE order_offers SET status='CANCELLED',responded_at=now() WHERE order_id=$1 AND status='PENDING'",[id]);
  await client.query("UPDATE notifications SET status='CLOSED' WHERE order_id=$1 AND status IN ('PENDING','SENT')",[id]);
  await client.query("INSERT INTO order_status_history(order_id,from_status,to_status,note) VALUES($1,$2,'CANCELLED','Cancelled by admin')",[id,order.status]);
  await client.query("COMMIT");
  io.to("admin").emit("order.status_changed",{orderId:id,status:"CANCELLED"});
  io.to(`business:${order.business_id}`).emit("order.status_changed",{orderId:id,status:"CANCELLED"});
  if(order.assigned_rider_id) io.to(`rider:${order.assigned_rider_id}`).emit("order.status_changed",{orderId:id,status:"CANCELLED"});
  res.json({ok:true});
 } catch(e){await client.query("ROLLBACK");next(e);} finally{client.release();}
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
        status: z.enum(["PICKED_UP", "DELIVERED"]),
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
        (nextStatus === "PICKED_UP")) ||
      (order.status === "PICKED_UP" &&
        (nextStatus === "DELIVERED"));

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
          : "delivered_at";
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
      await client.query("SELECT id FROM rider_profiles WHERE id=$1 FOR UPDATE",[body.riderId]);
      await client.query("UPDATE rider_profiles SET account_balance_all=account_balance_all+$2 WHERE id=$1",[body.riderId,order.rider_earning]);
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

      const debt = await client.query(
        `SELECT rp.debit_limit_all,
                COALESCE(SUM(le.amount), 0)::numeric AS platform_due
         FROM rider_profiles rp
         LEFT JOIN ledger_entries le ON le.rider_id = rp.id
          AND le.direction = 'RIDER_OWES_PLATFORM'
          AND le.status = 'OPEN'
         WHERE rp.id = $1
         GROUP BY rp.id`,
        [body.riderId],
      );
      if (
        debt.rows[0] &&
        !debitEligible(Number(debt.rows[0].platform_due), Number(debt.rows[0].debit_limit_all))
      ) {
        await createAdminNotification(client, {
          type: "RIDER_DEBIT_LIMIT_REACHED",
          payload: {
            riderId: body.riderId,
            platformDue: Number(debt.rows[0].platform_due),
            debitLimitAll: Number(debt.rows[0].debit_limit_all),
          },
        });
        await client.query(
          `INSERT INTO notifications (user_id, type, channel, status, payload, sent_at)
           SELECT user_id, 'RIDER_DEBIT_BLOCKED', 'SOCKET', 'SENT', $2::jsonb, now()
           FROM rider_profiles
           WHERE id = $1`,
          [
            body.riderId,
            JSON.stringify({
              message:
                "Ke arritur limitin 5000 ALL. Porosite e reja bllokohen deri ne shlyerje.",
            }),
          ],
        );
      }
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
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        accuracy: z.number().finite().min(0).optional(),
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
      `INSERT INTO rider_locations (rider_id, order_id, point, lat, lng, speed, heading, accuracy_meters)
       VALUES ($1, $2, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, $3, $4, $5, $6, $7)`,
      [
        body.riderId,
        body.orderId ?? null,
        body.lat,
        body.lng,
        body.speed ?? null,
        body.heading ?? null,
        body.accuracy ?? null,
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
      if (constraint === "users_email_key") { res.status(409).json({error:"USER_EMAIL_EXISTS"}); return; }
      if (constraint === "users_phone_key") { res.status(409).json({error:"USER_PHONE_EXISTS"}); return; }
      if (constraint.includes("customer_accounts_phone")) {
        res.status(409).json({ error: "CUSTOMER_PHONE_EXISTS" });
        return;
      }
      if (constraint.includes("customer_accounts_email")) {
        res.status(409).json({ error: "CUSTOMER_EMAIL_EXISTS" });
        return;
      }
    }

    if (error instanceof z.ZodError) { res.status(422).json({error:"VALIDATION_ERROR", issues:error.issues}); return; }
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status =
      message === "ORDERING_CLOSED"
        ? 409
        : message.includes("NOT_FOUND")
          ? 404
          : message === "GOOGLE_DIRECTIONS_API_KEY_REQUIRED"
            ? 503
            : message.startsWith("GOOGLE_DIRECTIONS_")
              ? 502
              : message.includes("NOT_AVAILABLE")
                ? 409
                : 400;
    res.status(status).json({ error: message });
  },
);

let dispatchLoopRunning = false;

async function runDispatchLoop() {
  if (dispatchLoopRunning) return;
  dispatchLoopRunning = true;
  let client: PoolClient | undefined;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await processDueOrderDispatches(client);
    await client.query("COMMIT");
    await publishPendingNotifications();
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => undefined);
    console.error("Happy Tirana dispatch loop failed", error);
  } finally {
    client?.release();
    dispatchLoopRunning = false;
  }
}

export { app, server, io, pool, runDispatchLoop, processDueOrderDispatches };
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  setInterval(() => { void runDispatchLoop(); }, 5000);
  const port = Number(process.env.PORT ?? 4000);
  server.listen(port, () => console.log(`Happy Tirana API listening on http://localhost:${port}`));
}
