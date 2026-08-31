"use client";

import { MapPin, Navigation2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getRoute, sendRiderLocation, type RiderOrder, type RoutePoint } from "../lib/api";

declare global {
  interface Window {
    L?: any;
    happyLeafletReady?: Promise<any>;
  }
}

function loadLeaflet() {
  if (typeof window === "undefined") return Promise.reject(new Error("NO_WINDOW"));
  if (window.L) return Promise.resolve(window.L);
  if (window.happyLeafletReady) return window.happyLeafletReady;

  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(css);

  window.happyLeafletReady = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("LEAFLET_LOAD_FAILED"));
    document.body.appendChild(script);
  });

  return window.happyLeafletReady;
}

export function RiderMap({ order, isOnline, leg }: { order: RiderOrder | null; isOnline: boolean; leg: "pickup" | "dropoff" }) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const routeRef = useRef<any>(null);
  const riderMarkerRef = useRef<any>(null);
  const pickupMarkerRef = useRef<any>(null);
  const dropoffMarkerRef = useRef<any>(null);
  const [currentLocation, setCurrentLocation] = useState<RoutePoint | null>(null);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [message, setMessage] = useState("Aktivizo online per GPS live.");

  const destination = useMemo(() => {
    if (!order) return null;
    return leg === "pickup" ? { lat: order.pickupLat, lng: order.pickupLng } : { lat: order.dropoffLat, lng: order.dropoffLng };
  }, [leg, order]);

  useEffect(() => {
    if (!isOnline || !navigator.geolocation) return;

    const watcherId = navigator.geolocation.watchPosition(
      (position) => {
        const next = { lat: position.coords.latitude, lng: position.coords.longitude };
        setCurrentLocation(next);
        setMessage("GPS live aktiv.");
        sendRiderLocation({
          ...next,
          orderId: order?.id ?? null,
          speed: position.coords.speed ?? undefined,
          heading: position.coords.heading ?? undefined
        }).catch(() => setMessage("GPS u lexua, por nuk u ruajt dot ne API."));
      },
      () => setMessage("Lejo GPS ne browser per gjurmim live."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
    );

    return () => navigator.geolocation.clearWatch(watcherId);
  }, [isOnline, order?.id]);

  useEffect(() => {
    if (!destination || !currentLocation) {
      setRoutePoints([]);
      return;
    }

    getRoute({ fromLat: currentLocation.lat, fromLng: currentLocation.lng, toLat: destination.lat, toLng: destination.lng })
      .then((route) => setRoutePoints(route.coordinates.length > 1 ? route.coordinates : [currentLocation, destination]))
      .catch(() => setRoutePoints([currentLocation, destination]));
  }, [currentLocation, destination]);

  useEffect(() => {
    let cancelled = false;

    loadLeaflet().then((L) => {
      if (cancelled || !mapElementRef.current) return;
      const center = currentLocation ?? destination ?? { lat: 41.3275, lng: 19.8187 };

      if (!mapRef.current) {
        mapRef.current = L.map(mapElementRef.current, { zoomControl: false, attributionControl: false }).setView([center.lat, center.lng], 14);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "OpenStreetMap"
        }).addTo(mapRef.current);
        L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);
      }

      const pickupIcon = L.divIcon({ className: "rider-map-pin rider-map-pickup", html: "<span></span>", iconSize: [26, 26] });
      const dropoffIcon = L.divIcon({ className: "rider-map-pin rider-map-dropoff", html: "<span></span>", iconSize: [26, 26] });
      const riderIcon = L.divIcon({ className: "rider-map-rider", html: "<span>HTC</span>", iconSize: [48, 48] });

      if (order) {
        if (!pickupMarkerRef.current) pickupMarkerRef.current = L.marker([order.pickupLat, order.pickupLng], { icon: pickupIcon }).addTo(mapRef.current);
        else pickupMarkerRef.current.setLatLng([order.pickupLat, order.pickupLng]);

        if (!dropoffMarkerRef.current) dropoffMarkerRef.current = L.marker([order.dropoffLat, order.dropoffLng], { icon: dropoffIcon }).addTo(mapRef.current);
        else dropoffMarkerRef.current.setLatLng([order.dropoffLat, order.dropoffLng]);
      }

      if (currentLocation) {
        if (!riderMarkerRef.current) riderMarkerRef.current = L.marker([currentLocation.lat, currentLocation.lng], { icon: riderIcon }).addTo(mapRef.current);
        riderMarkerRef.current.setLatLng([currentLocation.lat, currentLocation.lng]);
      }

      const latLngs = routePoints.map((point) => [point.lat, point.lng]);
      if (latLngs.length > 1) {
        if (!routeRef.current) routeRef.current = L.polyline(latLngs, { color: "#FF5500", weight: 6, opacity: 0.95, lineCap: "round" }).addTo(mapRef.current);
        else routeRef.current.setLatLngs(latLngs);
        mapRef.current.fitBounds(routeRef.current.getBounds(), { padding: [32, 32] });
      } else {
        mapRef.current.setView([center.lat, center.lng], 14);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [currentLocation, destination, order, routePoints]);

  return (
    <section className="rider-panel relative min-h-[360px] overflow-hidden rounded-3xl border shadow-happy md:min-h-[520px]">
      <div className="absolute inset-0" ref={mapElementRef} />
      <div className="absolute left-4 right-4 top-4 flex items-center justify-between gap-3">
        <div className="rounded-2xl bg-white/95 px-4 py-3 text-happy-black shadow-happy backdrop-blur">
          <p className="type-badge uppercase text-black/45">{leg === "pickup" ? "Drejt biznesit" : "Drejt klientit"}</p>
          <strong className="type-product mt-1 block">{order ? (leg === "pickup" ? order.businessName : order.dropoffAddress) : "Pa porosi aktive"}</strong>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-happy-orange text-white shadow-happy">
          <Navigation2 className="h-5 w-5" />
        </div>
      </div>
      <div className="absolute bottom-4 left-4 right-4 rounded-2xl bg-[#101010]/88 p-4 text-white shadow-happy backdrop-blur">
        <p className="type-badge flex items-center uppercase text-white/55">
          <MapPin className="mr-2 h-4 w-4 text-happy-orange" />
          {message}
        </p>
        <p className="type-body mt-1 text-white/82">
          {currentLocation ? `${currentLocation.lat.toFixed(5)}, ${currentLocation.lng.toFixed(5)}` : "Pozicioni do ruhet vetem kur je online."}
        </p>
      </div>
    </section>
  );
}
