# Happy Tirana Courier — implementation and verification (24 September 2026)

The current rules are documented in [operational-rules.md](operational-rules.md). This report records checks against the running Docker stack. Earlier interim rules (Sunday closure, manual fee override, 60 ALL debit and unset second-order limits) no longer apply.

## Deployment

- Docker Compose runs PostGIS/PostgreSQL as the private `postgres` service, with database `happy_tirana`, user `happy`, and a persistent volume. The API waits for database health, applies the existing ordered SQL migrations, then listens on port 4000. Nginx exposes the web portals on loopback ports 3000, 3001, 3002 and 13305.
- `.env.production` contains the deployment database password and JWT secret and is ignored by Git and Docker build context. The committed `.env.production.example` contains placeholders only. `DATABASE_URL` uses the same password as `POSTGRES_PASSWORD` and the hostname `postgres`.
- The deployed database reports 17 applied migrations. The API and PostgreSQL healthchecks pass. The gateway and three login pages return HTTP 200. Protected admin and rider API routes return HTTP 401 without a signed session.

## Functional behavior

- Business orders require a Maps destination link, phone, preparation minutes and a signed order value; customer name and note are optional. The transport fee is automatic and cannot be manually overridden.
- Google Routes is called with `DRIVE`, `TRAFFIC_UNAWARE` and alternative routes. The application picks the smallest `distanceMeters` among Google's returned alternatives. Billable orders do not fall back to straight-line distance when Google fails.
- Transport costs 300 ALL through 3 km, then 0.1 ALL per extra metre. A destination outside the circular tariff area adds 100 ALL. The separate delivery-coverage polygon still controls whether a delivery can be created.
- Dispatch starts at minute 9 for preparation times at most 10 minutes, or one minute before readiness otherwise. One eligible nearby rider receives the first offer. After 60 seconds all other eligible riders receive it; after a further 60 seconds admin is alerted if it remains unassigned. The dispatch loop runs every five seconds.
- A rider can hold two active orders, with the second allowed only after first pickup. The two businesses must differ, and both business-to-business and destination-to-destination Google road distances must be at most 500 m. A third active order is rejected.
- DIESEL riders receive routes over 3 km; ELECTRIC riders can receive any route length. Platform debit is capped at 5000 ALL. Admin-only cancellation is available until delivery. Admin can record a rider balance withdrawal within 0–5000 ALL. Sunday is operational, with new orders accepted 07:00–22:59 Europe/Tirane.
- Admin, business and rider APIs require role-bound signed sessions. Admin's stale unassigned alert closes when an order is accepted. The live map and its rider count use the same online-rider set.

## Verification

Commands: `npm test` (29/29), `npm run typecheck` (all workspaces), `npm run test:integration` (18/18 against temporary PostgreSQL, HTTP and Socket.IO), `docker compose config --quiet`, `docker compose up -d`, `docker compose ps`, SQL checks in the running Postgres container, and HTTP smoke checks. Live Google Routes calls returned valid routes. For a Centre–Kombinat sample, Google returned 5275 m, 5121 m and 10059 m; the application selected 5121 m even though the 5275 m route had a shorter duration. With the destination outside the tariff area, that sample's transport fee was 612.10 ALL.

Physical mobile GPS permission, receipt of a notification on a real device, and placing a real phone call still require a device test. The exact placement of the circular tariff boundary should also be reviewed visually with the business owner.
