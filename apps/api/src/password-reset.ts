import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import type { Express } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

type Portal = 'admin' | 'business' | 'rider';
export type ResetMail = {to:string; url:string};
const digest=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');
const portalSchema=z.enum(['admin','business','rider']);
const genericMessage='Nëse email-i i përket një llogarie aktive, do të marrësh një link për ndryshimin e fjalëkalimit.';

export async function sendResetMail({to,url}:ResetMail) {
  const port=Number(process.env.SMTP_PORT);
  if(!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || ![465,587].includes(port))
    throw new Error('SMTP_NOT_CONFIGURED');
  const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port,
    secure:port===465,requireTLS:port===587,
    auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD},
    connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
  await transporter.sendMail({from:process.env.SMTP_FROM || process.env.SMTP_USER,to,
    subject:'Happy Tirana — Ndrysho fjalëkalimin',
    text:`Për të ndryshuar fjalëkalimin, hap këtë link:\n\n${url}\n\nLinku skadon pas 20 minutash dhe përdoret vetëm një herë. Nëse nuk e kërkove këtë ndryshim, injoroje këtë email.`});
}

async function eligible(client:PoolClient,portal:Portal,field:'email'|'id',value:string) {
  return client.query(`SELECT u.id,u.email,u.session_version FROM users u
    WHERE ${field==='email'?'lower(u.email)=$1':'u.id=$1::uuid'} AND u.status='ACTIVE'
    AND (($2='admin' AND u.role::text IN ('ADMIN','SUPERADMIN','OPERATOR'))
      OR ($2='business' AND u.role='BUSINESS' AND EXISTS(
        SELECT 1 FROM business_users bu JOIN businesses b ON b.id=bu.business_id
        WHERE bu.user_id=u.id AND b.status='ACTIVE' AND b.deleted_at IS NULL))
      OR ($2='rider' AND u.role='RIDER' AND EXISTS(
        SELECT 1 FROM rider_profiles rp WHERE rp.user_id=u.id AND rp.status='ACTIVE' AND rp.deleted_at IS NULL)))
    FOR UPDATE OF u`,[value,portal]);
}

export function registerPasswordReset(app:Express,pool:Pool,hashPassword:(password:string)=>string,
  revoke:(userId:string)=>Promise<void>,send:(mail:ResetMail)=>Promise<void>=sendResetMail) {
  app.post('/auth/password-reset/request',async(req,res)=>{
    const parsed=z.object({email:z.string().trim().email().max(254),portal:portalSchema}).safeParse(req.body);
    if(!parsed.success){res.status(422).json({error:'VALIDATION_ERROR'});return;}
    const {portal}=parsed.data,email=parsed.data.email.toLowerCase();
    const client=await pool.connect();let tokenHash:string|undefined;
    try {
      // Database-backed limits survive restarts and are shared by all API instances.
      for(const [key,max] of [[`email:${email}`,3],[`ip:${req.ip}`,20]] as const){
        const rate=await client.query(`INSERT INTO password_reset_limits(key_hash) VALUES($1)
          ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN password_reset_limits.window_start<now()-interval '15 minutes' THEN 1 ELSE password_reset_limits.attempts+1 END,
          window_start=CASE WHEN password_reset_limits.window_start<now()-interval '15 minutes' THEN now() ELSE password_reset_limits.window_start END RETURNING attempts`,[digest(key)]);
        if(rate.rows[0].attempts>max){res.setHeader('Retry-After','900');res.status(429).json({error:'RESET_RATE_LIMITED'});return;}
      }
      await client.query('BEGIN');
      const account=(await eligible(client,portal,'email',email)).rows[0];
      if(!account){await client.query('COMMIT');res.json({message:genericMessage});return;}
      const publicUrl=new URL(process.env.PASSWORD_RESET_PUBLIC_URL || process.env.PUBLIC_URL || '');
      if(!['https:','http:'].includes(publicUrl.protocol) || (publicUrl.protocol==='http:'&&!['localhost','127.0.0.1'].includes(publicUrl.hostname))) throw new Error('RESET_URL_INVALID');
      const token=crypto.randomBytes(32).toString('hex');tokenHash=digest(token);
      await client.query('DELETE FROM password_reset_tokens WHERE user_id=$1 OR expires_at<now()',[account.id]);
      await client.query(`INSERT INTO password_reset_tokens(token_hash,user_id,portal,session_version,expires_at)
        VALUES($1,$2,$3,$4,now()+interval '20 minutes')`,[tokenHash,account.id,portal,account.session_version]);
      await client.query('COMMIT');
      const url=new URL(`/${portal}/reset-password`,publicUrl.origin);url.hash=`token=${token}`;
      await send({to:account.email,url:url.href});
      res.json({message:genericMessage});
    }catch{
      await client.query('ROLLBACK');
      if(tokenHash) await client.query('DELETE FROM password_reset_tokens WHERE token_hash=$1',[tokenHash]);
      console.error('Password reset email delivery failed (credentials and link omitted)');
      res.status(503).json({error:'RESET_EMAIL_UNAVAILABLE'});
    }finally{client.release();}
  });
  app.post('/auth/password-reset/confirm',async(req,res)=>{
    const parsed=z.object({portal:portalSchema,token:z.string().regex(/^[a-f0-9]{64}$/),password:z.string().min(10).max(128)}).safeParse(req.body);
    if(!parsed.success){res.status(422).json({error:'VALIDATION_ERROR'});return;}
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const {token,password,portal}=parsed.data;
      const reset=(await client.query('SELECT * FROM password_reset_tokens WHERE token_hash=$1 AND portal=$2 AND used_at IS NULL AND expires_at>now()',[digest(token),portal])).rows[0];
      const user=reset?(await eligible(client,portal,'id',reset.user_id)).rows[0]:null;
      if(!user || user.session_version!==reset.session_version) throw new Error('RESET_INVALID');
      const used=await client.query('UPDATE password_reset_tokens SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() RETURNING user_id',[digest(token)]);
      if(!used.rowCount) throw new Error('RESET_INVALID');
      await client.query('UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1',[user.id,hashPassword(password)]);
      await client.query('UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1',[user.id]);
      await client.query('COMMIT');
      await revoke(user.id);
      res.json({ok:true});
    }catch{await client.query('ROLLBACK');res.status(400).json({error:'RESET_INVALID_OR_EXPIRED'});}
    finally{client.release();}
  });
}
