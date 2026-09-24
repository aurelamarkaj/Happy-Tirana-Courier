"use client";

import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getRoute, type BusinessOrderQuote } from "../lib/api";
import { hasGoogleMapsKey, loadGoogleMaps } from "../lib/google-maps";

type Point = { lat: number; lng: number };
const tiranaFallback: Point = { lat: 41.3275, lng: 19.8187 };

function validPoint(lat: number, lng: number): Point {
  return Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001)
    ? { lat, lng }
    : tiranaFallback;
}

function clearOverlay(overlay: { setMap: (map: any) => void } | null) {
  if (overlay) overlay.setMap(null);
}

function marker(map: any, position: Point, label: string, color: string) {
  return new window.google.maps.Marker({
    map,
    position,
    label: {
      text: label,
      color: "#ffffff",
      fontSize: "12px",
      fontWeight: "800",
    },
    icon: {
      path: window.google.maps.SymbolPath.CIRCLE,
      scale: 14,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeOpacity: 0.9,
      strokeWeight: 2,
    },
  });
}

function fit(map: any, points: Point[]) {
  const bounds = new window.google.maps.LatLngBounds();
  points.forEach((point) => bounds.extend(point));
  map.fitBounds(bounds, 42);
}

export function BusinessRouteMap({
  business,
  quote,
  destination,
}: {
  business: { name: string; lat: number; lng: number };
  quote: BusinessOrderQuote | null;
  destination?: Point | null;
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const pickupMarkerRef = useRef<any>(null);
  const dropoffMarkerRef = useRef<any>(null);
  const routeRef = useRef<any>(null);
  const [loadError, setLoadError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [routeError, setRouteError] = useState(false);
  const [routePoints, setRoutePoints] = useState<Point[]>([]);

  const pickup = validPoint(business.lat, business.lng);
  const dropoff = quote ? { lat: quote.lat, lng: quote.lng } : destination ?? null;

  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapElementRef.current) return;
        if (!mapRef.current) {
          mapRef.current = new window.google.maps.Map(mapElementRef.current, {
            center: pickup,
            clickableIcons: false,
            fullscreenControl: false,
            mapTypeControl: false,
            streetViewControl: false,
            zoom: 13,
            zoomControl: true,
          });
        }
        setMapReady(true);
      })
      .catch(() => setLoadError(true));

    return () => {
      cancelled = true;
    };
  }, [pickup.lat, pickup.lng]);

  useEffect(() => {
    let cancelled = false;
    setRoutePoints([]);
    setRouteError(false);
    if (!dropoff) {
      return;
    }
    getRoute({
      fromLat: pickup.lat,
      fromLng: pickup.lng,
      toLat: dropoff.lat,
      toLng: dropoff.lng,
    })
      .then((route) => {
        if (cancelled) return;
        setRoutePoints(route.coordinates.length > 1 ? route.coordinates : []);
        setRouteError(route.coordinates.length < 2);
      })
      .catch(() => { if (!cancelled) setRouteError(true); });
    return () => { cancelled = true; };
  }, [dropoff?.lat, dropoff?.lng, pickup.lat, pickup.lng]);

  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return;
    const map = mapRef.current;

    if (!pickupMarkerRef.current)
      pickupMarkerRef.current = marker(map, pickup, "B", "#101010");
    else pickupMarkerRef.current.setPosition(pickup);

    if (dropoff) {
      if (!dropoffMarkerRef.current)
        dropoffMarkerRef.current = marker(map, dropoff, "K", "#FF5500");
      else dropoffMarkerRef.current.setPosition(dropoff);
    } else if (dropoff) {
      fit(map, [pickup, dropoff]);
    } else {
      clearOverlay(dropoffMarkerRef.current);
      dropoffMarkerRef.current = null;
    }

    clearOverlay(routeRef.current);
    routeRef.current = null;
    if (routePoints.length > 1) {
      routeRef.current = new window.google.maps.Polyline({
        geodesic: true,
        map,
        path: routePoints,
        strokeColor: "#FF5500",
        strokeOpacity: 0.95,
        strokeWeight: 5,
      });
      fit(map, routePoints);
    } else {
      map.setCenter(pickup);
      map.setZoom(13);
    }
  }, [dropoff, pickup, routePoints, mapReady]);

  return (
    <div className="relative min-h-64 overflow-hidden rounded-2xl border border-white/10 bg-[#171717]">
      <div className="absolute inset-0" ref={mapElementRef} />
      {loadError || !hasGoogleMapsKey() ? (
        <MapFallback
          distance={quote ? `${quote.distanceKm.toFixed(2)} km` : business.name}
        />
      ) : null}
      {routeError && !loadError && hasGoogleMapsKey() ? (
        <p className="absolute bottom-3 left-3 right-3 rounded-xl bg-[#101010]/90 p-3 text-sm text-white" role="status">
          Rruga nuk mund të ngarkohet. Shfaqen vetëm pikat e lokacionit.
        </p>
      ) : null}
      <div className="absolute left-3 top-3 rounded-2xl bg-[#101010]/90 px-3 py-2 text-white shadow-happy backdrop-blur">
        <p className="type-badge flex items-center uppercase text-white/55">
          <MapPin className="mr-2 h-4 w-4 text-happy-orange" />
          Google Maps
        </p>
        <p className="type-secondary mt-1 text-white/70">
          {quote ? `${quote.distanceKm.toFixed(2)} km` : business.name}
        </p>
      </div>
    </div>
  );
}

function MapFallback({ distance }: { distance: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[linear-gradient(135deg,#181818_0%,#242424_48%,#131313_100%)]">
      <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:38px_38px]" />
      <p className="absolute inset-x-4 top-1/2 text-center text-sm text-white/70" role="status">Harta nuk mund të ngarkohet.</p>
      <div className="absolute bottom-3 right-3 rounded-2xl border border-white/10 bg-[#101010]/86 px-3 py-2 text-white shadow-happy backdrop-blur">
        <p className="type-badge uppercase text-happy-orange">Google Maps</p>
        <p className="type-secondary mt-1 text-white/60">{distance}</p>
      </div>
    </div>
  );
}
