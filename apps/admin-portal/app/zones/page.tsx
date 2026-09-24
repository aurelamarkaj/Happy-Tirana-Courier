"use client";
import {useEffect,useState} from "react";
import {ZoneBuilderMap} from "../../components/admin-map";
import {AdminShell} from "../../components/admin-shell";
import {getAdminZones,type AdminZone} from "../../lib/api";
export default function ZonesPage(){
 const [zones,setZones]=useState<AdminZone[]>([]);
 const [error,setError]=useState("");
 useEffect(()=>{getAdminZones().then(data=>setZones(data.zones)).catch(()=>setError("Zonat nuk u ngarkuan. Rifresko faqen."));},[]);
 return <AdminShell title="Zona" eyebrow="Harta e tarifës" description="Kufiri i zonës pa shtesën 100 ALL">
  {error && <p role="alert">{error}</p>}
  <ZoneBuilderMap readOnly points={[]} zones={zones.filter(zone=>zone.active && zone.isSurchargeArea)} onPointsChange={()=>{}} />
 </AdminShell>;
}
