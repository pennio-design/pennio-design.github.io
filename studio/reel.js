/* Reels: a short video of your beat, three sizes and three looks, recorded in this browser.
   The audio is the same rendered master the MP3 comes from; the picture is your cover art, your title and the
   sound itself (bars, waveform or a pulse). Nothing is uploaded. The recording runs in real time, so a 30 s reel
   takes about 30 s, and the screen has to stay open while it records.
   PennioReel.make(opts)    -> {blob, name, mime, ext, sec, w, h}
   PennioReel.frame(opts,t) -> a canvas with one still frame (used by tests and the preview)
   PennioReel.share(file)   -> "shared" | "cancelled" | "unsupported"  (never throws for the expected cases)   */
(()=>{
const SIZES={"9:16":[720,1280],"1:1":[900,900],"16:9":[1280,720]};
const MIMES=[["video/mp4;codecs=avc1.42E01E,mp4a.40.2","mp4"],["video/mp4","mp4"],["video/webm;codecs=vp9,opus","webm"],["video/webm;codecs=vp8,opus","webm"],["video/webm","webm"]];
const LOOKS={
  bars: {bg:"#0E0E10",fg:"#F4F1EC",dim:"rgba(244,241,236,.12)",acc:"#F26522",acc2:"#F2B33D"},
  wave: {bg:"#F4F1EC",fg:"#17130F",dim:"rgba(23,19,15,.16)",acc:"#D9541A",acc2:"#D9541A"},
  cover:{bg:"#140A04",fg:"#FFF3E6",dim:"rgba(255,243,230,.16)",acc:"#F26522",acc2:"#FFB47A"}
};
function support(){
  if(typeof MediaRecorder==="undefined"||!HTMLCanvasElement.prototype.captureStream) return null;
  for(const [m,e] of MIMES){ try{ if(MediaRecorder.isTypeSupported(m)) return {mime:m,ext:e}; }catch(x){} }
  return null;
}
function layout(W,H){
  if(W>H) return {wide:true,cover:{x:70,y:(H-480)/2,s:480},text:{x:620,y:190,w:W-620-70,al:"left"},viz:{x:620,y:430,w:W-620-70,h:190},foot:{x:70,y:H-42,al:"left"}};
  if(W===H) return {cover:{x:(W-360)/2,y:60,s:360},text:{x:W/2,y:470,w:W-120,al:"center"},viz:{x:60,y:610,w:W-120,h:190},foot:{x:W/2,y:H-36,al:"center"}};
  return {cover:{x:100,y:150,s:W-200},text:{x:W/2,y:H*.57,w:W-120,al:"center"},viz:{x:60,y:H*.7,w:W-120,h:250},foot:{x:W/2,y:H-60,al:"center"}};
}
function rr(x,a,b,w,h,r){ x.beginPath(); if(x.roundRect) x.roundRect(a,b,w,h,r); else x.rect(a,b,w,h); }
function wrapText(x,t,max,n){ const w=String(t).split(/\s+/),L=[];let c="";
  for(const s of w){ const k=c?c+" "+s:s; if(x.measureText(k).width>max&&c){ L.push(c); c=s; } else c=k; }
  if(c) L.push(c); return L.slice(0,n); }
/* bin the spectrum into n bars, weighted toward the low end where the beat lives */
function bands(freq,n){ const out=new Array(n),len=Math.min(freq.length,96);
  for(let i=0;i<n;i++){ const a=Math.floor(Math.pow(i/n,1.7)*len), b=Math.max(a+1,Math.floor(Math.pow((i+1)/n,1.7)*len)); let s=0; for(let k=a;k<b;k++) s+=freq[k]||0; out[i]=s/(b-a)/255; }
  return out; }
function draw(x,st){
  const {W,H,t,dur}=st, L=LOOKS[st.look]||LOOKS.bars, Y=layout(W,H), f=st.freq||new Uint8Array(128);
  const bass=(f[0]+f[1]+f[2]+f[3]+f[4])/5/255, p=Math.max(0,Math.min(1,t/dur));
  x.fillStyle=L.bg; x.fillRect(0,0,W,H);
  if(st.look==="cover"&&st.cover){ x.imageSmoothingEnabled=true; x.imageSmoothingQuality="high";
    const t0=st.tiny; if(t0){ x.globalAlpha=.55; x.drawImage(t0,0,0,W,H); x.globalAlpha=1; }
    const g=x.createLinearGradient(0,0,0,H); g.addColorStop(0,"rgba(10,5,2,.35)"); g.addColorStop(1,"rgba(10,5,2,.85)"); x.fillStyle=g; x.fillRect(0,0,W,H); }
  /* cover art, with a small kick on the bass */
  const k=1+bass*.045, c=Y.cover, cs=c.s*k, cx=c.x+c.s/2-cs/2, cy=c.y+c.s/2-cs/2;
  if(st.look==="cover"){ x.strokeStyle=L.acc; for(let i=3;i>=1;i--){ x.globalAlpha=(.34-i*.08)*(.5+bass); x.lineWidth=3; {const e=i*13*(.6+bass); rr(x,cx-e,cy-e,cs+e*2,cs+e*2,30+i*8);}; x.stroke(); } x.globalAlpha=1; }
  x.save(); x.shadowColor="rgba(0,0,0,.35)"; x.shadowBlur=40; x.shadowOffsetY=14; rr(x,cx,cy,cs,cs,Math.round(cs*.06)); x.fillStyle=L.dim; x.fill(); x.restore();
  if(st.cover){ x.save(); rr(x,cx,cy,cs,cs,Math.round(cs*.06)); x.clip(); x.drawImage(st.cover,cx,cy,cs,cs); x.restore(); }
  /* title and artist */
  const T=Y.text; x.textAlign=T.al; x.textBaseline="alphabetic"; x.fillStyle=L.fg;
  let size=W>H?64:W===H?54:62, lines; x.font="800 "+size+"px Inter,system-ui,sans-serif"; lines=wrapText(x,st.title,T.w,2);
  while(size>34&&lines.some(s=>x.measureText(s).width>T.w)){ size-=4; x.font="800 "+size+"px Inter,system-ui,sans-serif"; lines=wrapText(x,st.title,T.w,2); }
  lines.forEach((s,i)=>x.fillText(s,T.x,T.y+i*size*1.08));
  let ty=T.y+(lines.length-1)*size*1.08;
  const sub=[st.artist,st.bpm?st.bpm+" BPM":"",st.keyName].filter(Boolean).join("  ·  ");
  if(sub){ x.globalAlpha=.72; x.font="600 "+(W>H?28:26)+"px Inter,system-ui,sans-serif"; x.fillText(sub,T.x,ty+size*.62+14); x.globalAlpha=1; }
  /* the sound */
  const V=Y.viz;
  if(st.look==="wave"&&st.peaks){ const n=st.peaks.length, bw=V.w/n, mid=V.y+V.h/2;
    for(let i=0;i<n;i++){ const h=Math.max(4,st.peaks[i]*V.h); x.fillStyle=(i/n<=p)?L.acc:L.dim; rr(x,V.x+i*bw+bw*.18,mid-h/2,bw*.64,h,bw*.3); x.fill(); } }
  else if(st.look==="cover"){ const n=32, bw=V.w/n, bs=bands(f,n); const gap=bw*.3;
    for(let i=0;i<n;i++){ const h=6+bs[i]*V.h*.7; x.fillStyle=i/n<=p?L.acc2:L.dim; rr(x,V.x+i*bw+gap/2,V.y+V.h-h,bw-gap,h,(bw-gap)/2); x.fill(); } }
  else { const n=36, bw=V.w/n, bs=bands(f,n), gap=bw*.3; const gr=x.createLinearGradient(0,V.y,0,V.y+V.h); gr.addColorStop(0,L.acc2); gr.addColorStop(1,L.acc);
    for(let i=0;i<n;i++){ const h=8+bs[i]*V.h*.92; x.fillStyle=gr; rr(x,V.x+i*bw+gap/2,V.y+V.h-h,bw-gap,h,(bw-gap)/2); x.fill(); } }
  /* progress and mark */
  const py=V.y+V.h+26; x.fillStyle=L.dim; rr(x,V.x,py,V.w,6,3); x.fill(); x.fillStyle=L.acc; rr(x,V.x,py,Math.max(6,V.w*p),6,3); x.fill();
  const F=Y.foot; x.textAlign=F.al; x.font="800 34px Inter,system-ui,sans-serif"; x.fillStyle=st.look==="wave"?"#D9541A":L.acc; x.fillText("PENNIO.",F.x,F.y);
  x.globalAlpha=.6; x.fillStyle=L.fg; x.font="500 22px Inter,system-ui,sans-serif"; x.textAlign=F.al==="left"?"right":"center"; if(F.al==="left") x.fillText("pennio.agency/studio",W-70,F.y); else x.fillText("pennio.agency/studio",F.x,F.y+30); x.globalAlpha=1;
}
function peaksOf(buf,from,dur,n){ const a=buf.getChannelData(0), b=buf.numberOfChannels>1?buf.getChannelData(1):a, sr=buf.sampleRate, s0=Math.floor(from*sr), len=Math.floor(dur*sr), step=Math.max(1,Math.floor(len/n)), out=new Array(n); let mx=1e-6;
  for(let i=0;i<n;i++){ let m=0; const lo=s0+i*step, hi=Math.min(lo+step,a.length); for(let k=lo;k<hi;k+=4){ const v=Math.max(Math.abs(a[k]),Math.abs(b[k])); if(v>m) m=v; } out[i]=m; if(m>mx) mx=m; }
  return out.map(v=>.1+.9*Math.pow(v/mx,.8)); }
async function prep(o){
  const [W,H]=SIZES[o.ratio]||SIZES["9:16"];
  try{ await document.fonts.load("800 40px Inter"); await document.fonts.load("600 26px Inter"); await document.fonts.load("500 22px Inter"); }catch(e){}
  let cover=null,tiny=null; if(o.cover){ try{ cover=await createImageBitmap(o.cover); const t=document.createElement("canvas"); t.width=t.height=24; t.getContext("2d").drawImage(cover,0,0,24,24); tiny=t; }catch(e){} }
  return {W,H,look:o.look||"bars",title:o.title||"Untitled",artist:o.artist||"",bpm:o.bpm||0,keyName:o.keyName||"",cover,tiny};
}
async function frame(o,t){
  const st=await prep(o), dur=o.seconds||15, c=document.createElement("canvas"); c.width=st.W; c.height=st.H;
  st.dur=dur; st.t=t||0; st.freq=o.freq||new Uint8Array(128).map((_,i)=>Math.max(0,Math.round(220*Math.exp(-i/22)*(.7+.3*Math.sin(i*1.7+(t||0)*5)))));
  if(o.buf) st.peaks=peaksOf(o.buf,0,dur,st.W>st.H?60:48);
  draw(c.getContext("2d"),st); return c;
}
async function make(o){
  const sup=support(); if(!sup) throw new Error("reel-unsupported");
  const st=await prep(o), buf=o.buf; if(!buf) throw new Error("reel-nobuf");
  const dur=Math.max(2,Math.min(o.seconds||15,buf.duration)); st.dur=dur; st.peaks=peaksOf(buf,0,dur,st.W>st.H?60:48);
  const c=document.createElement("canvas"); c.width=st.W; c.height=st.H; const x=c.getContext("2d",{alpha:false});
  const AC=window.AudioContext||window.webkitAudioContext, ac=new AC(); try{ await ac.resume(); }catch(e){}
  const src=ac.createBufferSource(); src.buffer=buf; const an=ac.createAnalyser(); an.fftSize=256; an.smoothingTimeConstant=.72;
  const g=ac.createGain(), dest=ac.createMediaStreamDestination(); src.connect(g); g.connect(an); g.connect(dest);
  const freq=new Uint8Array(an.frequencyBinCount); st.freq=freq;
  draw(x,Object.assign(st,{t:0}));
  const vs=c.captureStream(30), stream=new MediaStream([...vs.getVideoTracks(),...dest.stream.getAudioTracks()]);
  let rec; try{ rec=new MediaRecorder(stream,{mimeType:sup.mime,videoBitsPerSecond:o.ratio==="16:9"?5e6:4e6,audioBitsPerSecond:192e3}); }catch(e){ rec=new MediaRecorder(stream); }
  const chunks=[]; rec.ondataavailable=e=>{ if(e.data&&e.data.size) chunks.push(e.data); };
  const done=new Promise((res,rej)=>{ rec.onstop=res; rec.onerror=e=>rej(e.error||new Error("reel-record")); });
  let aborted=false, timer=0, raf=0; const onVis=()=>{ if(document.hidden) aborted=true; }; document.addEventListener("visibilitychange",onVis);
  const t0=ac.currentTime+.15; g.gain.setValueAtTime(1,t0+dur-.45); g.gain.linearRampToValueAtTime(0,t0+dur);
  rec.start(500); src.start(t0,0,dur);
  await new Promise(res=>{ const tick=()=>{ const t=ac.currentTime-t0;
      if(aborted||t>=dur+.1){ res(); return; }
      an.getByteFrequencyData(freq); st.t=Math.max(0,t); draw(x,st); if(o.onProgress) o.onProgress(Math.max(0,Math.min(1,t/dur)),dur);
      raf=requestAnimationFrame(tick); }; raf=requestAnimationFrame(tick); });
  cancelAnimationFrame(raf); document.removeEventListener("visibilitychange",onVis);
  try{ draw(x,Object.assign(st,{t:dur,freq:new Uint8Array(128)})); }catch(e){}
  await new Promise(r=>setTimeout(r,120)); try{ rec.state!=="inactive"&&rec.stop(); }catch(e){}
  await done; stream.getTracks().forEach(t=>t.stop()); try{ src.stop(); }catch(e){} try{ ac.close(); }catch(e){}
  if(aborted) throw new Error("reel-hidden");
  const blob=new Blob(chunks,{type:sup.mime.split(";")[0]});
  if(blob.size<4000) throw new Error("reel-empty");
  const slug=String(o.title||"pennio-reel").normalize("NFKD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"").toLowerCase()||"pennio-reel";
  return {blob,name:slug+"-reel-"+o.ratio.replace(":","x")+"."+sup.ext,mime:blob.type,ext:sup.ext,sec:dur,w:st.W,h:st.H};
}
/* Sharing a file needs a fresh tap, so the page calls this from the Share button after the reel exists. */
async function share(file,text,title){
  try{
    if(!(navigator.canShare&&navigator.canShare({files:[file]}))) return "unsupported";
    await navigator.share({files:[file],text,title}); return "shared";
  }catch(e){ if(e&&e.name==="AbortError") return "cancelled"; return "unsupported"; }
}
window.PennioReel={support,make,frame,share,SIZES,LOOKS:Object.keys(LOOKS)};
})();
