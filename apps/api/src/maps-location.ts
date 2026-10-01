export function isGoogleMapsUrl(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (["maps.app.goo.gl", "goo.gl", "maps.google.com"].includes(url.hostname) ||
       (["google.com", "www.google.com"].includes(url.hostname) && url.pathname.startsWith("/maps")));
  } catch { return false; }
}
function coordinates(text: string) {
  let decoded = text;
  try { decoded = decodeURIComponent(text); } catch { /* HTML can contain literal percent signs. */ }
  // Place coordinates have priority over the @ camera centre in Maps links.
  const match = decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) ??
    decoded.match(/[?&](?:q|query|destination|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const lat = Number(match[1]), lng = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
export async function resolveGoogleMapsDestination(originalUrl: string, timeoutMs = 10000) {
  originalUrl = originalUrl.trim();
  if (!isGoogleMapsUrl(originalUrl)) throw new Error("INVALID_GOOGLE_MAPS_LINK");
  const deadline=Date.now()+timeoutMs;
  let url = originalUrl;
  for (let redirect = 0; redirect < 6; redirect++) {
    if (!isGoogleMapsUrl(url)) throw new Error("INVALID_GOOGLE_MAPS_LINK");
    const direct = coordinates(url);
    if (direct) return { ...direct, originalUrl, resolvedUrl: url, addressText: "Google Maps: "+direct.lat+", "+direct.lng };
    let result: {status:number;location:string|null;html:string}|undefined;
    for(let attempt=0;attempt<2;attempt++){
      const remaining=deadline-Date.now();
      if(remaining<=0)throw new Error("GOOGLE_MAPS_LINK_TIMEOUT");
      try{
        const response=await fetch(url,{redirect:"manual",signal:AbortSignal.timeout(Math.max(1,Math.min(remaining,timeoutMs/2)))});
        result={status:response.status,location:response.headers.get("location"),html:await response.text()};
        break;
      }catch(error){
        if(attempt===1 || Date.now()>=deadline){
          const name=error instanceof Error?error.name:"";
          throw new Error(name==="TimeoutError"||name==="AbortError"?"GOOGLE_MAPS_LINK_TIMEOUT":"GOOGLE_MAPS_LINK_UNAVAILABLE");
        }
      }
    }
    if(!result)throw new Error("GOOGLE_MAPS_LINK_UNAVAILABLE");
    if(result.status>=300 && result.status<400){
      if(!result.location)break;
      url=new URL(result.location,url).href;continue;
    }
    if(result.status<200||result.status>=300)break;
    const point=coordinates(result.html);
    if(point)return {...point,originalUrl,resolvedUrl:url,addressText:"Google Maps: "+point.lat+", "+point.lng};
    break;
  }
  throw new Error("GOOGLE_MAPS_LOCATION_NOT_RESOLVED");
}
