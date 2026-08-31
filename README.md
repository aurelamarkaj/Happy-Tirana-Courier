# Happy Tirana Courier

Local-first monorepo for a courier platform in Tirana. It includes three Next.js App Router portals, an Express + Socket.io API, shared TypeScript contracts, and a PostgreSQL/PostGIS database schema.

## Apps

- `apps/admin-portal`: superadmin dashboard for businesses, riders, zones, live map, and finance.
- `apps/business-portal`: fast order creation and live order tracking for businesses.
- `apps/customer-portal`: public customer ordering experience for browsing businesses, adding products to cart, checkout, and live tracking.
- `apps/rider-app`: mobile-first PWA for riders with online/offline, delivery workflow, and earnings.
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
- Customer portal: `http://localhost:3003`
- Rider app: `http://localhost:3002`

Customer routes:

- `/`: catalog of businesses with categories and search.
- `/businesses/[businessId]`: business storefront with product sections, item photos, quantity controls, and cart.
- `/login`: customer login backed by the local API and PostgreSQL.
- `/signup`: customer signup with name, phone, email, password, and address autocomplete.
- `/profile`: editable customer profile and order history from PostgreSQL.
- `/checkout`: delivery details, address autocomplete, cash checkout summary, auto-filled customer name/phone, and order creation from DB cart.
- `/orders/track`: lighter live tracking layout with OpenStreetMap, rider GPS marker, and customer geolocation action.

## Critical Business Rules

- Public self-registration is not enabled. Admin creates business and rider accounts.
- Delivery zones are PostGIS polygons and transport fees are resolved with `ST_Contains`.
- Customer checkout creates a normal courier order with product line items and cash-on-delivery payment.
- Customer profile, cart, and order history are stored in local PostgreSQL; the browser keeps only the current customer id for the MVP session.
- Rider GPS should be accepted only when the rider is online or has an active order.
- Order acceptance uses a transaction with `FOR UPDATE` so the first rider to accept wins.
- For each delivered order, the rider keeps 80% of transport and the platform receives 20%.
