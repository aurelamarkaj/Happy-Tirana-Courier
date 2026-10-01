const {test}=require('node:test');
const assert=require('node:assert/strict');
require('tsx/cjs');
const {gpsIssue,GPS_OPTIONS}=require('../apps/rider-app/lib/gps.ts');
const now=Date.now();
const fix=(accuracy=10,timestamp=now)=>({coords:{latitude:41.33,longitude:19.82,accuracy},timestamp});
test('GPS accepts fresh precise readings and requests uncached high accuracy',()=>{
 assert.equal(gpsIssue(fix(),now),null);assert.equal(GPS_OPTIONS.maximumAge,0);assert.equal(GPS_OPTIONS.enableHighAccuracy,true);
});
test('GPS retains reported coarse fixes but rejects stale and invalid coordinates',()=>{
 assert.equal(gpsIssue(fix(2000),now),null);assert.ok(gpsIssue(fix(10,now-31000),now));
 assert.ok(gpsIssue({...fix(),coords:{latitude:100,longitude:19,accuracy:10}},now));
});

const {riderNavigationUrl}=require('../apps/rider-app/lib/navigation.ts');
const order={status:'ACCEPTED',pickupLat:41.33,pickupLng:19.82,dropoffLat:41.34,dropoffLng:19.84};
test('navigation changes from rider-business to business-customer after pickup',()=>{
 let params=new URL(riderNavigationUrl(order,{lat:41.31,lng:19.81})).searchParams;
 assert.equal(params.get('origin'),'41.31,19.81');assert.equal(params.get('destination'),'41.33,19.82');
 params=new URL(riderNavigationUrl({...order,status:'PICKED_UP'},{lat:41.35,lng:19.86})).searchParams;
 assert.equal(params.get('origin'),'41.33,19.82');assert.equal(params.get('destination'),'41.34,19.84');
 assert.equal(new URL(riderNavigationUrl(order,null)).searchParams.has('origin'),false);
 assert.equal(riderNavigationUrl({...order,status:'OFFERED'},null),null);
});
