# Happy Tirana Courier

Local-first monorepo for a courier platform in Tirana. It includes three operational Next.js App Router portals, an Express + Socket.io API, shared TypeScript contracts, and a PostgreSQL/PostGIS database schema.

## Apps

- `apps/admin-portal`: superadmin dashboard for businesses, riders, zones, live map, and finance.
- `apps/business-portal`: order creation, product/category management, and live order tracking for businesses.
- `apps/rider-app`: mobile-first PWA for riders with online/offline, order offers, delivery workflow, and earnings.
- `apps/api`: local backend API and realtime gateway.

## Docker deployment

Copy .env.production.example to .env.production for a new deployment and fill
in independent, cryptographically random POSTGRES_PASSWORD and JWT_SECRET.
Use the same database password in DATABASE_URL:
postgresql://happy:<PASSWORD>@postgres:5432/happy_tirana.
The real .env.production is ignored by Git and excluded from Docker builds.

```bash
docker compose config --quiet
docker compose up -d --build --wait
docker compose ps
docker compose logs api
```

The default Compose file includes docker-compose.prod.yml and loads
.env.production (Compose 2.20+). To use the production file directly:
`docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build --wait`.

The gateway is http://127.0.0.1:13305, with /admin, /business, /rider,
/api and /socket.io routes. API runs on port 4000 internally.
PostgreSQL/PostGIS uses database happy_tirana and user happy on postgres:5432.
Only the gateway is published on loopback; PostgreSQL has no host port.
Set PUBLIC_URL to the external URL and rebuild when deploying behind a proxy.
Local portal aliases are http://localhost:3000/admin, http://localhost:3001/business,
and http://localhost:3002/rider. Their root URLs redirect to the matching portal.
These ports bind only to loopback. Include the browser origins in CORS_ORIGINS
and allow them in the Google Maps key's website restrictions.

Set Google Maps keys in .env.production if maps/routing are needed.

PostgreSQL data persists in the happy-tirana_postgres-data named volume.
Container restart/recreation preserves it. Do not use `docker compose down -v`
unless you intend to delete the database. Changing POSTGRES_PASSWORD does not
rotate credentials in an already initialized volume; rotate the database role
password and update DATABASE_URL together before recreating the API.

The API waits for the PostgreSQL healthcheck, runs the existing ordered SQL
files in packages/db/migrations, and starts only after migration success.
The SQL runner uses the existing pg dependency, a session advisory lock, one
transaction per file, and schema_migrations checksums to skip applied files.
Both npm migration commands use this same runner. Prisma's partial schema is
not used for deployment migrations. Do not edit already applied SQL files;
add the next numbered file. Legacy volumes without a migration history replay
the existing SQL once; back up and review their data migrations before upgrading.

The /api/health endpoint queries PostgreSQL and returns 503 if unavailable.
New installations contain no login accounts. Create the initial administrator
with the existing API create-admin command, supplying ADMIN_EMAIL,
ADMIN_PHONE and ADMIN_PASSWORD to the container; then manage accounts from
the dashboard.

For optional host-based development, install dependencies and use .env.example.
Supply your own loopback-only Compose port override and matching DATABASE_URL;
the deployment stack intentionally does not expose PostgreSQL.

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

Riders may hold up to two active orders. The delivery page lists every active order and plans up to four stops from the rider's GPS position. Google Routes road distances are used to minimize total distance across the remaining stops, preserving pickup-before-delivery for each order. Picked-up orders require only a delivery stop. The itinerary refreshes after an order/status change or movement of roughly 50 m, at most every 30 seconds for GPS movement. The navigation button opens Google Maps for the next stop; after pickup/delivery is confirmed in the portal, the remaining itinerary is recalculated. Live GPS is required to plan from the rider's current location.

Planner regression checks: `node --test tests/rider-itinerary.test.cjs`.
