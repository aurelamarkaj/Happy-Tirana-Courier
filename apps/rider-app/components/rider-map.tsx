"use client";

import { MapPin, Navigation2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getRoute,
  reverseAddress,
  sendRiderLocation,
  type RiderOrder,
  type RoutePoint,
} from "../lib/api";
import {
  createHappyMarker,
  hasGoogleMapsKey,
  loadGoogleMaps,
} from "../lib/google-maps";

const defaultCenter = { lat: 41.3275, lng: 19.8187 };

function fitMapToPoints(map: any, points: RoutePoint[]) {
  if (!points.length) return;
  const bounds = new window.google.maps.LatLngBounds();
  points.forEach((point) => bounds.extend(point));
  map.fitBounds(bounds, 42);
}

function clearOverlay(overlay: { setMap: (map: any) => void } | null) {
  if (overlay) overlay.setMap(null);
}

export function RiderMap({
  order,
  isOnline,
  leg,
}: {
  order: RiderOrder | null;
  isOnline: boolean;
  leg: "pickup" | "dropoff";
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const routeRef = useRef<any>(null);
  const riderMarkerRef = useRef<any>(null);
  const pickupMarkerRef = useRef<any>(null);
  const dropoffMarkerRef = useRef<any>(null);
  const [currentLocation, setCurrentLocation] = useState<RoutePoint | null>(null);
  const [currentAddress, setCurrentAddress] = useState(
    "Pozicioni do ruhet vetem kur je online.",
  );
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [message, setMessage] = useState("Aktivizo online per GPS live.");
  const [loadError, setLoadError] = useState(false);

  const destination = useMemo(() => {
    if (!order) return null;
    return leg === "pickup"
      ? { lat: order.pickupLat, lng: order.pickupLng }
      : { lat: order.dropoffLat, lng: order.dropoffLng };
  }, [leg, order]);

  useEffect(() => {
    if (!isOnline || !navigator.geolocation) {
      if (!isOnline) {
        setCurrentAddress("Pozicioni do ruhet vetem kur je online.");
        setCurrentLocation(null);
      }
      return;
    }

    let reverseTimeout: number | undefined;
    const watcherId = navigator.geolocation.watchPosition(
      (position) => {
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setCurrentLocation(next);
        setMessage("GPS live aktiv.");
        setCurrentAddress("Po lexohet adresa aktuale...");
        sendRiderLocation({
          ...next,
          orderId: order?.id ?? null,
          speed: position.coords.speed ?? undefined,
          heading: position.coords.heading ?? undefined,
        }).catch(() => setMessage("GPS u lexua, por nuk u ruajt dot ne API."));
        if (reverseTimeout) window.clearTimeout(reverseTimeout);
        reverseTimeout = window.setTimeout(() => {
          reverseAddress(next)
            .then((data) => {
              const address = data.address;
              setCurrentAddress(
                address
                  ? address.details || `${address.label}, ${address.city}`
                  : `${next.lat.toFixed(5)}, ${next.lng.toFixed(5)}`,
              );
            })
            .catch(() =>
              setCurrentAddress(`${next.lat.toFixed(5)}, ${next.lng.toFixed(5)}`),
            );
        }, 650);
      },
      () => {
        setMessage("Lejo GPS ne browser per gjurmim live.");
        setCurrentAddress("Lejo GPS ne browser per vendndodhjen live.");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 },
    );

    return () => {
      navigator.geolocation.clearWatch(watcherId);
      if (reverseTimeout) window.clearTimeout(reverseTimeout);
    };
  }, [isOnline, order?.id]);

  useEffect(() => {
    if (!destination || !currentLocation) {
      setRoutePoints([]);
      return;
    }

    getRoute({
      fromLat: currentLocation.lat,
      fromLng: currentLocation.lng,
      toLat: destination.lat,
      toLng: destination.lng,
    })
      .then((route) =>
        setRoutePoints(
          route.coordinates.length > 1
            ? route.coordinates
            : [currentLocation, destination],
        ),
      )
      .catch(() => setRoutePoints([currentLocation, destination]));
  }, [currentLocation, destination]);

  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapElementRef.current) return;
        if (!mapRef.current) {
          mapRef.current = new window.google.maps.Map(mapElementRef.current, {
            center: currentLocation ?? destination ?? defaultCenter,
            clickableIcons: false,
            fullscreenControl: false,
            mapTypeControl: false,
            streetViewControl: false,
            zoom: 14,
            zoomControl: true,
          });
        }
      })
      .catch(() => setLoadError(true));

    return () => {
      cancelled = true;
    };
  }, [currentLocation, destination]);

  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return;
    const map = mapRef.current;

    if (order) {
      const pickup = { lat: order.pickupLat, lng: order.pickupLng };
      const dropoff = { lat: order.dropoffLat, lng: order.dropoffLng };
      if (!pickupMarkerRef.current)
        pickupMarkerRef.current = createHappyMarker(map, pickup, "B", "#101010");
      else pickupMarkerRef.current.setPosition(pickup);

      if (!dropoffMarkerRef.current)
        dropoffMarkerRef.current = createHappyMarker(map, dropoff, "K", "#FF5500");
      else dropoffMarkerRef.current.setPosition(dropoff);
    } else {
      clearOverlay(pickupMarkerRef.current);
      clearOverlay(dropoffMarkerRef.current);
      pickupMarkerRef.current = null;
      dropoffMarkerRef.current = null;
    }

    if (currentLocation) {
      if (!riderMarkerRef.current)
        riderMarkerRef.current = createHappyMarker(
          map,
          currentLocation,
          "HTC",
          "#FF5500",
        );
      else riderMarkerRef.current.setPosition(currentLocation);
    } else {
      clearOverlay(riderMarkerRef.current);
      riderMarkerRef.current = null;
    }

    if (routeRef.current) routeRef.current.setMap(null);
    routeRef.current = null;
    if (routePoints.length > 1) {
      routeRef.current = new window.google.maps.Polyline({
        geodesic: true,
        map,
        path: routePoints,
        strokeColor: "#FF5500",
        strokeOpacity: 0.95,
        strokeWeight: 6,
      });
      fitMapToPoints(map, routePoints);
    } else {
      const center = currentLocation ?? destination ?? defaultCenter;
      map.setCenter(center);
      map.setZoom(14);
    }
  }, [currentLocation, destination, order, routePoints]);

  return (
    <section className="rider-panel relative min-h-[360px] overflow-hidden rounded-3xl border shadow-happy md:min-h-[520px]">
      <div className="absolute inset-0" ref={mapElementRef} />
      {loadError || !hasGoogleMapsKey() ? <MapFallback /> : null}
      <div className="absolute left-4 right-4 top-4 flex items-center justify-between gap-3">
        <div className="rounded-2xl bg-white/95 px-4 py-3 text-happy-black shadow-happy backdrop-blur">
          <p className="type-badge uppercase text-black/45">
            {leg === "pickup" ? "Drejt biznesit" : "Drejt klientit"}
          </p>
          <strong className="type-product mt-1 block">
            {order
              ? leg === "pickup"
                ? order.businessName
                : order.dropoffAddress
              : "Pa porosi aktive"}
          </strong>
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
        <p className="type-body mt-1 text-white/82">{currentAddress}</p>
        {currentLocation ? (
          <p className="type-secondary mt-1 text-white/48">
            GPS live: {currentLocation.lat.toFixed(5)},{" "}
            {currentLocation.lng.toFixed(5)}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function MapFallback() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[linear-gradient(135deg,#171717_0%,#242424_45%,#101010_100%)]">
      <div className="absolute inset-0 opacity-28 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="absolute left-[10%] top-[52%] h-1.5 w-[82%] -rotate-12 rounded-full bg-happy-orange/75 shadow-[0_0_30px_rgba(255,85,0,.38)]" />
      <div className="absolute left-[20%] top-[38%] grid h-11 w-11 place-items-center rounded-2xl border border-white/30 bg-[#101010] text-sm font-extrabold text-white shadow-happy">
        B
      </div>
      <div className="absolute right-[24%] top-[62%] grid h-11 w-11 place-items-center rounded-2xl border border-white/30 bg-happy-orange text-sm font-extrabold text-white shadow-happy">
        K
      </div>
      <div className="absolute right-4 top-24 hidden max-w-[220px] rounded-2xl border border-white/10 bg-[#101010]/82 p-3 text-white shadow-happy backdrop-blur sm:block">
        <p className="type-badge uppercase text-happy-orange">Google Maps</p>
        <p className="type-secondary mt-1 text-white/60">
          Harta reale ndizet sapo vendoset API key.
        </p>
      </div>
    </div>
  );
}
