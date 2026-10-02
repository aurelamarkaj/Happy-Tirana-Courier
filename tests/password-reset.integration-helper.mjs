import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import http from 'node:http';
import {registerPasswordReset} from '../apps/api/src/password-reset.ts';

export async function testPasswordReset({t,api,db,request}) {
  const app=express();app.use(express.json());const sent=[],revoked=[];
  let failMail=false;
  const hash=p=>{const salt=crypto.randomBytes(16).toString('hex');return salt+':'+crypto.pbkdf2Sync(p,salt,120000,32,'sha256').toString('hex');};
  const oldUrl=process.env.PASSWORD_RESET_PUBLIC_URL;process.env.PASSWORD_RESET_PUBLIC_URL='http://localhost:3000';
  registerPasswordReset(app,api.pool,hash,async id=>{revoked.push(id);},async mail=>{if(failMail)throw Error('Synthetic SMTP failure');sent.push(mail);});
  const server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${server.address().port}`;
  const call=async(path,body)=>{const r=await fetch(url+'/auth/password-reset/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  const resetRequest=(email,portal='rider')=>call('request',{email,portal});
  const lastToken=()=>new URLSearchParams(new URL(sent.at(-1).url).hash.slice(1)).get('token');
  let serial=0;
  const fixture=async(portal='rider')=>{
    const email=`reset-${serial++}@example.invalid`,password='Initial-Password-456';
    const uid=(await db.query('INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id', ['Reset QA',email,hash(password),portal==='admin'?'SUPERADMIN':portal==='business'?'BUSINESS':'RIDER'])).rows[0].id;
    let id=uid;
    if(portal==='rider')id=(await db.query("INSERT INTO rider_profiles(user_id,vehicle_type) VALUES($1,'DIESEL') RETURNING id",[uid])).rows[0].id;
    if(portal==='business'){
      id=(await db.query("INSERT INTO businesses(name,email,phone,address_text,lat,lng) VALUES('Reset QA',$1,'+355690000099','Test',41.33,19.82) RETURNING id",[email])).rows[0].id;
      await db.query('INSERT INTO business_users(business_id,user_id,is_primary) VALUES($1,$2,true)',[id,uid]);
    }
    return {email,password,uid,id,portal};
  };
  const confirm=(token,portal='rider',password='Changed-Password-789')=>call('confirm',{token,portal,password});
  try{
    for(const portal of ['admin','business','rider']) await t.test(`password reset: ${portal} email link, login and previous session revocation`,async()=>{
      const f=await fixture(portal),prefix=portal==='business'?'businesses':portal==='rider'?'riders':'admin';
      const login=await request(`/${prefix}/auth/login`,{email:f.email,password:f.password});assert.equal(login.status,200);
      const oldToken=login.body[portal].token;
      assert.equal((await resetRequest(f.email,portal)).status,200);assert.equal(sent.at(-1).to,f.email);
      const token=lastToken();assert.ok(sent.at(-1).url.startsWith(`http://localhost:3000/${portal}/reset-password#token=`));
      assert.equal((await db.query('SELECT count(*)::int n FROM password_reset_tokens WHERE token_hash=$1',[token])).rows[0].n,0,'raw token is not stored');
      assert.equal((await confirm(token,portal)).status,200);
      assert.equal((await confirm(token,portal)).status,400);
      assert.equal((await request(`/${prefix}/auth/login`,{email:f.email,password:f.password})).status,401);
      const next=await request(`/${prefix}/auth/login`,{email:f.email,password:'Changed-Password-789'});assert.equal(next.status,200);
      const path=portal==='admin'?'/admin/finance':`/${prefix}/${f.id}/dashboard`;
      assert.equal((await request(path,undefined,'GET',oldToken)).status,401);
      assert.equal((await request(path,undefined,'GET',next.body[portal].token)).status,200);
      assert.ok(revoked.includes(f.uid));
    });
    await t.test('password reset: unknown, inactive, suspended and deleted accounts never receive mail',async()=>{
      const before=sent.length;assert.equal((await resetRequest('missing@example.invalid')).status,200);
      for(const [portal,status] of [['rider','INACTIVE'],['rider','SUSPENDED'],['business','INACTIVE'],['business','SUSPENDED'],['admin','INACTIVE'],['admin','SUSPENDED']]){
        const f=await fixture(portal);
        if(portal==='admin')await db.query('UPDATE users SET status=$2 WHERE id=$1',[f.uid,status]);
        else await db.query(`UPDATE ${portal==='rider'?'rider_profiles':'businesses'} SET status=$2 WHERE id=$1`,[f.id,status]);
        assert.equal((await resetRequest(f.email,portal)).status,200);
      }
      const f=await fixture();await db.query('UPDATE rider_profiles SET deleted_at=now() WHERE id=$1',[f.id]);await resetRequest(f.email);
      assert.equal(sent.length,before);
    });
    await t.test('password reset: suspension after email prevents redemption',async()=>{
      const f=await fixture();await resetRequest(f.email);const token=lastToken();
      await db.query("UPDATE users SET status='SUSPENDED' WHERE id=$1",[f.uid]);
      assert.equal((await confirm(token)).status,400);
      assert.equal((await db.query('SELECT session_version FROM users WHERE id=$1',[f.uid])).rows[0].session_version,0);
    });
    await t.test('password reset: expired, malformed and wrong-portal links rejected',async()=>{
      const f=await fixture();await resetRequest(f.email);const token=lastToken();
      assert.equal((await confirm(token,'business')).status,400);
      assert.equal((await confirm('bad')).status,422);
      assert.equal((await confirm(token,'rider','short')).status,422);
      await db.query("UPDATE password_reset_tokens SET expires_at=now()-interval '1 second' WHERE user_id=$1",[f.uid]);assert.equal((await confirm(token)).status,400);
    });
    await t.test('password reset: concurrent redemption has exactly one winner',async()=>{
      await db.query('DELETE FROM password_reset_limits');const f=await fixture();await resetRequest(f.email);const token=lastToken();
      const results=await Promise.all([confirm(token),confirm(token)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
    });
    await t.test('password reset: new request invalidates previous link and requests are rate limited',async()=>{
      const f=await fixture();await resetRequest(f.email);const old=lastToken();await resetRequest(f.email);assert.equal((await confirm(old)).status,400);
      assert.equal((await resetRequest(f.email)).status,200);assert.equal((await resetRequest(f.email)).status,429);
    });
    await t.test('password reset: SMTP failure leaves no usable token or changed password',async()=>{
      const f=await fixture();failMail=true;
      try {assert.equal((await resetRequest(f.email)).status,503);}finally{failMail=false;}
      assert.equal((await db.query('SELECT count(*)::int n FROM password_reset_tokens WHERE user_id=$1',[f.uid])).rows[0].n,0);
      assert.equal((await request('/riders/auth/login',{email:f.email,password:f.password})).status,200);
    });
  }finally{await new Promise(r=>server.close(r));if(oldUrl===undefined)delete process.env.PASSWORD_RESET_PUBLIC_URL;else process.env.PASSWORD_RESET_PUBLIC_URL=oldUrl;}
}
