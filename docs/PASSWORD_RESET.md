# Rivendosja e fjalëkalimit me email

Në login-et `/admin/login`, `/business/login` dhe `/rider/login` gjendet lidhja **Ke harruar fjalëkalimin?**.

- Kërkesa përdor email-in e llogarisë `users.email` dhe portalin përkatës.
- Vetëm përdoruesi ACTIVE, me biznes/motorist ACTIVE dhe jo të fshirë, merr email.
- Statusi kontrollohet përsëri para ndryshimit. Ndryshimi nuk aktivizon një llogari të pezulluar/joaktive.
- Për email të panjohur/joaktiv shfaqet i njëjti mesazh neutral, pa dërguar link.
- Linku përdoret vetëm një herë, skadon pas 20 minutash dhe zëvendësohet nga kërkesa e re.
- Në database ruhet vetëm SHA-256 i token-it. Token-i në URL është fragment, jo query string që regjistrohet në access logs.
- Fjalëkalimi i ri kërkon 10–128 karaktere; përdoret mekanizmi ekzistues PBKDF2 i login-it.
- Versioni i sesionit ndryshon pas resetimit; sesionet e vjetra HTTP refuzohen dhe lidhjet socket mbyllen.
- Kufiri: 3 kërkesa/email dhe 20 kërkesa/IP në 15 minuta, ruajtur në PostgreSQL.

## Konfigurimi

Vlerat reale janë vetëm në `.env.production`, të përjashtuara nga Git dhe Docker build context.
Template: `.env.production.example`. SMTP në këtë deployment përdor portën 587 me STARTTLS të detyrueshëm dhe verifikim certifikate.

Variablat: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`.
`PASSWORD_RESET_PUBLIC_URL` është opsional; kur mungon përdoret `PUBLIC_URL`.
Në server `PUBLIC_URL` duhet të jetë origjina publike HTTPS. Në localhost lejohen HTTP localhost/127.0.0.1.

Migration `022_password_reset.sql` ekzekutohet nga mekanizmi ekzistues gjatë nisjes së API-së.

## API

- `POST /auth/password-reset/request`: `{email, portal}` ku portal është `admin`, `business` ose `rider`.
- `POST /auth/password-reset/confirm`: `{token, portal, password}`.
- 422 validim; 429 shumë kërkesa; 503 dërgimi i email-it dështoi; 400 link i pavlefshëm/skaduar ose llogari joaktive.

## Verifikimi

`npm test`; `npm run typecheck`; `npm run test:integration`.
Skenarët e resetimit janë te `tests/password-reset.integration-helper.mjs`; SMTP simulohet për të shmangur email-e drejt përdoruesve realë dhe të gjitha të dhënat janë në databazë të izoluar.
SMTP real: STARTTLS/autentifikimi kaluan; serveri pranoi email-in test drejt vetë adresës së dërguesit (`250 ... queued`). Pranimi nga SMTP nuk vërteton mbërritjen në Inbox.
