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
