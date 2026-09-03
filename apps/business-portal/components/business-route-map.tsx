"use client";

import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getRoute, type BusinessOrderQuote } from "../lib/api";
import { hasGoogleMapsKey, loadGoogleMaps } from "../lib/google-maps";

type Point = { lat: number; lng: number };

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
}: {
  business: { name: string; lat: number; lng: number };
  quote: BusinessOrderQuote | null;
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const pickupMarkerRef = useRef<any>(null);
  const dropoffMarkerRef = useRef<any>(null);
  const routeRef = useRef<any>(null);
  const [loadError, setLoadError] = useState(false);
  const [routePoints, setRoutePoints] = useState<Point[]>([]);

  const pickup = { lat: business.lat, lng: business.lng };
  const dropoff = quote ? { lat: quote.lat, lng: quote.lng } : null;

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
      })
      .catch(() => setLoadError(true));

    return () => {
      cancelled = true;
    };
  }, [pickup.lat, pickup.lng]);

  useEffect(() => {
    if (!dropoff) {
      setRoutePoints([]);
      return;
    }
    getRoute({
      fromLat: pickup.lat,
      fromLng: pickup.lng,
      toLat: dropoff.lat,
      toLng: dropoff.lng,
    })
      .then((route) =>
        setRoutePoints(
          route.coordinates.length > 1 ? route.coordinates : [pickup, dropoff],
        ),
      )
      .catch(() => setRoutePoints([pickup, dropoff]));
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
  }, [dropoff, pickup, routePoints]);

  return (
    <div className="relative min-h-64 overflow-hidden rounded-2xl border border-white/10 bg-[#171717]">
      <div className="absolute inset-0" ref={mapElementRef} />
      {loadError || !hasGoogleMapsKey() ? (
        <MapFallback
          distance={quote ? `${quote.distanceKm.toFixed(2)} km` : business.name}
        />
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
      <div className="absolute left-[13%] top-[56%] h-1.5 w-[74%] -rotate-6 rounded-full bg-happy-orange/75 shadow-[0_0_26px_rgba(255,85,0,.34)]" />
      <div className="absolute left-[22%] top-[38%] grid h-10 w-10 place-items-center rounded-2xl border border-white/30 bg-[#101010] text-sm font-extrabold text-white shadow-happy">
        B
      </div>
      <div className="absolute right-[24%] top-[58%] grid h-10 w-10 place-items-center rounded-2xl border border-white/30 bg-happy-orange text-sm font-extrabold text-white shadow-happy">
        K
      </div>
      <div className="absolute bottom-3 right-3 rounded-2xl border border-white/10 bg-[#101010]/86 px-3 py-2 text-white shadow-happy backdrop-blur">
        <p className="type-badge uppercase text-happy-orange">Google Maps</p>
        <p className="type-secondary mt-1 text-white/60">{distance}</p>
      </div>
    </div>
  );
}
