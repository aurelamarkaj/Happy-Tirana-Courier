"use client";

import { useEffect, useRef, useState } from "react";
import {
  getRiderItinerary,
  sendRiderLocation,
  type RiderOrder,
  type RiderItinerary,
  type RoutePoint,
} from "../lib/api";
import { createHappyMarker, loadGoogleMaps } from "../lib/google-maps";

const defaultCenter = { lat: 41.3275, lng: 19.8187 };
export function RiderMap({
  order,
  orders,
  isOnline,
  leg,
  onSelectOrder,
}: {
  order: RiderOrder | null;
  orders: RiderOrder[];
  isOnline: boolean;
  leg: "pickup" | "dropoff";
  onSelectOrder: (id: string) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const overlays = useRef<any[]>([]);
  const lastRoute = useRef<{ point: RoutePoint; time: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [location, setLocation] = useState<RoutePoint | null>(null);
  const [origin, setOrigin] = useState<RoutePoint | null>(null);
  const [itinerary, setItinerary] = useState<RiderItinerary | null>(null);
  const [routeError, setRouteError] = useState("");
  const [gpsMessage, setGpsMessage] = useState(
    "Lejo vendndodhjen për navigim nga pozicioni yt.",
  );
  const [routing, setRouting] = useState(false);
  const canTrack = isOnline || orders.length > 0;
  const signature = orders
    .map((o) => o.id + ":" + o.status)
    .sort()
    .join("|");
  const activeId = orders[0]?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !element.current) return;
        if (!map.current)
          map.current = new window.google.maps.Map(element.current, {
            center: defaultCenter,
            zoom: 14,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
          });
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setMapError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canTrack) {
      setLocation(null);
      setOrigin(null);
      lastRoute.current = null;
      setGpsMessage("Aktivizo online për vendndodhjen live.");
      return;
    }
    if (!navigator.geolocation) {
      setGpsMessage("Ky shfletues nuk ofron vendndodhjen.");
      return;
    }
    let lastSent = 0;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(p);
        setGpsMessage("GPS live aktiv.");
        const now = Date.now();
        if (now - lastSent > 10000) {
          lastSent = now;
          void sendRiderLocation({
            ...p,
            orderId: activeId,
            speed: pos.coords.speed ?? undefined,
            heading: pos.coords.heading ?? undefined,
          }).catch(() =>
            setGpsMessage("Vendndodhja u gjet, por nuk u dërgua. Kontrollo lidhjen me internetin."),
          );
        }
        const previous = lastRoute.current;
        if (
          !previous ||
          (now - previous.time > 30000 &&
            Math.hypot(p.lat - previous.point.lat, p.lng - previous.point.lng) >
              0.0005)
        ) {
          lastRoute.current = { point: p, time: now };
          setOrigin(p);
        }
      },
      () =>
        setGpsMessage(
          "Lejo vendndodhjen në shfletues për itinerarin nga pozicioni yt.",
        ),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [canTrack, activeId]);

  useEffect(() => {
    let cancelled = false;
    setItinerary(null);
    setRouteError("");
    if (!origin || !signature) {
      setRouting(false);
      return;
    }
    setRouting(true);
    getRiderItinerary(origin)
      .then((result) => {
        if (cancelled) return;
        setItinerary(result);
        if (result.stops[0]) onSelectOrder(result.stops[0].orderId);
      })
      .catch(() => {
        if (!cancelled)
          setRouteError(
            "Itinerari nuk u llogarit. Provo përsëri; navigimi për porosinë mbetet i disponueshëm.",
          );
      })
      .finally(() => {
        if (!cancelled) setRouting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [origin, signature, onSelectOrder]);

  useEffect(() => {
    if (!ready) return;
    overlays.current.forEach((item) => item.setMap(null));
    overlays.current = [];
    const points: RoutePoint[] = [];
    const marker = (point: RoutePoint, label: string, color: string) => {
      points.push(point);
      overlays.current.push(
        createHappyMarker(map.current, point, label, color),
      );
    };
    if (location) marker(location, "Ti", "#2463eb");
    if (itinerary) {
      itinerary.stops.forEach((stop, i) =>
        marker(
          stop,
          String(i + 1),
          stop.kind === "pickup" ? "#343434" : "#ff5500",
        ),
      );
      if (itinerary.coordinates.length > 1)
        overlays.current.push(
          new window.google.maps.Polyline({
            map: map.current,
            path: itinerary.coordinates,
            strokeColor: "#ff5500",
            strokeWeight: 5,
          }),
        );
    } else {
      for (const item of orders) {
        if (item.status === "ACCEPTED")
          marker({ lat: item.pickupLat, lng: item.pickupLng }, "B", "#343434");
        marker({ lat: item.dropoffLat, lng: item.dropoffLng }, "K", "#ff5500");
      }
    }
    if (points.length > 1) {
      const bounds = new window.google.maps.LatLngBounds();
      [...points, ...(itinerary?.coordinates ?? [])].forEach((p) =>
        bounds.extend(p),
      );
      map.current.fitBounds(bounds, 48);
    } else if (points[0]) {
      map.current.setCenter(points[0]);
      map.current.setZoom(15);
    }
    return () => {
      overlays.current.forEach((item) => item.setMap(null));
      overlays.current = [];
    };
  }, [ready, location, itinerary, signature]);

  const next = itinerary?.stops[0];
  const destination =
    next ??
    (order && order.status !== "OFFERED"
      ? leg === "pickup"
        ? { lat: order.pickupLat, lng: order.pickupLng }
        : { lat: order.dropoffLat, lng: order.dropoffLng }
      : null);
  const navigation = destination
    ? "https://www.google.com/maps/dir/?" +
      new URLSearchParams({
        api: "1",
        destination: `${destination.lat},${destination.lng}`,
        travelmode: "driving",
        dir_action: "navigate",
        ...(location ? { origin: `${location.lat},${location.lng}` } : {}),
      }).toString()
    : null;

  return (
    <section className="rider-panel overflow-hidden rounded-xl border">
      <div className="relative h-[380px] md:h-[520px]">
        <div className="absolute inset-0" ref={element} />
        {mapError && (
          <p
            role="alert"
            className="absolute inset-x-4 top-4 rounded-lg bg-black/90 p-4"
          >
            Harta nuk u ngarkua. Kontrollo lidhjen ose konfigurimin e Google
            Maps. Mund të përdorësh butonin e navigimit më poshtë.
          </p>
        )}
      </div>
      <div className="space-y-3 p-4">
        <p className="type-secondary text-white/60">{gpsMessage}</p>
        {routing && (
          <p role="status">Po renditen ndalesat sipas distancës rrugore…</p>
        )}
        {routeError && (
          <div role="alert">
            <p>{routeError}</p>
            <button
              className="ops-link"
              onClick={() => location && setOrigin({ ...location })}
            >
              Riprovo itinerarin
            </button>
          </div>
        )}
        {itinerary && (
          <p className="type-product">
            {itinerary.stops.length} ndalesa ·{" "}
            {(itinerary.distanceMeters / 1000).toFixed(2)} km · rreth{" "}
            {Math.ceil(itinerary.durationSeconds / 60)} min
          </p>
        )}
        {navigation && (
          <a
            className="type-cta block rounded-lg bg-happy-orange p-3 text-center text-white"
            href={navigation}
            target="_blank"
            rel="noreferrer"
          >
            Nis navigimin
            {next
              ? ` · ${next.kind === "pickup" ? "Marrje" : "Dorëzim"} ${next.code}`
              : ""}
          </a>
        )}
        {!orders.length && (
          <p>
            Nuk ka porosi aktive. Aktivizo Online dhe lejo vendndodhjen që të
            marrësh ofertat e reja. Itinerari shfaqet pasi të pranosh porosinë.
          </p>
        )}
        {itinerary && (
          <ol className="space-y-2" aria-label="Ndalesat sipas radhës">
            {itinerary.stops.map((stop, i) => (
              <li key={stop.orderId + stop.kind}>
                <button
                  type="button"
                  onClick={() => onSelectOrder(stop.orderId)}
                  className="w-full rounded-lg border border-white/10 p-3 text-left"
                >
                  <strong>
                    {i + 1}. {stop.kind === "pickup" ? "Marrje" : "Dorëzim"} ·{" "}
                    {stop.code}
                  </strong>
                  <span className="block text-white/60">
                    {stop.title} · {stop.address}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
