export const GPS_OPTIONS = { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 } as const;
export function gpsIssue(position: Pick<GeolocationPosition, "coords" | "timestamp">, now = Date.now()): string | null {
  const { latitude, longitude, accuracy } = position.coords;
  if (![latitude, longitude, accuracy].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy < 0)
    return "Vendndodhja nuk është e vlefshme. Riprovo GPS-in.";
  if (now - position.timestamp > 30000 || position.timestamp > now + 5000)
    return "Vendndodhja është e vjetër. Po presim GPS të ri.";
  return null;
}
