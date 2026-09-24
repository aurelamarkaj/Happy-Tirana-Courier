export const MAX_ACTIVE_ORDERS = 2;
export const SECOND_ORDER_MAX_DISTANCE_METERS = 500;
export const MAX_PLATFORM_DEBIT = 5000;
export const OFFER_ESCALATION_SECONDS = 60;
export const ADMIN_ALERT_DELAY_SECONDS = 60;

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Tirane", weekday: "short", hour: "2-digit",
  minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
function localParts(now: Date) {
  return Object.fromEntries(clock.formatToParts(now).map(p => [p.type, p.value]));
}
export function isOperationalDay(now = new Date()) {
  return true;
}
export function isWithinOperationalHours(now = new Date()) {
  const { hour } = localParts(now);
  return Number(hour) >= 7 && Number(hour) < 23;
}
export function getOrderWindow(now = new Date()) {
  return { isOpen: isOperationalDay(now) && isWithinOperationalHours(now),
    timeZone: "Europe/Tirane", opensAt: "07:00", closesAt: "23:00",
    nextCheckInSeconds: 1, serverTime: now.toISOString() };
}
export function assertOrderingOpen(now = new Date()) {
  if (!getOrderWindow(now).isOpen) throw new Error("ORDERING_CLOSED");
}
export function firstOfferDelayMinutes(readyMinutes: number) {
  return readyMinutes > 10 ? readyMinutes - 1 : 9;
}
export function debitLimit() {
  const value = Number(process.env.RIDER_DEBIT_LIMIT_ALL ?? MAX_PLATFORM_DEBIT);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_PLATFORM_DEBIT)
    throw new Error("RIDER_DEBIT_LIMIT_ALL must be greater than 0 and at most 5000 ALL");
  return value;
}
export function debitEligible(debit: number, profileLimit = MAX_PLATFORM_DEBIT) {
  return Number.isFinite(debit) && debit < Math.min(profileLimit, debitLimit());
}
export function secondOrderLimits() {
  function read(name: string) {
    const raw = process.env[name];
    const value = raw?.trim() ? Number(raw) : NaN;
    return Number.isFinite(value) && value > 0
      ? Math.min(value, SECOND_ORDER_MAX_DISTANCE_METERS)
      : SECOND_ORDER_MAX_DISTANCE_METERS;
  }
  return {
    business: read("SECOND_ORDER_BUSINESS_RADIUS_METERS"),
    destination: read("SECOND_ORDER_DESTINATION_RADIUS_METERS"),
  };
}
