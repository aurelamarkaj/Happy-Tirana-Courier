"use client";

import { Bike, Crosshair, LocateFixed } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getRoute, reverseAddress, type RoutePoint } from "../lib/api";
import { formatAddress } from "../lib/addresses";

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

export function LiveTrackingMap({
  pickupPoint,
  dropoffPoint
}: {
  pickupPoint: RoutePoint;
  dropoffPoint: RoutePoint;
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const routeRef = useRef<any>(null);
  const riderMarkerRef = useRef<any>(null);
  const customerMarkerRef = useRef<any>(null);
  const pickupMarkerRef = useRef<any>(null);
  const dropoffMarkerRef = useRef<any>(null);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([pickupPoint, dropoffPoint]);
  const [tick, setTick] = useState(0);
  const [customerGps, setCustomerGps] = useState("GPS klienti jo aktiv");

  useEffect(() => {
    getRoute({ fromLat: pickupPoint.lat, fromLng: pickupPoint.lng, toLat: dropoffPoint.lat, toLng: dropoffPoint.lng })
      .then((route) => {
        if (route.coordinates.length > 1) setRoutePoints(route.coordinates);
      })
      .catch(() => setRoutePoints([pickupPoint, dropoffPoint]));
  }, [dropoffPoint.lat, dropoffPoint.lng, pickupPoint.lat, pickupPoint.lng]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTick((current) => (current + 1) % Math.max(1, routePoints.length));
    }, 1500);
    return () => window.clearInterval(interval);
  }, [routePoints.length]);

  const rider = routePoints[Math.min(tick, routePoints.length - 1)] ?? pickupPoint;
  const eta = useMemo(() => Math.max(3, 18 - Math.floor((tick / Math.max(1, routePoints.length)) * 14)), [routePoints.length, tick]);

  useEffect(() => {
    let cancelled = false;

    loadLeaflet().then((L) => {
      if (cancelled || !mapElementRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(mapElementRef.current, { zoomControl: false, attributionControl: false }).setView([pickupPoint.lat, pickupPoint.lng], 14);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "OpenStreetMap"
        }).addTo(mapRef.current);
        L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);
      }

      const latLngs = routePoints.map((point) => [point.lat, point.lng]);
      if (!routeRef.current) {
        routeRef.current = L.polyline(latLngs, { color: "#FF5500", weight: 6, opacity: 0.9, lineCap: "round" }).addTo(mapRef.current);
      } else {
        routeRef.current.setLatLngs(latLngs);
      }

      const pickupIcon = L.divIcon({ className: "happy-map-pin happy-map-pickup", html: "<span></span>", iconSize: [28, 28] });
      const dropoffIcon = L.divIcon({ className: "happy-map-pin happy-map-dropoff", html: "<span></span>", iconSize: [28, 28] });
      const riderIcon = L.divIcon({ className: "happy-map-rider", html: "<span>HTC</span>", iconSize: [54, 54] });

      if (!pickupMarkerRef.current) pickupMarkerRef.current = L.marker([pickupPoint.lat, pickupPoint.lng], { icon: pickupIcon }).addTo(mapRef.current);
      else pickupMarkerRef.current.setLatLng([pickupPoint.lat, pickupPoint.lng]);
      if (!dropoffMarkerRef.current) dropoffMarkerRef.current = L.marker([dropoffPoint.lat, dropoffPoint.lng], { icon: dropoffIcon }).addTo(mapRef.current);
      else dropoffMarkerRef.current.setLatLng([dropoffPoint.lat, dropoffPoint.lng]);
      if (!riderMarkerRef.current) riderMarkerRef.current = L.marker([rider.lat, rider.lng], { icon: riderIcon }).addTo(mapRef.current);

      riderMarkerRef.current.setLatLng([rider.lat, rider.lng]);
      mapRef.current.fitBounds(routeRef.current.getBounds(), { padding: [42, 42] });
    });

    return () => {
      cancelled = true;
    };
  }, [dropoffPoint.lat, dropoffPoint.lng, pickupPoint.lat, pickupPoint.lng, rider.lat, rider.lng, routePoints]);

  function locateCustomer() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition((position) => {
      const current = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      reverseAddress(current.lat, current.lng)
        .then((data) => setCustomerGps(data.address ? formatAddress(data.address) : "Vendndodhja ime"))
        .catch(() => setCustomerGps("Vendndodhja ime"));

      loadLeaflet().then((L) => {
        if (!mapRef.current) return;
        const customerIcon = L.divIcon({ className: "happy-map-pin happy-map-customer", html: "<span></span>", iconSize: [28, 28] });
        if (!customerMarkerRef.current) customerMarkerRef.current = L.marker([current.lat, current.lng], { icon: customerIcon }).addTo(mapRef.current);
        customerMarkerRef.current.setLatLng([current.lat, current.lng]);
      });
    });
  }

  return (
    <section className="happy-shell relative min-h-[560px] overflow-hidden rounded-[34px] bg-white">
      <div className="absolute inset-0" ref={mapElementRef} />

      <div className="absolute left-4 right-4 top-4 flex flex-wrap items-center gap-3">
        <div className="rounded-[22px] bg-white/95 px-4 py-3 shadow-happy backdrop-blur">
          <p className="type-badge flex items-center uppercase tracking-wide text-black/45">
            <Bike className="mr-2 h-4 w-4 text-happy-orange" />
            Motoristi live
          </p>
          <strong className="type-restaurant mt-1 block">
            {rider.lat.toFixed(5)}, {rider.lng.toFixed(5)}
          </strong>
        </div>
        <div className="rounded-[22px] bg-white/95 px-4 py-3 shadow-happy backdrop-blur">
          <p className="type-badge uppercase tracking-wide text-black/45">ETA</p>
          <strong className="type-restaurant mt-1 block">{eta} min</strong>
        </div>
      </div>

      <div className="absolute bottom-4 left-4 right-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="rounded-[22px] bg-white/95 p-4 shadow-happy backdrop-blur">
          <p className="type-badge flex items-center uppercase tracking-wide text-black/45">
            <Crosshair className="mr-2 h-4 w-4 text-happy-orange" />
            GPS klienti
          </p>
          <p className="type-body mt-1">{customerGps}</p>
        </div>
        <button className="type-cta flex h-14 items-center justify-center rounded-xl bg-happy-orange px-5 text-white happy-pill-shadow" onClick={locateCustomer} type="button">
          <LocateFixed className="mr-2 h-5 w-5" />
          Perdor GPS
        </button>
      </div>
    </section>
  );
}
