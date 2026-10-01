type BusinessError = {status?:number;code?:string;issues?:Array<{path:(string|number)[]}>};
export function businessErrorMessage(error: unknown, editing: boolean): string {
 const e=(error ?? {}) as BusinessError;
 const messages:Record<string,string>={
  USER_EMAIL_EXISTS:"Ky email përdoret nga një llogari tjetër. Vendos një email tjetër për biznesin.",
  USER_PHONE_EXISTS:"Ky numër telefoni përdoret nga një llogari tjetër.",
  INVALID_GOOGLE_MAPS_LINK:"Linku Google Maps nuk është i vlefshëm. Kopjo linkun e vendndodhjes nga Google Maps.",
  GOOGLE_MAPS_LOCATION_NOT_RESOLVED:"Nuk u gjet pozicioni nga linku Google Maps. Përdor Share/Ndaj te pika e biznesit ose një link me koordinata.",
  GOOGLE_MAPS_LINK_TIMEOUT:"Google Maps nuk u përgjigj në kohë. Biznesi nuk u krijua. Provo sërish ose përdor linkun e plotë me koordinata.",
  GOOGLE_MAPS_LINK_UNAVAILABLE:"Serveri nuk arriti të hapë Google Maps. Provo sërish ose përdor linkun e plotë me koordinata.",
  ADMIN_API_TIMEOUT:"Serveri nuk u përgjigj në kohë. Rifresko listën për të kontrolluar nëse biznesi u ruajt para se të provosh përsëri."
 };
 if(e.status===401 || e.status===403)return "Sesioni i adminit ka skaduar ose nuk ka leje. Hyr përsëri dhe provo.";
 if(e.status===413)return "Fotoja ose të dhënat janë shumë të mëdha. Përdor një foto deri në 2 MB.";
 if(messages[e.code ?? ""])return messages[e.code!];
 if(e.code==="VALIDATION_ERROR"){
  const fields:Record<string,string>={name:"Emri i biznesit (minimumi 2 karaktere)",phone:"Telefoni (minimumi 6 karaktere)",email:"Email-i për login",password:"Fjalëkalimi (minimumi 6 karaktere)",addressText:"Adresa (minimumi 4 karaktere)",googleMapsUrl:"Linku Google Maps",category:"Kategoria"};
  const names=[...new Set((e.issues??[]).map(i=>fields[String(i.path[0])]??String(i.path[0])))];
  return names.length ? "Kontrollo këto fusha: "+names.join(", ")+"." : "Plotëso saktë fushat e detyrueshme.";
 }
 if(error instanceof TypeError || (e.status??0)>=500)return "Nuk u arrit lidhja me serverin. Kontrollo lidhjen dhe shërbimin API.";
 return editing ? "Biznesi nuk u përditësua. Provo përsëri." : "Biznesi nuk u krijua. Provo përsëri.";
}
