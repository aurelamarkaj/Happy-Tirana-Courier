export interface RouteInput {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  intermediates?: Array<{ lat: number; lng: number }>;
}

interface GoogleRoute {
  distanceMeters?: number;
  duration?: string;
  polyline?: { encodedPolyline?: string };
}

const googleMapsHttpReferrer =
  process.env.GOOGLE_MAPS_HTTP_REFERRER?.trim() ?? "";

export function getEstimatedRoadRoute(input: RouteInput) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const distanceBetween = (
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ) => {
    const earthRadiusMeters = 6_371_000;
    const latDelta = toRadians(to.lat - from.lat);
    const lngDelta = toRadians(to.lng - from.lng);
    const a =
      Math.sin(latDelta / 2) ** 2 +
      Math.cos(toRadians(from.lat)) *
        Math.cos(toRadians(to.lat)) *
        Math.sin(lngDelta / 2) ** 2;
    return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };
  const points = [
    { lat: input.originLat, lng: input.originLng },
    ...(input.intermediates ?? []),
    { lat: input.destinationLat, lng: input.destinationLng },
  ];
  const straightLineMeters = points
    .slice(1)
    .reduce(
      (total, point, index) => total + distanceBetween(points[index], point),
      0,
    );
  const distanceMeters = Math.round(straightLineMeters * 1.2);

  return {
    distanceMeters,
    durationSeconds: Math.round(distanceMeters / (30_000 / 3_600)),
    encodedPolyline: "",
    source: "HAVERSINE_ROAD_ESTIMATE_FALLBACK",
  };
}

export async function getGoogleRoadRoute(
  apiKey: string,
  input: RouteInput,
  options: { allowEstimate?: boolean } = {},
): Promise<{distanceMeters:number;durationSeconds:number;encodedPolyline:string;source:string}> {
  if (input.intermediates?.length) {
    const points = [{lat:input.originLat,lng:input.originLng}, ...input.intermediates,
      {lat:input.destinationLat,lng:input.destinationLng}];
    const legs = [];
    for (let i=1; i<points.length; i++) {
      legs.push(await getGoogleRoadRoute(apiKey, {
        originLat:points[i-1].lat, originLng:points[i-1].lng,
        destinationLat:points[i].lat, destinationLng:points[i].lng,
      }, options));
    }
    return {
      distanceMeters:legs.reduce((sum,leg)=>sum+leg.distanceMeters,0),
      durationSeconds:legs.reduce((sum,leg)=>sum+leg.durationSeconds,0),
      encodedPolyline:encodePolyline(legs.flatMap(leg=>decodePolyline(leg.encodedPolyline))),
      source:"GOOGLE_ROUTES_SHORTEST_ROAD_IGNORE_TRAFFIC",
    };
  }
  if (!apiKey || apiKey.toLowerCase().includes("replace-with")) {
    if (options.allowEstimate !== true)
      throw new Error("GOOGLE_DIRECTIONS_API_KEY_REQUIRED");
    return getEstimatedRoadRoute(input);
  }
  try {
    const response = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(googleMapsHttpReferrer
            ? { Referer: googleMapsHttpReferrer }
            : {}),
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
        },
        body: JSON.stringify({
          origin: {
            location: {
              latLng: {
                latitude: input.originLat,
                longitude: input.originLng,
              },
            },
          },
          destination: {
            location: {
              latLng: {
                latitude: input.destinationLat,
                longitude: input.destinationLng,
              },
            },
          },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_UNAWARE",
          computeAlternativeRoutes: !input.intermediates?.length,
          intermediates: input.intermediates?.map((p) => ({
            location: { latLng: { latitude: p.lat, longitude: p.lng } },
          })),
          units: "METRIC",
        }),
        signal: AbortSignal.timeout(6000),
      },
    );
    const data = (await response.json()) as {
      routes?: GoogleRoute[];
      error?: { details?: Array<{ reason?: string }> };
    };
    if (!response.ok) {
      if (
        data.error?.details?.some(
          (detail) => detail.reason === "SERVICE_DISABLED",
        )
      ) {
        throw new Error("GOOGLE_DIRECTIONS_SERVICE_DISABLED");
      }
      if (response.status === 403)
        throw new Error("GOOGLE_DIRECTIONS_REQUEST_DENIED");
      if (response.status === 429)
        throw new Error("GOOGLE_DIRECTIONS_OVER_QUERY_LIMIT");
      throw new Error("GOOGLE_DIRECTIONS_REQUEST_FAILED");
    }
    const route = data.routes
      ?.filter(
        (route) =>
          Number.isFinite(route.distanceMeters) && route.distanceMeters! >= 0,
      )
      .sort((a, b) => a.distanceMeters! - b.distanceMeters!)[0];
    if (!route) throw new Error("GOOGLE_DIRECTIONS_ROUTE_NOT_FOUND");
    const durationSeconds = Number(route.duration?.replace(/s$/, ""));
    return {
      distanceMeters: Math.round(route.distanceMeters!),
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
      encodedPolyline: route.polyline?.encodedPolyline ?? "",
      source: "GOOGLE_ROUTES_SHORTEST_ROAD_IGNORE_TRAFFIC",
    };
  } catch (error) {
    if (options.allowEstimate !== true) {
      if (
        error instanceof Error &&
        error.message.startsWith("GOOGLE_DIRECTIONS_")
      )
        throw error;
      throw new Error("GOOGLE_DIRECTIONS_REQUEST_FAILED");
    }
    return getEstimatedRoadRoute(input);
  }
}

function decodePolyline(encoded: string): number[][] {
  let index=0, lat=0, lng=0;
  const points:number[][]=[];
  function value() {
    let result=0, shift=0, byte;
    do { byte=encoded.charCodeAt(index++)-63; result|=(byte&31)<<shift; shift+=5; } while(byte>=32 && index<encoded.length);
    return result&1 ? ~(result>>1) : result>>1;
  }
  while(index<encoded.length) {lat+=value();lng+=value();points.push([lat,lng]);}
  return points;
}
function encodePolyline(points:number[][]):string {
  let lat=0,lng=0,result="";
  function value(delta:number) {
    let n=delta<0 ? ~(delta<<1) : delta<<1;
    while(n>=32) {result+=String.fromCharCode((32|(n&31))+63);n>>=5;}
    result+=String.fromCharCode(n+63);
  }
  for(const p of points) {value(p[0]-lat);value(p[1]-lng);[lat,lng]=p;}
  return result;
}
