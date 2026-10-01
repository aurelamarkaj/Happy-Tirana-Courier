import type { RiderOrder, RoutePoint } from "./api";
export function riderNavigationUrl(order: RiderOrder | null, location: RoutePoint | null): string | null {
  if (!order || !["ACCEPTED", "PICKED_UP"].includes(order.status)) return null;
  const collected = order.status === "PICKED_UP";
  const origin = collected ? {lat:order.pickupLat,lng:order.pickupLng} : location;
  const destination = collected ? {lat:order.dropoffLat,lng:order.dropoffLng} : {lat:order.pickupLat,lng:order.pickupLng};
  return "https://www.google.com/maps/dir/?" + new URLSearchParams({api:"1", travelmode:"driving", dir_action:"navigate",
    destination: destination.lat + "," + destination.lng,
    ...(origin ? {origin:origin.lat + "," + origin.lng} : {})}).toString();
}
