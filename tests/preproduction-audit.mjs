// Non-destructive security/integrity checks; invoked only in the isolated operations DB.
import assert from 'node:assert/strict';
import {io} from 'socket.io-client';
export async function audit({t, request, db, base, realFetch, business, nearbyBusiness, payload, adminToken,api,create,dispatch}) {
  const call=async(path,method='GET',body,headers={})=>{
    const r=await realFetch(base+path,{method,headers:{'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:r.status,body:await r.json()};
  };
  const signup=await call('/public/auth/signup','POST',{name:'QA Customer',phone:'+355699001234',password:'QA-only-password',defaultAddress:'Synthetic address'});
  const id=signup.body.customer.id;
  await t.test('QA01 customer identity header alone must not authorize profile reads',async()=>{
    const r=await call('/public/me','GET',undefined,{'x-customer-id':id});
    assert.equal(r.status,401,`unsigned customer header returned ${r.status}`);
  });
  await t.test('QA02 customer identity header alone must not authorize profile writes',async()=>{
    const r=await call('/public/me','PATCH',{name:'Unauthorized QA change',phone:'+355699001234',defaultAddress:'Changed synthetic address'},{'x-customer-id':id});
    assert.equal(r.status,401,`unsigned profile mutation returned ${r.status}`);
  });
  await t.test('QA03 public endpoint must not create orders on behalf of a business anonymously',async()=>{
    const r=await call('/public/orders','POST',{...payload,businessId:business});
    assert.ok([401,403].includes(r.status),`anonymous order submission returned ${r.status}: ${JSON.stringify(r.body)}`);
  });
  await t.test('QA04 customer order history query works for a registered customer',async()=>{
    const r=await call('/public/me/orders','GET',undefined,{'x-customer-id':id});
    assert.equal(r.status,200,JSON.stringify(r.body));
  });
  await t.test('QA05 cart rejects a product belonging to another business',async()=>{
    const product=(await db.query("INSERT INTO products(business_id,name,price) VALUES($1,'QA product',100) RETURNING id",[nearbyBusiness])).rows[0].id;
    const r=await call('/public/cart/items','PUT',{businessId:business,productId:product,quantity:1},{'x-guest-cart-id':'qa-disposable-guest'});
    assert.ok([400,409,422].includes(r.status),`cross-business product returned ${r.status}`);
  });
  await t.test('QA06 password reset revokes previous rider session',async()=>{
    const input={name:'QA Session',phone:'+355699001235',email:'qa-session@example.invalid',password:'old-qa-password',vehicleType:'DIESEL',status:'ACTIVE'};
    const created=await request('/admin/riders',input);assert.equal(created.status,201);
    const login=await request('/riders/auth/login',{email:input.email,password:input.password});
    const rider=created.body.rider.id;
    assert.equal((await request(`/admin/riders/${rider}/password`,{password:'new-qa-password'},'PATCH')).status,200);
    const r=await request(`/riders/${rider}/dashboard`,undefined,'GET',login.body.rider.token);
    assert.equal(r.status,401,`old token after password reset returned ${r.status}`);
  });
  await t.test('QA07 malformed IDs must not expose database diagnostics',async()=>{
    const r=await request('/admin/businesses/not-a-uuid/orders',undefined,'GET');
    assert.ok(!JSON.stringify(r.body).includes('invalid input syntax'),JSON.stringify(r.body));
  });
  await t.test('QA08 malformed and expired-signature admin credentials are rejected',async()=>{
    assert.equal((await request('/admin/finance',undefined,'GET','invalid')).status,401);
    const parts=adminToken.split('.');parts[1]='1';
    assert.equal((await request('/admin/finance',undefined,'GET',parts.join('.'))).status,401);
  });
  await t.test('QA09 categories validate empty names and persist Unicode names',async()=>{
    assert.equal((await request('/admin/business-categories',{name:''})).status,422);
    const r=await request('/admin/business-categories',{name:'QA Ëmbëlsira'});assert.equal(r.status,201,JSON.stringify(r));
    assert.equal((await request('/admin/business-categories',undefined,'GET')).status,200);
  });
  await t.test('QA10 unknown tracking code is rejected',async()=>{
    assert.equal((await call('/public/orders/QA-NOT-FOUND/track')).status,404);
  });
  await t.test('QA11 suspended admin loses an already joined socket room',async()=>{
    const socket=io(base,{transports:['websocket'],reconnection:false});
    const adminId=adminToken.split('.')[0];
    try {
      await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
      assert.equal(await socket.timeout(1000).emitWithAck('admin.join',adminToken),true);
      await db.query("UPDATE users SET status='SUSPENDED' WHERE id=$1",[adminId]);
      let received=false;socket.on('qa.audit',()=>{received=true;});
      api.io.to('admin').emit('qa.audit',{synthetic:true});
      await new Promise(r=>setTimeout(r,100));
      assert.equal(received,false,'suspended admin still receives room events');
    } finally {socket.close();await db.query("UPDATE users SET status='ACTIVE' WHERE id=$1",[adminId]);}
  });
  await t.test('QA12 nearby dispatch excludes day-old GPS',async()=>{
    const user=(await db.query("INSERT INTO users(name,role,password_hash,email) VALUES('QA stale GPS','RIDER','qa-unusable-hash','stale-qa@example.invalid') RETURNING id")).rows[0].id;
    const rider=(await db.query("INSERT INTO rider_profiles(user_id,is_online,vehicle_type) VALUES($1,true,'DIESEL') RETURNING id",[user])).rows[0].id;
    await db.query("INSERT INTO rider_locations(rider_id,lat,lng,point,recorded_at) VALUES($1,41.33,19.82,ST_SetSRID(ST_MakePoint(19.82,41.33),4326),now()-interval '1 day')",[rider]);
    const order=await create();await db.query("UPDATE orders SET offer_after=now()-interval '1 second' WHERE id=$1",[order]);await dispatch();
    assert.equal((await db.query('SELECT count(*)::int AS n FROM order_offers WHERE order_id=$1 AND rider_id=$2',[order,rider])).rows[0].n,0,'stale GPS treated as nearby');
  });
  await t.test('QA13 admin pagination and status filter agree with database',async()=>{
    const r=await request('/admin/orders?status=DELIVERED&page=1&pageSize=2',undefined,'GET');
    assert.equal(r.status,200);assert.ok(r.body.orders.every(o=>o.status==='DELIVERED')); assert.equal(r.body.total,(await db.query("SELECT count(*)::int AS n FROM orders WHERE status='DELIVERED'" )).rows[0].n); assert.equal((await request('/admin/orders?page=9999',undefined,'GET')).body.orders.length,0); assert.equal((await request('/admin/orders?page=0',undefined,'GET')).status,422);
  });
  await t.test('QA14 public catalog and single-business lookup work',async()=>{
    assert.equal((await call('/public/businesses')).status,200);
    assert.equal((await call(`/public/businesses/${business}`)).status,200);
  });
  await t.test('QA15 invalid JSON and unsupported mutation are rejected',async()=>{
    const r=await realFetch(base+'/admin/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});
    assert.equal(r.status,400);
    assert.equal((await realFetch(base+'/health',{method:'DELETE'})).status,404);
  });
}
