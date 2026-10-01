# Inventari i API-ve

Inventar statik; ekzistenca nuk është provë që një endpoint kalon testet. Rezultatet janë në raport dhe log-et.

| ID | Method | Path | server.ts line |
|---|---|---|---|
| API01 | GET | /health | 94 |
| API02 | GET | /businesses/order-window | 103 |
| API03 | GET | /admin/notifications | 927 |
| API04 | POST | /admin/auth/login | 1372 |
| API05 | GET | /admin/businesses | 1400 |
| API06 | GET | /admin/business-categories | 1434 |
| API07 | POST | /admin/business-categories | 1455 |
| API08 | POST | /admin/businesses | 1489 |
| API09 | PATCH | /admin/businesses/:id | 1613 |
| API10 | PATCH | /admin/businesses/:id/password | 1693 |
| API11 | DELETE | /admin/businesses/:id | 1709 |
| API12 | GET | /admin/riders | 1752 |
| API13 | POST | /admin/riders | 1799 |
| API14 | PATCH | /admin/riders/:id | 1877 |
| API15 | PATCH | /admin/riders/:id/password | 1934 |
| API16 | DELETE | /admin/riders/:id | 1949 |
| API17 | PATCH | /admin/riders/:id/account-balance | 1992 |
| API18 | GET | /admin/zones | 2014 |
| API19 | POST | /admin/zones | 2113 |
| API20 | PATCH | /admin/zones/:id | 2114 |
| API21 | DELETE | /admin/zones/:id | 2116 |
| API22 | GET | /admin/live-map | 2158 |
| API23 | GET | /admin/finance | 2238 |
| API24 | GET | /public/addresses/search | 2286 |
| API25 | GET | /public/addresses/reverse | 2338 |
| API26 | GET | /public/routes | 2382 |
| API27 | POST | /businesses/auth/login | 2430 |
| API28 | POST | /riders/auth/login | 2479 |
| API29 | GET | /riders/:id/dashboard | 2521 |
| API30 | POST | /riders/:id/availability | 2532 |
| API31 | POST | /public/auth/signup | 2594 |
| API32 | POST | /public/auth/login | 2651 |
| API33 | GET | /public/me | 2684 |
| API34 | PATCH | /public/me | 2710 |
| API35 | GET | /public/businesses | 2757 |
| API36 | GET | /public/businesses/:id | 2830 |
| API37 | GET | /businesses/:id/dashboard | 2908 |
| API38 | POST | /businesses/:id/orders/location | 3029 |
| API39 | POST | /businesses/:id/orders/quote | 3041 |
| API40 | POST | /businesses/:id/orders | 3214 |
| API41 | PATCH | /businesses/:id/orders/:orderId/decision | 3216 |
| API42 | GET | /public/cart | 3284 |
| API43 | PUT | /public/cart/items | 3323 |
| API44 | POST | /public/cart/clear | 3398 |
| API45 | POST | /public/orders | 3423 |
| API46 | GET | /public/orders/:code/track | 3428 |
| API47 | GET | /public/me/orders | 3465 |
| API48 | POST | /zones/resolve | 3510 |
| API49 | POST | /riders/:id/itinerary | 3529 |
| API50 | POST | /orders/:id/accept | 3567 |
| API51 | GET | /admin/orders | 3648 |
| API52 | POST | /admin/orders/:id/assign | 3685 |
| API53 | GET | /admin/businesses/:id/orders | 3745 |
| API54 | PATCH | /admin/orders/:id/cancel | 3763 |
| API55 | POST | /orders/:id/reject | 3784 |
| API56 | PATCH | /riders/orders/:id/status | 3814 |
| API57 | POST | /riders/me/location | 3953 |
