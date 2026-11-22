/* Scores the Studio voice cleanup on synthetic voices with known quiet gaps: noise, hum, sibilance, level spread, fidelity.
   cd scripts/voice-clean; python3 synth.py; (python3 -m http.server 3000 from the repo root); node run.js new; python3 score.py new */
const {chromium}=require('playwright');const fs=require('fs');
const tag=process.argv[2]||'base', BASE=process.argv[3]||'http://localhost:3000';const names=fs.readdirSync('vv').filter(f=>/_(hiss|hum|room)\.wav$/.test(f)).map(f=>f.replace('.wav',''));
(async()=>{
 const b=await chromium.launch();
 for(const n of names){
  const ctx=await b.newContext({viewport:{width:1280,height:800}});
  await ctx.addInitScript(()=>{localStorage.setItem('ps.sb',JSON.stringify({access_token:'t',refresh_token:'r',expires_at:Date.now()+3.6e6,user:{id:'u1',email:'t@e.com'}}));localStorage.setItem('ps.profile',JSON.stringify({name:'T',email:'t@e.com',created:Date.now(),joined:Date.now(),kit:true}));});
  await ctx.route('**/*.supabase.co/**',r=>r.fulfill({status:200,contentType:'application/json',body:r.request().url().includes('/auth/v1/user')?'{"id":"u1","email":"t@e.com"}':'[]'}));
  await ctx.route('**/app.kit.com/**',r=>r.fulfill({status:200,body:'{}'}));
  const p=await ctx.newPage();await p.goto(BASE+'/studio/');await p.waitForTimeout(2200);
  await p.evaluate(()=>PennioShell.showView('voice'));await p.setInputFiles('#vfile','voices/'+n+'.wav');
  await p.waitForFunction(()=>!document.getElementById('vbeat').disabled&&PennioVoice.pro(),null,{timeout:180000});await p.waitForTimeout(500);
  const t0=Date.now();
  const r=await p.evaluate(()=>{const enc=b=>{const d=b.getChannelData(0);const u=new Uint8Array(d.buffer.slice(d.byteOffset,d.byteOffset+d.byteLength));let s='';for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));return btoa(s)};return {raw:enc(PennioVoice.raw()),pro:enc(PennioVoice.pro()),den:enc(PennioVoice.clean()),sr:PennioVoice.pro().sampleRate,hum:PennioVoice.hum(),meta:document.getElementById('vmeta').textContent}});
  fs.writeFileSync(`out/${tag}_${n}.raw.f32`,Buffer.from(r.raw,'base64'));fs.writeFileSync(`out/${tag}_${n}.pro.f32`,Buffer.from(r.pro,'base64'));fs.writeFileSync(`out/${tag}_${n}.den.f32`,Buffer.from(r.den,'base64'));
  fs.writeFileSync(`out/${tag}_${n}.json`,JSON.stringify({sr:r.sr,hum:r.hum,meta:r.meta}));
  console.log(n.padEnd(18),'processed; hum detected:',JSON.stringify(r.hum));await ctx.close();
 }
 await b.close();
})();
