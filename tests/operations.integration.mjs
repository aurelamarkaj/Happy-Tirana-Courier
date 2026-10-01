// Run inside the app image: node --import tsx --test tests/operations.integration.mjs
// All mutations are confined to a newly created, uniquely named test database.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { spawnSync } from "node:child_process";
import { io as connectSocket } from "socket.io-client";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

test("operational rules against real PostgreSQL, HTTP and Socket.IO", async t => {
  const originalUrl = process.env.DATABASE_URL;
  assert.ok(originalUrl, "DATABASE_URL required");
  const owner = new pg.Client({connectionString:originalUrl});
  await owner.connect();
  const name = `operations_test_${Date.now()}`;
  await owner.query(`CREATE DATABASE "${name}"`);
  const url = new URL(originalUrl); url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.href;
  process.env.RIDER_DEBIT_LIMIT_ALL = "5000";
  process.env.GOOGLE_MAPS_API_KEY = "isolated-test-only";
  process.env.SECOND_ORDER_BUSINESS_RADIUS_METERS="500";
  process.env.SECOND_ORDER_DESTINATION_RADIUS_METERS="500";
  let api, db;
  const sockets=[];
  const realFetch=globalThis.fetch, RealDate=globalThis.Date;
  let fakeNow=null, roadDistance=4000, secondBusinessRoadMeters=400, secondDestinationRoadMeters=400;
  try {
    for(let pass=0;pass<2;pass++) {
      const migration=spawnSync("node",["packages/db/src/migrate.mjs"],{env:process.env,encoding:"utf8"});
      assert.equal(migration.status,0,migration.stderr);
      if(pass===1) assert.ok(!migration.stdout.includes("Applied:"),"migrations must not rerun");
    }
    db=new pg.Client({connectionString:url.href});await db.connect();
    await t.test("fresh migrations and repeat run",async()=>{
      assert.equal((await db.query("SELECT count(*)::int AS n FROM schema_migrations")).rows[0].n,21);
      const boundary=(await db.query(`SELECT ST_IsValid(z.polygon) AS valid,
        ST_NPoints(z.polygon) AS vertex_count,
        ST_Covers(z.polygon, ST_SetSRID(ST_MakePoint(19.7779923,41.3391526),4326)) AS mezez_inside,
        ST_Covers(z.polygon, ST_SetSRID(ST_MakePoint(19.8152881,41.3624461),4326)) AS koder_inside,
        ST_Covers(z.polygon, ST_SetSRID(ST_MakePoint(19.8717187,41.3671240),4326)) AS tufine_inside,
        ST_Covers(z.polygon, ST_SetSRID(ST_MakePoint(19.8748219,41.3024396),4326)) AS farke_inside,
        (SELECT max(d)-min(d) FROM (
          SELECT ST_Distance(p.geom::geography, ST_SetSRID(ST_MakePoint(19.835129,41.333751),4326)::geography) AS d
          FROM ST_DumpPoints(ST_ExteriorRing(z.polygon)) p
        ) distances) AS radial_spread
        FROM zones z WHERE z.name='Zona pa shtesë - Tirana'`)).rows[0];
      assert.equal(boundary.valid,true);
      assert.ok(Number(boundary.vertex_count)>=200);
      assert.ok(Number(boundary.radial_spread)<40,"tariff boundary must be circular");
      for(const place of ["mezez_inside","koder_inside","tufine_inside","farke_inside"])
        assert.equal(boundary[place],true,`${place} must remain in the tariff area`);
    });
    globalThis.Date=class extends RealDate {
      constructor(...args){super(...(args.length?args:[fakeNow??RealDate.now()]));}
      static now(){return fakeNow??RealDate.now();}
    };
    globalThis.fetch=async(input,options)=>{
      const target=String(input);
      if(target.startsWith("https://maps.googleapis.com/maps/api/geocode/")) return Response.json({status:"ZERO_RESULTS",results:[]});
      if(target.startsWith("https://routes.googleapis.com/")) {
        const body=JSON.parse(options.body);
        assert.equal(body.travelMode,"DRIVE");assert.equal(body.routingPreference,"TRAFFIC_UNAWARE");
        const origin=body.origin.location.latLng,destination=body.destination.location.latLng;
        const pairFromFirst=origin.latitude===41.33&&origin.longitude===19.82;
        const pairDistance=pairFromFirst&&destination.latitude===41.3305&&destination.longitude===19.8205
          ? secondBusinessRoadMeters
          : pairFromFirst&&destination.latitude===41.331&&destination.longitude===19.821
            ? secondDestinationRoadMeters : roadDistance;
        return Response.json({routes:[{distanceMeters:pairDistance+500,duration:"1s"},{distanceMeters:pairDistance,duration:"999s"}]});
      }
      if(target==="https://maps.app.goo.gl/test-pin") return new Response(null,{status:302,headers:{location:"https://www.google.com/maps?q=41.33,19.82"}});
      if(target.startsWith("https://maps.app.goo.gl/")) return new Response("no location",{status:404});
      return realFetch(input,options);
    };
    api=await import("../apps/api/src/server.ts");
    await new Promise(resolve=>api.server.listen(0,"127.0.0.1",resolve));
    const base=`http://127.0.0.1:${api.server.address().port}`;
    const accountToken=(id,role)=>{const expiry=Math.floor(Date.now()/1000)+3600;const signature=crypto.createHmac("sha256",process.env.JWT_SECRET??"").update(`${role}:${id}.${expiry}`).digest("hex");return `${id}.${expiry}.${signature}`;};
    let adminToken="";
    const request=async(path,body,method="POST",token=undefined)=>{
      let credential=token;
      if(credential===undefined && path.startsWith("/admin/") && path!=="/admin/auth/login")credential=adminToken;
      if(credential===undefined && path.startsWith("/businesses/") && !path.startsWith("/businesses/auth/") && path!=="/businesses/order-window")credential=accountToken(path.split("/")[2],"BUSINESS");
      if(credential===undefined && (path.startsWith("/riders/") || path.startsWith("/orders/")) && path!=="/riders/auth/login")credential=accountToken(body?.riderId??path.split("/")[2],"RIDER");
      const r=await realFetch(base+path,{method,headers:{"Content-Type":"application/json",...(credential?{Authorization:`Bearer ${credential}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
      const text=await r.text();let bodyResult;try{bodyResult=JSON.parse(text);}catch{bodyResult={text};}
      return {status:r.status,body:bodyResult};
    };
    await t.test("reverse geocoding never substitutes a cached street when Google has no result",async()=>{
      await db.query("INSERT INTO address_suggestions(label,city,details,lat,lng) VALUES('Wrong cached street','Tirane','Unrelated road',41.34,19.83)");
      const r=await request("/public/addresses/reverse?lat=41.33&lng=19.82",undefined,"GET");
      assert.equal(r.status,200);assert.equal(r.body.address,null);
      assert.equal((await request("/public/addresses/reverse?lat=999&lng=19.82",undefined,"GET")).status,422);
    });
    // Synthetic polygons exist only in this isolated test database.
    await db.query("UPDATE zones SET active=false");
    await db.query(`INSERT INTO zones(name,transport_fee,polygon,is_surcharge_area) VALUES
      ('Test coverage',300,ST_GeomFromText('POLYGON((19 41,20 41,20 42,19 42,19 41))',4326),false),
      ('Test tariff',300,ST_GeomFromText('POLYGON((19.81 41.32,19.83 41.32,19.83 41.34,19.81 41.34,19.81 41.32))',4326),true)`);
    const business=(await db.query("INSERT INTO businesses(name,phone,address_text,lat,lng) VALUES('Test business','+355691111111','Test',41.33,19.82) RETURNING id")).rows[0].id;
    const nearbyBusiness=(await db.query("INSERT INTO businesses(name,phone,address_text,lat,lng) VALUES('Nearby business','+355692222222','Nearby',41.3305,19.8205) RETURNING id")).rows[0].id;
    const salt="integration-tests", password="test-only-password";
    const passwordHash=`${salt}:${crypto.pbkdf2Sync(password,salt,120000,32,"sha256").toString("hex")}`;
    for(const [index,id] of [business,nearbyBusiness].entries()){
      const user=(await db.query("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'BUSINESS') RETURNING id",[`Business ${index}`,`business${index}@example.invalid`,passwordHash])).rows[0].id;
      await db.query("INSERT INTO business_users(business_id,user_id,is_primary) VALUES($1,$2,true)",[id,user]);
    }
    await db.query("INSERT INTO users(name,email,password_hash,role) VALUES('Test admin','test@example.invalid',$1,'ADMIN')",[passwordHash]);
    const login=await request("/admin/auth/login",{email:"test@example.invalid",password});
    assert.equal(login.status,200,JSON.stringify(login));
    adminToken=login.body.admin.token;
    const riders=[];
    for(let i=0;i<5;i++) {
      const user=(await db.query("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'RIDER') RETURNING id",[`R${i}`,`r${i}@example.invalid`,passwordHash])).rows[0].id;
      const id=(await db.query("INSERT INTO rider_profiles(user_id,is_online,vehicle_type) VALUES($1,true,$2) RETURNING id",[user,"DIESEL"])).rows[0].id;
      await db.query("INSERT INTO rider_locations(rider_id,lat,lng,point) VALUES($1,41.33,$2::numeric,ST_SetSRID(ST_MakePoint($2::double precision,41.33),4326))",[id,19.82+i*0.001]);
      riders.push(id);
    }
    await t.test("rider GPS reaches database and admin map with its reported accuracy",async()=>{
      for(const accuracy of [25,1500]){
        const result=await request("/riders/me/location",{riderId:riders[0],lat:41.33,lng:19.82,accuracy});
        assert.equal(result.status,201,JSON.stringify(result));
        const map=await request("/admin/live-map",undefined,"GET");
        assert.equal(map.status,200,JSON.stringify(map));
        const rider=map.body.riders.find(r=>r.id===riders[0]);
        assert.equal(rider.lastLat,41.33);assert.equal(rider.lastLng,19.82);
        assert.equal(rider.gpsAccuracy,accuracy);assert.ok(rider.gpsRecordedAt);
      }
      assert.equal((await request("/riders/me/location",{riderId:riders[0],lat:999,lng:19.82,accuracy:20})).status,422);
    });
    const payload={orderValue:1000,customerPhone:"+355691234567",googleMapsUrl:"https://maps.app.goo.gl/test-pin",readyMinutes:10};
    await t.test("admin, business and rider APIs require matching signed sessions",async()=>{
      for(const path of ["/admin/businesses","/admin/riders","/admin/finance","/admin/notifications","/admin/orders"])
        assert.equal((await request(path,undefined,"GET",null)).status,401,path);
      assert.equal((await request(`/riders/${riders[0]}/dashboard`,undefined,"GET",null)).status,401);
      assert.equal((await request(`/businesses/${business}/dashboard`,undefined,"GET",null)).status,401);
      assert.equal((await request(`/riders/${riders[0]}/dashboard`,undefined,"GET",accountToken(riders[1],"RIDER"))).status,401);
      assert.equal((await request(`/businesses/${business}/dashboard`,undefined,"GET",accountToken(nearbyBusiness,"BUSINESS"))).status,401);
      const businessLogin=await request("/businesses/auth/login",{email:"business0@example.invalid",password});
      assert.equal(businessLogin.status,200);assert.ok(businessLogin.body.business.token);
      assert.equal((await request(`/businesses/${business}/dashboard`,undefined,"GET",businessLogin.body.business.token)).status,200);
      const riderLogin=await request("/riders/auth/login",{email:"r0@example.invalid",password});
      assert.equal(riderLogin.status,200);assert.ok(riderLogin.body.rider.token);
      assert.equal((await request(`/riders/${riders[0]}/dashboard`,undefined,"GET",riderLogin.body.rider.token)).status,200);
      const gps={riderId:riders[0],lat:41.330001,lng:19.82};
      assert.equal((await request("/riders/me/location",gps,"POST",null)).status,401);
      assert.equal((await request("/riders/me/location",gps,"POST",accountToken(riders[1],"RIDER"))).status,401);
      assert.equal((await request("/riders/me/location",gps,"POST",riderLogin.body.rider.token)).status,201);
      const live=await request("/admin/live-map",undefined,"GET",adminToken);
      assert.equal(live.body.riders.find(r=>r.id===riders[0]).lastLat,41.330001);
    });
    await t.test("admin business location uses Maps link on create/update; zones are read-only",async()=>{
      const input={name:"Maps business",phone:"+355699998888",email:"maps-business@example.invalid",password:"test-only-password",addressText:"Test address",googleMapsUrl:payload.googleMapsUrl,lat:0,lng:0,status:"ACTIVE",etaMinutes:25};
      const created=await request("/admin/businesses",input);
      assert.equal(created.status,201,JSON.stringify(created));
      const id=created.body.business.id;
      const row=(await db.query("SELECT lat,lng FROM businesses WHERE id=$1",[id])).rows[0];
      assert.equal(Number(row.lat),41.33);assert.equal(Number(row.lng),19.82);
      const updated=await request(`/admin/businesses/${id}`,{...input,googleMapsUrl:"https://www.google.com/maps?q=41.34,19.83"},"PATCH");
      assert.equal(updated.status,200,JSON.stringify(updated));
      assert.equal(Number((await db.query("SELECT lat FROM businesses WHERE id=$1",[id])).rows[0].lat),41.34);
      assert.equal((await request("/admin/businesses",{...input,googleMapsUrl:"https://invalid.example/"})).status,422);
      for(const method of ["POST","PATCH","DELETE"]){
        assert.equal((await request(method==="POST"?"/admin/zones":`/admin/zones/${id}`,{},method)).status,405);
      }
    });
    await t.test("new accounts require login email; edit and password reset permit login",async()=>{
      const businessInput={name:"Auth business",phone:"+355699998881",email:"AUTH-BUSINESS@example.invalid",password,
        addressText:"Test address",googleMapsUrl:payload.googleMapsUrl,status:"ACTIVE",etaMinutes:25};
      assert.equal((await request("/admin/businesses",{...businessInput,email:""})).status,422);
      const createdBusiness=await request("/admin/businesses",businessInput);
      assert.equal(createdBusiness.status,201,JSON.stringify(createdBusiness));
      const businessId=createdBusiness.body.business.id;
      assert.equal((await request("/businesses/auth/login",{email:"auth-business@EXAMPLE.invalid",password})).status,200);
      const changedBusiness={...businessInput,email:"changed-business@example.invalid"};
      assert.equal((await request(`/admin/businesses/${businessId}`,changedBusiness,"PATCH")).status,200);
      assert.equal((await request("/businesses/auth/login",{email:businessInput.email,password})).status,401);
      assert.equal((await request("/businesses/auth/login",{email:changedBusiness.email,password})).status,200);
      const newPassword="new-test-password-business";
      assert.equal((await request(`/admin/businesses/${businessId}/password`,{password:newPassword},"PATCH",null)).status,401);
      assert.equal((await request(`/admin/businesses/${businessId}/password`,{password:newPassword},"PATCH")).status,200);
      assert.equal((await request("/businesses/auth/login",{email:changedBusiness.email,password})).status,401);
      assert.equal((await request("/businesses/auth/login",{email:changedBusiness.email,password:newPassword})).status,200);
      for(const status of ["INACTIVE","SUSPENDED"]){
        assert.equal((await request(`/admin/businesses/${businessId}`,{...changedBusiness,status},"PATCH")).status,200);
        const blocked=await request("/businesses/auth/login",{email:changedBusiness.email,password:newPassword});
        assert.equal(blocked.status,403);assert.equal(blocked.body.error,`BUSINESS_${status}`);
        assert.equal((await request("/businesses/auth/login",{email:changedBusiness.email,password:"wrong-password"})).status,401);
      }
      assert.equal((await request(`/admin/businesses/${businessId}`,changedBusiness,"PATCH")).status,200);
      assert.equal((await request("/businesses/auth/login",{email:changedBusiness.email,password:newPassword})).status,200);
      const riderInput={name:"Auth rider",phone:"+355699998882",email:"AUTH-RIDER@example.invalid",password,
        vehicleType:"ELECTRIC",licenseNumber:"",personalId:"",status:"INACTIVE"};
      assert.equal((await request("/admin/riders",{...riderInput,email:""})).status,422);
      const createdRider=await request("/admin/riders",riderInput);
      assert.equal(createdRider.status,201,JSON.stringify(createdRider));
      const riderId=createdRider.body.rider.id;
      const inactiveRider=await request("/riders/auth/login",{email:riderInput.email,password});
      assert.equal(inactiveRider.status,403);assert.equal(inactiveRider.body.error,"RIDER_INACTIVE");
      assert.equal((await db.query("SELECT u.status AS user_status,rp.status AS rider_status FROM rider_profiles rp JOIN users u ON u.id=rp.user_id WHERE rp.id=$1",[riderId])).rows[0].user_status,"INACTIVE");
      const activeRider={...riderInput,email:"changed-rider@example.invalid",status:"ACTIVE"};
      assert.equal((await request(`/admin/riders/${riderId}`,activeRider,"PATCH")).status,200);
      assert.equal((await request("/riders/auth/login",{email:riderInput.email,password})).status,401);
      assert.equal((await request("/riders/auth/login",{email:"CHANGED-RIDER@example.invalid",password})).status,200);
      const riderPassword="new-test-password-rider";
      assert.equal((await request(`/admin/riders/${riderId}/password`,{password:riderPassword},"PATCH")).status,200);
      assert.equal((await request("/riders/auth/login",{email:activeRider.email,password})).status,401);
      assert.equal((await request("/riders/auth/login",{email:activeRider.email,password:riderPassword})).status,200);
      assert.equal((await request(`/admin/riders/${riderId}`,{...activeRider,status:"SUSPENDED"},"PATCH")).status,200);
      const suspendedRider=await request("/riders/auth/login",{email:activeRider.email,password:riderPassword});
      assert.equal(suspendedRider.status,403);assert.equal(suspendedRider.body.error,"RIDER_SUSPENDED");
      assert.equal((await request("/riders/auth/login",{email:activeRider.email,password:"wrong-password"})).status,401);
      assert.equal((await request(`/admin/riders/${riderId}`,activeRider,"PATCH")).status,200);
      assert.equal((await request("/riders/auth/login",{email:activeRider.email,password:riderPassword})).status,200);
    });
    const create=async(extra={},sourceBusiness=business)=>{
      const r=await request(`/businesses/${sourceBusiness}/orders`,{...payload,...extra});
      assert.equal(r.status,201,JSON.stringify(r));
      const scheduled=(await db.query("SELECT EXTRACT(EPOCH FROM (offer_after-created_at)) AS seconds FROM orders WHERE id=$1",[r.body.order.id])).rows[0];
      assert.ok(Math.abs(Number(scheduled.seconds)-480)<3,"new orders must wait eight minutes");
      await db.query("UPDATE orders SET offer_after=now()+interval '1 hour' WHERE id=$1",[r.body.order.id]);
      return r.body.order.id;
    };
    const dispatch=async()=>{
      const c=await api.pool.connect();
      try {await c.query("BEGIN");await api.processDueOrderDispatches(c);await c.query("COMMIT");}
      catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
      await api.publishPendingNotifications();
    };
    const accept=(order,rider)=>request(`/orders/${order}/accept`,{riderId:rider});
    const offer=async(order,rider)=>{
      await db.query("UPDATE orders SET status='OFFERED' WHERE id=$1",[order]);
      await db.query("INSERT INTO order_offers(order_id,rider_id,expires_at) VALUES($1,$2,now()+interval '10 minutes') ON CONFLICT(order_id,rider_id) DO UPDATE SET status='PENDING',expires_at=EXCLUDED.expires_at",[order,rider]);
    };
    await t.test("eight-minute wait and 3000/3001m vehicle boundary across dispatch, dashboard, acceptance and admin",async()=>{
      await db.query("UPDATE rider_profiles SET vehicle_type='ELECTRIC' WHERE id=$1",[riders[0]]);
      for(const meters of [3000,3001]){
        roadDistance=meters;
        const id=await create({readyMinutes:20});
        await db.query("UPDATE orders SET offer_after=now()+interval '1 second' WHERE id=$1",[id]);
        await dispatch();
        assert.equal((await db.query("SELECT count(*)::int AS n FROM order_offers WHERE order_id=$1",[id])).rows[0].n,0);
        await db.query("UPDATE orders SET offer_after=now()-interval '1 second' WHERE id=$1",[id]);
        await dispatch();
        let electric=(await db.query("SELECT count(*)::int AS n FROM order_offers WHERE order_id=$1 AND rider_id=$2",[id,riders[0]])).rows[0].n;
        assert.equal(electric,meters===3000?1:0);
        await db.query("UPDATE orders SET initial_offer_sent_at=now()-interval '61 seconds' WHERE id=$1",[id]);
        await db.query("UPDATE order_offers SET expires_at=now()-interval '1 second' WHERE order_id=$1",[id]);
        await dispatch();
        electric=(await db.query("SELECT count(*)::int AS n FROM order_offers WHERE order_id=$1 AND rider_id=$2",[id,riders[0]])).rows[0].n;
        assert.equal(electric,meters===3000?1:0);
        if(meters>3000){
          await offer(id,riders[0]); // Simulate an obsolete incompatible offer.
          const dash=await request(`/riders/${riders[0]}/dashboard`,undefined,"GET");
          assert.ok(!dash.body.pendingOffers.some(o=>o.id===id));
          assert.equal((await accept(id,riders[0])).body.error,"RIDER_VEHICLE_NOT_ELIGIBLE");
          await assert.rejects(db.query("SELECT * FROM accept_order_atomic($1,$2)",[id,riders[0]]),/RIDER_VEHICLE_NOT_ELIGIBLE/);
          await db.query("UPDATE orders SET escalated_at=now()-interval '61 seconds' WHERE id=$1",[id]);
          assert.equal((await request(`/admin/orders/${id}/assign`,{riderId:riders[0]})).body.error,"RIDER_VEHICLE_NOT_ELIGIBLE");
          assert.equal((await request(`/admin/orders/${id}/assign`,{riderId:riders[2]})).status,200);
        }
        assert.equal((await request(`/admin/orders/${id}/cancel`,{},"PATCH")).status,200);
      }
      roadDistance=4000;
      await db.query("UPDATE rider_profiles SET vehicle_type='DIESEL' WHERE id=$1",[riders[0]]);
    });
    await t.test("manual assignment is admin-only and opens after escalation",async()=>{
      const id=await create();
      assert.equal((await request(`/admin/orders/${id}/assign`,{riderId:riders[0]},"POST",null)).status,401);
      assert.equal((await request(`/admin/orders/${id}/assign`,{riderId:riders[0]})).status,409);
      await db.query("UPDATE orders SET status='OFFERED',initial_offer_sent_at=now()-interval '121 seconds',escalated_at=now()-interval '61 seconds' WHERE id=$1",[id]);
      const assigned=await request(`/admin/orders/${id}/assign`,{riderId:riders[0]});
      assert.equal(assigned.status,200,JSON.stringify(assigned));
      const state=(await db.query("SELECT status,assigned_rider_id FROM orders WHERE id=$1",[id])).rows[0];
      assert.equal(state.status,"ACCEPTED");assert.equal(state.assigned_rider_id,riders[0]);
      assert.equal((await request(`/admin/orders/${id}/assign`,{riderId:riders[1]})).status,409);
      assert.equal((await db.query("SELECT note FROM order_status_history WHERE order_id=$1 AND to_status='ACCEPTED' ORDER BY created_at DESC LIMIT 1",[id])).rows[0].note,"Assigned by admin after escalation");
      assert.equal((await request(`/admin/orders/${id}/cancel`,{},"PATCH")).status,200);
    });
    await t.test("duplicate business login details return specific errors without partial inserts",async()=>{
      const before=(await db.query("SELECT count(*)::int AS n FROM businesses")).rows[0].n;
      const data={name:"Duplicate test",phone:"+355688888888",email:"business0@example.invalid",password:"test-password",addressText:"Test address",googleMapsUrl:"https://www.google.com/maps?q=41.33,19.82"};
      const duplicate=await request("/admin/businesses",data);
      assert.equal(duplicate.status,409);assert.equal(duplicate.body.error,"USER_EMAIL_EXISTS");
      assert.equal((await db.query("SELECT count(*)::int AS n FROM businesses")).rows[0].n,before);
    });
    await t.test("Maps link preview resolves before quote without creating an order",async()=>{
      const before=(await db.query("SELECT count(*)::int AS n FROM orders")).rows[0].n;
      const r=await request(`/businesses/${business}/orders/location`,{googleMapsUrl:payload.googleMapsUrl});
      assert.equal(r.status,200,JSON.stringify(r));
      assert.equal(r.body.location.originalUrl,payload.googleMapsUrl);
      assert.equal(r.body.location.lat,41.33);assert.equal(r.body.location.lng,19.82);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM orders")).rows[0].n,before);
    });
    await t.test("valid order without name/note; original link and coordinates retained; finance",async()=>{
      const id=await create({transportFeeOverride:350});
      const row=(await db.query("SELECT o.*,c.name,a.lat,a.lng FROM orders o JOIN customers c ON c.id=o.customer_id JOIN addresses a ON a.id=o.delivery_address_id WHERE o.id=$1",[id])).rows[0];
      assert.equal(row.name,null);assert.equal(row.google_maps_url,payload.googleMapsUrl);
      assert.equal(Number(row.lat),41.33);assert.equal(row.route_distance_meters,4000);
      assert.equal(Number(row.calculated_transport_fee),400);assert.equal(Number(row.transport_fee),400);
      assert.equal(Number(row.total_amount),1400);assert.equal(Number(row.platform_commission),80);assert.equal(Number(row.rider_earning),320);
      assert.equal(row.transport_fee_overridden,false);
      await assert.rejects(db.query("UPDATE orders SET transport_fee=1 WHERE id=$1",[id]),/ORDER_FINANCE_IMMUTABLE/);
      assert.equal((await request(`/orders/${id}`,{transportFeeOverride:1},"PATCH",null)).status,401);
    });
    await t.test("negative order value and admin-only cancellation",async()=>{
      const id=await create({orderValue:-500});
      const row=(await db.query("SELECT product_value,total_amount FROM orders WHERE id=$1",[id])).rows[0];
      assert.equal(Number(row.product_value),-500);
      assert.equal(Number(row.total_amount),-100);
      assert.equal((await request(`/admin/businesses/${business}/orders`,undefined,"GET",null)).status,401);
      const listed=await request(`/admin/businesses/${business}/orders`,undefined,"GET",adminToken);
      assert.equal(listed.status,200);assert.ok(listed.body.orders.some(order=>order.id===id));
      const allOrders=await request("/admin/orders?status=CREATED",undefined,"GET",adminToken);
      assert.equal(allOrders.status,200);assert.ok(allOrders.body.orders.some(order=>order.id===id));
      assert.equal((await request(`/admin/orders/${id}/cancel`,{},"PATCH",null)).status,401);
      assert.equal((await request(`/admin/orders/${id}/cancel`,{},"PATCH",adminToken)).status,200);
      assert.equal((await request(`/admin/orders/${id}/cancel`,{},"PATCH",adminToken)).status,409);
    });
    await t.test("missing fields, invalid and unresolved Maps links rejected",async()=>{
      for(const field of ["orderValue","googleMapsUrl","customerPhone","readyMinutes"]){
        const r=await request(`/businesses/${business}/orders`,{...payload,[field]:undefined});assert.equal(r.status,422,field);
      }
      for(const googleMapsUrl of ["https://evil.invalid/maps?q=41,19","https://maps.app.goo.gl/invalid"]){
        assert.ok((await request(`/businesses/${business}/orders`,{...payload,googleMapsUrl})).status>=400);
      }
    });
    await t.test("outside coverage quote/create rejected without inserts",async()=>{
      const before=(await db.query("SELECT count(*)::int AS n FROM orders")).rows[0].n;
      for(const path of ["/location","/quote",""]){
        const r=await request(`/businesses/${business}/orders${path}`,{...payload,googleMapsUrl:"https://www.google.com/maps?q=45,25"});
        assert.equal(r.body.error,"DELIVERY_ZONE_NOT_FOUND");
      }
      assert.equal((await db.query("SELECT count(*)::int AS n FROM orders")).rows[0].n,before);
    });
    await t.test("pricing 3/4/5km, outside tariff +100, client distance ignored",async()=>{
      for(const meters of [3000,4000,5000]) {
        roadDistance=meters;
        const r=await request(`/businesses/${business}/orders/quote`,{...payload,lat:0,lng:0,distanceMeters:1});
        assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.quote.finalTransportFee,300+(meters-3000)*0.1);
      }
      roadDistance=4000;
      const r=await request(`/businesses/${business}/orders/quote`,{...payload,googleMapsUrl:"https://www.google.com/maps?q=41.35,19.85"});
      assert.equal(r.body.quote.finalTransportFee,500);assert.equal(r.body.quote.ringSurchargeFee,100);
    });
    await t.test("23:00 closes ordering; Sunday stays open",async()=>{
      for(const time of ["2026-09-22T23:00:00+02:00"]){
        fakeNow=RealDate.parse(time);
        for(const path of [`/businesses/${business}/orders`,`/businesses/${business}/orders/location`,`/businesses/${business}/orders/quote`,`/orders/${business}/accept`]){
          assert.equal((await request(path,{...payload,riderId:riders[0]})).status,409,path);
        }
        assert.equal((await request("/health",undefined,"GET")).status,200);
        const before=(await db.query("SELECT count(*)::int AS n FROM order_offers")).rows[0].n;
        await dispatch();assert.equal((await db.query("SELECT count(*)::int AS n FROM order_offers")).rows[0].n,before);
      }
      fakeNow=RealDate.parse("2026-09-20T12:00:00+02:00");
      assert.equal((await request(`/businesses/${business}/orders/quote`,payload)).status,200);
      fakeNow=null;
    });
    const events=[];
    for(const room of [...riders.map(id=>["rider.join",id]),["admin.join",null]]){
      const socket=connectSocket(base,{transports:["websocket"],forceNew:true});sockets.push(socket);
      socket.on("order.offered",data=>events.push({room:room[1],event:"order.offered",data}));
      socket.on("admin.alert",data=>events.push({event:"admin.alert",data}));
      await new Promise(resolve=>socket.on("connect",()=>{socket.emit(room[0],room[0]==="admin.join"?adminToken:accountToken(room[1],"RIDER"),(ok)=>{assert.equal(ok,true);resolve();});}));
    }
    const waitEvent=async(predicate)=>{
      for(let i=0;i<50&&!events.some(predicate);i++)await new Promise(r=>setTimeout(r,20));
      assert.ok(events.some(predicate),"expected real socket event");
    };
    await t.test("undelivered offer remains pending while rider socket is disconnected",async()=>{
      const id=await create();
      await offer(id,riders[0]);
      await db.query(`INSERT INTO notifications(user_id,order_id,type,channel,status,payload)
        SELECT user_id,$1,'ORDER_OFFERED_NEARBY_1KM','SOCKET','PENDING',$2::jsonb
        FROM rider_profiles WHERE id=$3`,[id,JSON.stringify({riderId:riders[0]}),riders[0]]);
      sockets[0].disconnect();
      await api.publishPendingNotifications();
      assert.equal((await db.query("SELECT status FROM notifications WHERE order_id=$1 AND type='ORDER_OFFERED_NEARBY_1KM'",[id])).rows[0].status,"PENDING");
      const rejoined=new Promise(resolve=>sockets[0].once("connect",()=>sockets[0].emit("rider.join",accountToken(riders[0],"RIDER"),resolve)));
      sockets[0].connect();assert.equal(await rejoined,true);
      await api.publishPendingNotifications();
      await waitEvent(e=>e.event==="order.offered"&&e.room===riders[0]&&e.data.orderId===id);
      assert.equal((await db.query("SELECT status FROM notifications WHERE order_id=$1 AND type='ORDER_OFFERED_NEARBY_1KM'",[id])).rows[0].status,"SENT");
      assert.equal((await request(`/admin/orders/${id}/cancel`,{},"PATCH")).status,200);
    });
    await t.test("debit 4999.99 eligible, 5000 and 5001 excluded; nearby group, all vehicles after 60s, admin assignment after another 60s",async()=>{
      for(const [index,debit] of [[0,4999.99],[3,5000],[4,5001]])await db.query("INSERT INTO ledger_entries(rider_id,entry_type,amount,direction) VALUES($1,'TEST',$2,'RIDER_OWES_PLATFORM')",[riders[index],debit]);
      roadDistance=1500;
      await db.query("UPDATE rider_profiles SET vehicle_type='ELECTRIC' WHERE id=$1",[riders[0]]);
      await db.query("DELETE FROM rider_locations WHERE rider_id=$1",[riders[2]]);
      const id=await create();await db.query("UPDATE orders SET offer_after=now()-interval '1 second' WHERE id=$1",[id]);
      await dispatch();
      let offers=(await db.query("SELECT rider_id FROM order_offers WHERE order_id=$1",[id])).rows;
      assert.deepEqual(offers.map(o=>o.rider_id).sort(),riders.slice(0,2).sort());
      await waitEvent(e=>e.event==="order.offered"&&e.room===riders[0]&&e.data.orderId===id);
      await db.query("UPDATE orders SET initial_offer_sent_at=now()-interval '59 seconds' WHERE id=$1",[id]);
      await dispatch();assert.equal((await db.query("SELECT count(*)::int AS n FROM order_offers WHERE order_id=$1",[id])).rows[0].n,2);
      await db.query("UPDATE orders SET initial_offer_sent_at=now()-interval '61 seconds' WHERE id=$1",[id]);
      await db.query("UPDATE order_offers SET expires_at=now()-interval '1 second' WHERE order_id=$1",[id]);
      await dispatch();
      offers=(await db.query("SELECT rider_id,status FROM order_offers WHERE order_id=$1",[id])).rows;
      assert.equal(offers.length,3);assert.equal(offers.find(o=>o.rider_id===riders[0]).status,"PENDING");
      await waitEvent(e=>e.room===riders[2]&&e.data.orderId===id); // DIESEL without GPS, short delivery: included in general offers
      await db.query("UPDATE orders SET escalated_at=now()-interval '59 seconds' WHERE id=$1",[id]);
      await dispatch();assert.equal(events.filter(e=>e.event==="admin.alert"&&e.data.orderId===id).length,0);
      assert.equal((await request(`/admin/orders/${id}/assign`,{riderId:riders[2]})).status,409);
      await db.query("UPDATE orders SET escalated_at=now()-interval '61 seconds' WHERE id=$1",[id]);
      await dispatch();await waitEvent(e=>e.event==="admin.alert"&&e.data.orderId===id);
      const notices=await request("/admin/notifications",undefined,"GET");
      assert.ok(notices.body.notifications.some(n=>n.order_id===id));
      assert.ok((await accept(id,riders[3])).status>=400);
      const assigned=await request(`/admin/orders/${id}/assign`,{riderId:riders[2]});
      assert.equal(assigned.status,200,JSON.stringify(assigned));
      assert.equal((await db.query("SELECT assigned_rider_id FROM orders WHERE id=$1",[id])).rows[0].assigned_rider_id,riders[2]);
      assert.equal((await request(`/admin/orders/${id}/cancel`,{},"PATCH")).status,200);
      roadDistance=4000;
      await db.query("UPDATE rider_profiles SET vehicle_type='DIESEL' WHERE id=$1",[riders[0]]);
      const resolvedNotices=await request("/admin/notifications",undefined,"GET");
      assert.ok(!resolvedNotices.body.notifications.some(n=>n.order_id===id));
      await db.query("UPDATE ledger_entries SET status='PAID' WHERE entry_type='TEST'");
    });
    let first,winner;
    await t.test("two simultaneous accepts: exactly one winner and all other offers closed",async()=>{
      first=await create();for(const rider of riders.slice(0,2))await offer(first,rider);
      await db.query("INSERT INTO notifications(user_id,type,channel,status,order_id,payload) SELECT id,'ORDER_UNASSIGNED_AFTER_ESCALATION','SOCKET','SENT',$1,'{}'::jsonb FROM users WHERE role='ADMIN' LIMIT 1",[first]);
      const results=await Promise.all(riders.slice(0,2).map(r=>accept(first,r)));
      assert.equal(results.filter(r=>r.status===200).length,1,JSON.stringify(results));
      winner=riders[results.findIndex(r=>r.status===200)];
      assert.equal((await db.query("SELECT count(*)::int AS n FROM order_offers WHERE order_id=$1 AND status='PENDING'",[first])).rows[0].n,0);
      assert.equal((await db.query("SELECT status FROM notifications WHERE order_id=$1 AND type='ORDER_UNASSIGNED_AFTER_ESCALATION'",[first])).rows[0].status,"CLOSED");
    });
    let second;
    await t.test("second blocked until the first order is picked up",async()=>{
      second=await create({googleMapsUrl:"https://www.google.com/maps?q=41.331,19.821"},nearbyBusiness);
      await db.query("UPDATE rider_profiles SET is_online=(id=$1)",[winner]);
      await db.query("UPDATE orders SET offer_after=now()-interval '1 second' WHERE id=$1",[second]);
      await dispatch();
      assert.equal((await db.query("SELECT count(*)::int AS n FROM order_offers WHERE order_id=$1",[second])).rows[0].n,0);
      await offer(second,winner);
      assert.equal((await accept(second,winner)).body.error,"SECOND_ORDER_REQUIRES_PICKUP");
      await db.query("UPDATE orders SET status='PICKED_UP' WHERE id=$1",[first]);
      await db.query("UPDATE rider_profiles SET is_online=true");
    });
    await t.test("second order requires another nearby business and destinations within 500 m",async()=>{
      const sameBusiness=await create();await offer(sameBusiness,winner);
      assert.equal((await accept(sameBusiness,winner)).body.error,"SECOND_ORDER_SAME_BUSINESS");
      await db.query("UPDATE orders SET status='CANCELLED' WHERE id=$1",[sameBusiness]);
      secondBusinessRoadMeters=501;
      assert.equal((await accept(second,winner)).body.error,"SECOND_ORDER_BUSINESS_TOO_FAR");
      secondBusinessRoadMeters=500;secondDestinationRoadMeters=501;
      assert.equal((await accept(second,winner)).body.error,"SECOND_ORDER_DESTINATION_TOO_FAR");
      secondDestinationRoadMeters=500;
      const competitor=await create({googleMapsUrl:"https://www.google.com/maps?q=41.331,19.821"},nearbyBusiness);await offer(competitor,winner);
      const simultaneous=await Promise.all([accept(second,winner),accept(competitor,winner)]);
      assert.equal(simultaneous.filter(r=>r.status===200).length,1,JSON.stringify(simultaneous));
      assert.ok(simultaneous.some(r=>r.body.error==="RIDER_ORDER_CAPACITY_REACHED"));
      if(simultaneous[1].status===200)second=competitor;
    });
    await t.test("third active order rejected",async()=>{
      const third=await create();await offer(third,winner);
      assert.equal((await accept(third,winner)).body.error,"RIDER_ORDER_CAPACITY_REACHED");
    });
    await t.test("debit alert persisted and emitted when delivery reaches threshold",async()=>{
      await db.query("INSERT INTO ledger_entries(rider_id,entry_type,amount,direction) VALUES($1,'TEST',4990,'RIDER_OWES_PLATFORM')",[winner]);
      const r=await request(`/riders/orders/${first}/status`,{riderId:winner,status:"DELIVERED"},"PATCH");
      assert.equal(r.status,200,JSON.stringify(r));await api.publishPendingNotifications();
      await waitEvent(e=>e.event==="admin.alert"&&e.data.type==="RIDER_DEBIT_LIMIT_REACHED");
      assert.equal(Number((await db.query("SELECT account_balance_all FROM rider_profiles WHERE id=$1",[winner])).rows[0].account_balance_all),320);
      assert.equal((await request(`/admin/orders/${first}/cancel`,{},"PATCH",adminToken)).status,409);
      assert.equal((await request(`/admin/riders/${winner}/account-balance`,{balance:20},"PATCH",null)).status,401);
      const payout=await request(`/admin/riders/${winner}/account-balance`,{balance:20},"PATCH",adminToken);
      assert.equal(payout.status,200,JSON.stringify(payout));assert.equal(payout.body.withdrawal,300);
      assert.equal(Number((await db.query("SELECT account_balance_all FROM rider_profiles WHERE id=$1",[winner])).rows[0].account_balance_all),20);
      const dashboard=await request(`/riders/${winner}/dashboard`,undefined,"GET");
      assert.equal(dashboard.status,200,JSON.stringify(dashboard));
      assert.equal(dashboard.body.rider.accountBalanceAll,20);
      assert.equal(dashboard.body.metrics.platformDue,dashboard.body.rider.platformDue);
      assert.equal((await request(`/admin/riders/${winner}/account-balance`,{balance:21},"PATCH",adminToken)).status,409);
    });
    await t.test("database rejects a debit limit over 5000; phone link exists",async()=>{
      await assert.rejects(db.query("UPDATE rider_profiles SET debit_limit_all=5001 WHERE id=$1",[winner]),/rider_debit_limit_max/);
      assert.match(readFileSync("apps/rider-app/components/rider-contact-line.tsx","utf8"),/href=\{`tel:/);
      assert.doesNotMatch(readFileSync("apps/rider-app/app/delivery/page.tsx","utf8"),/Anulo per problem/);
      assert.equal((await request(`/riders/orders/${first}/status`,{riderId:winner,status:"CANCELLED"},"PATCH")).status,422);
    });
    await t.test("admin removes businesses without losing order history or reusing an active session",async()=>{
      const input={name:"Business to remove",phone:"+355699990001",email:"remove-business@example.invalid",
        password, addressText:"Test address",googleMapsUrl:payload.googleMapsUrl,status:"ACTIVE",etaMinutes:25};
      const created=await request("/admin/businesses",input);
      assert.equal(created.status,201,JSON.stringify(created));
      const id=created.body.business.id;
      const login=await request("/businesses/auth/login",{email:input.email,password});
      assert.equal(login.status,200);
      const orderId=await create({},id);
      assert.equal((await request(`/admin/businesses/${id}`,undefined,"DELETE",null)).status,401);
      assert.equal((await request(`/admin/businesses/${id}`,undefined,"DELETE")).body.error,"BUSINESS_HAS_ACTIVE_ORDERS");
      assert.equal((await db.query("SELECT deleted_at FROM businesses WHERE id=$1",[id])).rows[0].deleted_at,null);
      assert.equal((await request(`/admin/orders/${orderId}/cancel`,{},"PATCH")).status,200);
      assert.equal((await request(`/admin/businesses/${id}`,undefined,"DELETE")).status,200);
      assert.ok((await db.query("SELECT id FROM orders WHERE id=$1 AND business_id=$2",[orderId,id])).rowCount);
      assert.ok((await db.query("SELECT deleted_at FROM businesses WHERE id=$1",[id])).rows[0].deleted_at);
      assert.ok(!(await request("/admin/businesses",undefined,"GET")).body.businesses.some(b=>b.id===id));
      assert.equal((await request(`/businesses/${id}/dashboard`,undefined,"GET",login.body.business.token)).status,401);
      assert.equal((await request("/businesses/auth/login",{email:input.email,password})).status,401);
      assert.equal((await request(`/admin/businesses/${id}`,undefined,"DELETE")).status,404);
      assert.equal((await request("/admin/businesses",input)).status,201,"deleted account contact must be reusable");
    });
    await t.test("admin removes riders, closes offers and retains delivered-order finance",async()=>{
      const input={name:"Rider to remove",phone:"+355699990002",email:"remove-rider@example.invalid",
        password,vehicleType:"ELECTRIC",status:"ACTIVE"};
      const created=await request("/admin/riders",input);
      assert.equal(created.status,201,JSON.stringify(created));
      const id=created.body.rider.id;
      const login=await request("/riders/auth/login",{email:input.email,password});
      assert.equal(login.status,200);
      const historicOrder=await create();
      await db.query("UPDATE orders SET status='ACCEPTED',assigned_rider_id=$2 WHERE id=$1",[historicOrder,id]);
      assert.equal((await request(`/admin/riders/${id}`,undefined,"DELETE",null)).status,401);
      assert.equal((await request(`/admin/riders/${id}`,undefined,"DELETE")).body.error,"RIDER_HAS_ACTIVE_ORDERS");
      await db.query("UPDATE orders SET status='DELIVERED' WHERE id=$1",[historicOrder]);
      await db.query("INSERT INTO ledger_entries(rider_id,order_id,entry_type,amount,direction) VALUES($1,$2,'TEST',10,'RIDER_EARNS')",[id,historicOrder]);
      const offeredOrder=await create();
      await offer(offeredOrder,id);
      assert.equal((await request(`/admin/riders/${id}`,undefined,"DELETE")).status,200);
      assert.equal((await db.query("SELECT status FROM order_offers WHERE order_id=$1 AND rider_id=$2",[offeredOrder,id])).rows[0].status,"CANCELLED");
      assert.ok((await db.query("SELECT id FROM ledger_entries WHERE rider_id=$1 AND order_id=$2",[id,historicOrder])).rowCount);
      assert.ok((await db.query("SELECT deleted_at FROM rider_profiles WHERE id=$1",[id])).rows[0].deleted_at);
      assert.ok(!(await request("/admin/riders",undefined,"GET")).body.riders.some(r=>r.id===id));
      assert.equal((await request(`/riders/${id}/dashboard`,undefined,"GET",login.body.rider.token)).status,401);
      assert.equal((await request("/riders/auth/login",{email:input.email,password})).status,401);
      assert.equal((await request(`/admin/riders/${id}`,undefined,"DELETE")).status,404);
      assert.equal((await request("/admin/riders",input)).status,201,"deleted rider contact must be reusable");
    });
    if(process.env.QA_AUDIT === "1") await (await import("./preproduction-audit.mjs")).audit({t,request,db,base,realFetch,business,nearbyBusiness,payload,adminToken,api,create,dispatch});
  } finally {
    globalThis.fetch=realFetch;globalThis.Date=RealDate;
    for(const socket of sockets)socket.close();
    if(api){await new Promise(resolve=>api.io.close(resolve));await api.pool.end();}
    if(db)await db.end();
    await owner.query(`DROP DATABASE "${name}" WITH (FORCE)`);await owner.end();
    process.env.DATABASE_URL=originalUrl;
  }
});
