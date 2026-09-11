# Happy Tirana Courier

Local-first monorepo for a courier platform in Tirana. It includes three operational Next.js App Router portals, an Express + Socket.io API, shared TypeScript contracts, and a PostgreSQL/PostGIS database schema.

## Apps

- `apps/admin-portal`: superadmin dashboard for businesses, riders, zones, live map, and finance.
- `apps/business-portal`: order creation, product/category management, and live order tracking for businesses.
- `apps/rider-app`: mobile-first PWA for riders with online/offline, order offers, delivery workflow, and earnings.
- `apps/api`: local backend API and realtime gateway.

## Local Setup

```bash
npm install
cp .env.example .env
npm run db:up
npm run db:migrate
npm run db:create-admin
npm run dev
```

No login credentials are committed to source control. Set `ADMIN_EMAIL`,
`ADMIN_PHONE`, and `ADMIN_PASSWORD` in your local `.env` before running
`npm run db:create-admin`.

Default ports:

- API: `http://localhost:4000`
- Admin portal: `http://localhost:3000`
- Business portal: `http://localhost:3001`
- Rider app: `http://localhost:3002`

Active portal routes:

- Admin `http://localhost:3000/login`: create/manage businesses, riders, zones, live map, and finance.
- Business `http://localhost:3001/login`: create delivery orders, manage products/categories, and monitor pending/in-delivery/completed orders.
- Rider `http://localhost:3002/login`: go online/offline, receive nearby order offers, accept/reject, and manage delivery.

## Critical Business Rules

- Public customer ordering is not enabled. Businesses create delivery orders on behalf of their clients.
- Public self-registration is not enabled. Admin creates business and rider accounts.
- Delivery zones are PostGIS polygons and transport fees are resolved with `ST_Contains`.
- Business order creation stores the client name, client phone, delivery address, product value, transport fee, and offered riders in local PostgreSQL.
- Rider GPS should be accepted only when the rider is online or has an active order.
- Order acceptance uses a transaction with `FOR UPDATE` so the first rider to accept wins.
- For each delivered order, the rider keeps 80% of transport and the platform receives 20%.

## Maps and rider navigation

Set `GOOGLE_MAPS_API_KEY` in the root `.env` for the server, with Routes API enabled and an IP restriction for the server's public address. Transport quotes use the shortest returned driving alternative without traffic: 300 ALL through 3 km, then 0.1 ALL per additional meter, plus applicable zone surcharges.

Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in each portal's `.env.local` for the embedded map. Use a separate browser key with Maps JavaScript API enabled and the portal origins allowed under website restrictions. These local environment files are ignored by Git.

Riders may hold up to four active orders. The delivery page lists every active order and plans up to eight stops from the rider's GPS position. Google Routes road distances are used to minimize total distance across the remaining stops, preserving pickup-before-delivery for each order. Picked-up orders require only a delivery stop. The itinerary refreshes after an order/status change or movement of roughly 50 m, at most every 30 seconds for GPS movement. The navigation button opens Google Maps for the next stop; after pickup/delivery is confirmed in the portal, the remaining itinerary is recalculated. Live GPS is required to plan from the rider's current location.

Planner regression checks: `node --test tests/rider-itinerary.test.cjs`.
