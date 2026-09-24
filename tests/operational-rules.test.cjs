const {test}=require("node:test");
const assert=require("node:assert/strict");
require("tsx/cjs");
const rules=require("../apps/api/src/operational-rules.ts");
const {assertSecondOrderEligible}=require("../apps/api/src/rider-eligibility.ts");
const {resolveGoogleMapsDestination}=require("../apps/api/src/maps-location.ts");
const {getGoogleRoadRoute}=require("../apps/api/src/google-routes.ts");

test("one dispatch timing rule",()=>{
  for(const ready of [0,1,8,9,10])assert.equal(rules.firstOfferDelayMinutes(ready),9);
  assert.equal(rules.firstOfferDelayMinutes(15),14);
});
test("debit 4999.99 allowed; 5000/5001 blocked; config above 5000 rejected",()=>{
  const old=process.env.RIDER_DEBIT_LIMIT_ALL;
  try {
    process.env.RIDER_DEBIT_LIMIT_ALL="5000";
    assert.equal(rules.debitEligible(4999.99),true);
    for(const value of [5000,5001])assert.equal(rules.debitEligible(value),false);
    process.env.RIDER_DEBIT_LIMIT_ALL="5001";assert.throws(rules.debitLimit,/at most 5000/);
  }finally{if(old===undefined)delete process.env.RIDER_DEBIT_LIMIT_ALL;else process.env.RIDER_DEBIT_LIMIT_ALL=old;}
});
test("Maps resolves short link, preserves original, rejects redirect to non-Google host",async t=>{
  t.mock.method(global,"fetch",async()=>new Response(null,{status:302,headers:{location:"https://www.google.com/maps?q=41.33,19.82"}}));
  const result=await resolveGoogleMapsDestination("https://maps.app.goo.gl/test");
  assert.equal(result.originalUrl,"https://maps.app.goo.gl/test");assert.equal(result.lat,41.33);
  global.fetch.mock.mockImplementation(async()=>new Response(null,{status:302,headers:{location:"http://127.0.0.1/secret"}}));
  await assert.rejects(resolveGoogleMapsDestination("https://maps.app.goo.gl/test"),/INVALID_GOOGLE_MAPS_LINK/);
});
test("second order uses the two business and destination pairs with a 500 m cap",async t=>{
  const keys=["SECOND_ORDER_BUSINESS_RADIUS_METERS","SECOND_ORDER_DESTINATION_RADIUS_METERS"];
  const old=keys.map(k=>process.env[k]);
  const routes=[];
  let businessMeters=500,destinationMeters=500;
  const locations={first_business_id:"business-1",second_business_id:"business-2",
      first_business_lat:41.3,first_business_lng:19.8,second_business_lat:41.301,second_business_lng:19.801,
      first_destination_lat:41.2,first_destination_lng:19.7,second_destination_lat:41.201,second_destination_lng:19.701};
  const client={query:async sql=>sql.startsWith("SELECT id, status")?{rows:[{id:"first",status:"PICKED_UP"}]}:{rows:[locations]}};
  t.mock.method(global,"fetch",async(_url,options)=>{
    const request=JSON.parse(options.body);routes.push(request);
    return Response.json({routes:[{distanceMeters:request.origin.location.latLng.latitude===41.3?businessMeters:destinationMeters}]});
  });
  try{
    keys.forEach(k=>delete process.env[k]);
    assert.deepEqual(rules.secondOrderLimits(),{business:500,destination:500});
    await assertSecondOrderEligible(client,"r","o","test");
    assert.equal(routes.length,2);
    assert.deepEqual(routes.map(r=>r.origin.location.latLng),[{latitude:41.3,longitude:19.8},{latitude:41.2,longitude:19.7}]);
    assert.deepEqual(routes.map(r=>r.destination.location.latLng),[{latitude:41.301,longitude:19.801},{latitude:41.201,longitude:19.701}]);
    businessMeters=501;
    await assert.rejects(assertSecondOrderEligible(client,"r","o","test"),/SECOND_ORDER_BUSINESS_TOO_FAR/);
    businessMeters=500;destinationMeters=501;
    await assert.rejects(assertSecondOrderEligible(client,"r","o","test"),/SECOND_ORDER_DESTINATION_TOO_FAR/);
    locations.second_destination_lat=locations.first_destination_lat;
    locations.second_destination_lng=locations.first_destination_lng;
    const callsBefore=routes.length;
    await assertSecondOrderEligible(client,"r","o","test");
    assert.equal(routes.length,callsBefore+1,"identical destinations should count as zero without a route request");
    keys.forEach(k=>process.env[k]="5000");
    assert.deepEqual(rules.secondOrderLimits(),{business:500,destination:500});
  }finally{keys.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i]);}
});
test("route legs all use shortest distance, no silent estimate without a key",async t=>{
  await assert.rejects(getGoogleRoadRoute("",{originLat:41,originLng:19,destinationLat:42,destinationLng:20}),/API_KEY_REQUIRED/);
  let calls=0;
  t.mock.method(global,"fetch",async(_url,options)=>{
    calls++;const request=JSON.parse(options.body);
    assert.equal(request.computeAlternativeRoutes,true);
    return Response.json({routes:[{distanceMeters:500,duration:"1s"},{distanceMeters:100,duration:"100s"}]});
  });
  const route=await getGoogleRoadRoute("test",{originLat:41,originLng:19,destinationLat:42,destinationLng:20,intermediates:[{lat:41.5,lng:19.5}]});
  assert.equal(calls,2);assert.equal(route.distanceMeters,200);
});
