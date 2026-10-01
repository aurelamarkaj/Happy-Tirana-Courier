"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { getRiderDashboard, sendRiderLocation, type RoutePoint } from "../lib/api";
import { getRiderSession } from "../lib/rider-session";
import { GPS_OPTIONS, gpsIssue } from "../lib/gps";
type GpsState = { location: RoutePoint | null; accuracy: number | null; message: string };
const initial: GpsState = {location:null, accuracy:null, message:"Po presim vendndodhjen e pajisjes."};
const GpsContext = createContext<GpsState>(initial);
export const useRiderGps = () => useContext(GpsContext);
export function RiderGpsProvider({children}: {children:ReactNode}) {
  const pathname=usePathname();
  const [tracking,setTracking]=useState(false);
  const [state,setState]=useState<GpsState>(initial);
  useEffect(()=>{
    let cancelled=false;
    const check=async()=>{
      if(!getRiderSession()){if(!cancelled)setTracking(false);return;}
      try {const d=await getRiderDashboard();if(!cancelled)setTracking(d.rider.isOnline || d.activeOrders.length>0);}
      catch {if(!getRiderSession()&&!cancelled)setTracking(false);}
    };
    void check();const timer=setInterval(check,15000);
    window.addEventListener("rider-order-update",check);
    return()=>{cancelled=true;clearInterval(timer);window.removeEventListener("rider-order-update",check);};
  },[pathname]);
  useEffect(()=>{
    if(!tracking){setState({...initial,message:"Aktivizo Online për të transmetuar GPS-in."});return;}
    if(!navigator.geolocation){setState({...initial,message:"Pajisja nuk ofron GPS."});return;}
    let cancelled=false,lastSent=0,lastFix=0,sequence=0;
    const update=(pos:GeolocationPosition)=>{
      if(cancelled)return;
      const issue=gpsIssue(pos);
      if(issue){setState({...initial,message:issue});return;}
      const location={lat:pos.coords.latitude,lng:pos.coords.longitude};
      const accuracy=pos.coords.accuracy;lastFix=Date.now();
      const message=(accuracy>100 ? "GPS i përafërt" : "GPS live")+" · Saktësia ±"+Math.round(accuracy)+" m";
      setState({location,accuracy,message});
      if(Date.now()-lastSent<5000)return;
      lastSent=Date.now();const current=++sequence;
      void sendRiderLocation({...location,accuracy,speed:pos.coords.speed??undefined,heading:pos.coords.heading??undefined})
       .catch(()=>{if(!cancelled&&current===sequence){lastSent=0;setState({location,accuracy,message:"GPS u gjet, por nuk u dërgua te admini. Kontrollo internetin."});}});
    };
    const failed=(error:GeolocationPositionError)=>{if(cancelled)return;setState({...initial,message:error.code===1 ? "Lejo vendndodhjen në pajisje dhe shfletues që admini të shohë GPS-in." : "GPS nuk u gjet. Kontrollo vendndodhjen e pajisjes; po riprovojmë."});};
    const watch=navigator.geolocation.watchPosition(update,failed,GPS_OPTIONS);
    const refresh=setInterval(()=>navigator.geolocation.getCurrentPosition(update,failed,GPS_OPTIONS),15000);
    const expiry=setInterval(()=>{if(lastFix&&Date.now()-lastFix>30000){lastFix=0;setState({...initial,message:"GPS nuk është përditësuar. Po presim matje të re."});}},5000);
    return()=>{cancelled=true;navigator.geolocation.clearWatch(watch);clearInterval(expiry);clearInterval(refresh);};
  },[tracking]);
  return <GpsContext.Provider value={state}>{children}</GpsContext.Provider>;
}
