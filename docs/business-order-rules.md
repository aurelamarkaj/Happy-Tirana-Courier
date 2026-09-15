# Business order rules

- Business orders no longer use the business catalogue. Historical products and order items are retained.
- Customer name, phone, destination and a goods value strictly greater than zero are required. Product name, description and preparation time are optional; preparation defaults to 10 minutes.
- Creation is allowed from 07:00 inclusive to 23:00 exclusive in Europe/Tirane, checked by the API before persistence completes. Existing orders can continue outside this window.
- Transport costs 300 ALL for the first 3000 meters, then 0.1 ALL per additional meter. Billing requires a successful Google Routes response; local estimates are not billable.
- Active Zone 1 polygons (`is_surcharge_area=true`) define the tariff interior. A destination outside all of them adds 100 ALL once. The pickup location does not trigger this surcharge. At least one active tariff polygon must be configured.
- Active Zone 2 polygons (`is_surcharge_area=false`) define coverage. Both pickup and destination must be covered. Polygon boundaries count as inside.
- The business may override the final transport price, including zero, without bypassing operating hours, coverage, or Google routing checks. The calculated fee and surcharge are retained separately.

## Existing installations

Review existing polygons in the admin Zones page before accepting orders: the previous surcharge-intersection semantics have changed. Do not assume old polygons match the new Zone 1 interior or Zone 2 coverage requirements. Edit or deactivate old zones; do not delete historical orders. No geographic boundary is invented automatically.

## Verification

Run `node --test tests/*.test.cjs` and `npm run typecheck`.
The unit tests mock Google and database results; live PostGIS geometry and full browser order submission require a running database, configured zones and an enabled Google Routes key.
