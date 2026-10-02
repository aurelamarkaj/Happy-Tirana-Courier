"use client";
import Link from 'next/link';
import {useEffect,useState,type FormEvent} from 'react';

export function PasswordResetForm({portal,confirm=false}:{portal:'admin'|'business'|'rider';confirm?:boolean}) {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState('');
  const [token,setToken]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
  useEffect(()=>{
    if(confirm){const value=new URLSearchParams(window.location.hash.slice(1)).get('token');if(value)setToken(value);window.history.replaceState(null,'',window.location.pathname);}
  },[confirm]);
  async function submit(event:FormEvent){
    event.preventDefault();setMessage('');
    if(confirm&&password!==repeat){setMessage('Fjalëkalimet nuk përputhen.');return;}
    setBusy(true);
    try{
      const response=await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL??'/api'}/auth/password-reset/${confirm?'confirm':'request'}`,{
        method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(30000),
        body:JSON.stringify(confirm?{portal,token,password}:{portal,email})});
      if(!response.ok){
        setMessage(response.status===429?'Ke bërë shumë kërkesa. Provo pas 15 minutash.':response.status===503?
          'Email-i nuk mund të dërgohet tani. Provo përsëri më vonë.':confirm?
          'Linku ka skaduar, është përdorur ose llogaria nuk është aktive. Kërko një link të ri.':'Kontrollo email-in dhe provo përsëri.');return;
      }
      setDone(true);setPassword('');setRepeat('');
      setMessage(confirm?'Fjalëkalimi u ndryshua. Hyr përsëri me fjalëkalimin e ri.':
        'Nëse email-i i përket një llogarie aktive, do të marrësh një link që skadon pas 20 minutash. Kontrollo edhe Spam.');
    }catch{setMessage('Lidhja dështoi ose kërkesa zgjati shumë. Provo përsëri.');}finally{setBusy(false);}
  }
  const input={width:'100%',padding:'12px',border:'1px solid #94a3b8',borderRadius:10,color:'#0f172a',background:'#f8fafc',marginTop:8} as const;
  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'#f8fafc',color:'#0f172a'}}>
    <form onSubmit={submit} style={{width:'100%',maxWidth:480,padding:32,border:'1px solid #cbd5e1',borderRadius:20,background:'#fff'}}>
      <h1 style={{fontSize:24,fontWeight:700}}>{confirm?'Vendos fjalëkalimin e ri':'Ke harruar fjalëkalimin?'}</h1>
      <p style={{margin:'16px 0',color:'#475569'}}>{confirm?'Përdor të paktën 10 karaktere.':'Shkruaj email-in e llogarisë. Ndryshimi lejohet vetëm për llogari aktive.'}</p>
      {!done&&(!confirm?<label>Email<input style={input} type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>:
        <><label>Fjalëkalimi i ri<input style={input} type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>
          <label style={{display:'block',marginTop:20}}>Përsërit fjalëkalimin<input style={input} type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={repeat} onChange={e=>setRepeat(e.target.value)}/></label></>)}
      {confirm&&!token&&!done&&<p role="alert" style={{marginTop:16}}>Linku mungon. Hape linkun nga email-i ose kërko një të ri.</p>}
      {message&&<p role="status" style={{marginTop:20,lineHeight:1.6}}>{message}</p>}
      {!done&&<button disabled={busy||(confirm&&!token)} type="submit" style={{width:'100%',marginTop:24,padding:14,borderRadius:10,background:'#f45100',color:'#fff',opacity:busy||(confirm&&!token)?0.6:1}}>{busy?'Duke përpunuar…':confirm?'Ndrysho fjalëkalimin':'Dërgo linkun në email'}</button>}
      <p style={{marginTop:24}}><Link href="/login" style={{color:'#c2410c'}}>Kthehu te hyrja</Link>{confirm&&<> · <Link href="/forgot-password" style={{color:'#c2410c'}}>Kërko link të ri</Link></>}</p>
    </form>
  </main>;
}
