/* Credits and cover art for every piece of music the Studio hands out.
   One path: PennioCredits.tag(blob, kind, source) returns the same audio with the title, artist, credits and a
   cover image written inside the file (ID3v2.3 for MP3; RIFF INFO plus an id3 chunk for WAV).
   The credits are only things the project knows: the name you gave it, your artist name, the instruments that
   are actually switched on, whether a recorded voice is in the mix, key and tempo, the export date, and any
   lines you type. Nothing is guessed or filled in on your behalf. */
(()=>{
const enc=new TextEncoder();
const LS="ps.credits.v1";
const store={get(){try{return JSON.parse(localStorage.getItem(LS)||"{}")}catch(e){return {}}},set(o){try{localStorage.setItem(LS,JSON.stringify(o))}catch(e){}}};
let provider=null, upload=null, titleOverride="", variant=0, cache={key:"",bytes:null,blob:null};

/* ---------- cover art ---------- */
const LOOKS=[
  {name:"Night",   bg:"#0E0E10", fg:"#F4F1EC", dim:"rgba(244,241,236,.09)", acc:["#F26522","#F2B33D","#3FB59A","#4F8FE0","#B77BE8","#E0577A"]},
  {name:"Paper",   bg:"#F4F1EC", fg:"#17130F", dim:"rgba(23,19,15,.09)",   acc:["#D9541A","#C9871A","#1F8A70","#2F6BC2","#8A4FC4","#C23B62"]},
  {name:"Orange",  bg:"#F26522", fg:"#140A04", dim:"rgba(20,10,4,.16)",    acc:["#140A04","#FFF3E6","#140A04","#FFF3E6","#140A04","#FFF3E6"]},
  {name:"Forest",  bg:"#0F2A22", fg:"#EAF4EE", dim:"rgba(234,244,238,.09)", acc:["#F2B33D","#7AD9B5","#F26522","#E8EFEA","#F28B5E","#9AE0C9"]}
];
function wrap(ctx,text,max,lines){
  const words=String(text).split(/\s+/).filter(Boolean),out=[];let cur="";
  for(const w of words){ const t=cur?cur+" "+w:w; if(ctx.measureText(t).width<=max||!cur) cur=t; else { out.push(cur); cur=w; } }
  if(cur) out.push(cur);
  if(out.length>lines){ const keep=out.slice(0,lines); let last=keep[lines-1]; while(last.length>1&&ctx.measureText(last+"…").width>max) last=last.slice(0,-1); keep[lines-1]=last+"…"; return keep; }
  return out;
}
async function drawCover(m,look){
  const S=1400,c=document.createElement("canvas");c.width=c.height=S;const x=c.getContext("2d");
  try{ await document.fonts.load("800 80px Inter"); await document.fonts.load("500 40px Inter"); }catch(e){}
  x.fillStyle=look.bg;x.fillRect(0,0,S,S);
  const pad=110, lanes=(m.pattern?m.laneIds:[]).filter(id=>m.pattern[id]&&m.pattern[id].some(Boolean)).slice(0,9);
  /* the beat itself is the artwork: one row per instrument, one cell per step, filled where it plays */
  const n=m.steps===12?12:16, gridTop=pad+150, gridH=640, gridW=S-pad*2;
  if(!lanes.length){ let h=2166136261; for(const ch of m.title){ h=Math.imul(h^ch.charCodeAt(0),16777619); } const bars=28,bw=(gridW-14*(bars-1))/bars; for(let i=0;i<bars;i++){ h=Math.imul(h^i,16777619)>>>0; const f=.18+((h%1000)/1000)*.82, bh=gridH*f; x.fillStyle=look.acc[i%look.acc.length]; x.beginPath(); x.roundRect?x.roundRect(pad+i*(bw+14),gridTop+(gridH-bh)/2,bw,bh,bw*.4):x.rect(pad+i*(bw+14),gridTop+(gridH-bh)/2,bw,bh); x.fill(); } }
  const rows=Math.max(lanes.length,1), gap=14, cw=(gridW-gap*(n-1))/n, ch=Math.min(cw*1.05,(gridH-gap*(rows-1))/rows);
  const top=gridTop+(gridH-(ch*rows+gap*(rows-1)))/2;
  for(let r=0;r<(lanes.length?rows:0);r++){ const id=lanes[r], a=id?m.pattern[id]:[]; for(let i=0;i<n;i++){
    const on=a&&a[i]; x.fillStyle=on?look.acc[r%look.acc.length]:look.dim;
    const px=pad+i*(cw+gap), py=top+r*(ch+gap), rad=Math.min(cw,ch)*.26;
    x.beginPath();x.roundRect?x.roundRect(px,py,cw,ch,rad):x.rect(px,py,cw,ch);x.fill();
    if(on&&on<0){ x.fillStyle=look.bg; x.globalAlpha=.45; x.fillRect(px,py,cw,ch); x.globalAlpha=1; } } }
  /* mark and caption */
  x.fillStyle=look.name==="Orange"?look.fg:"#F26522"; x.font="800 54px Inter,system-ui,sans-serif"; x.textBaseline="alphabetic"; x.fillText("PENNIO.",pad,pad+30);
  x.fillStyle=look.fg;x.globalAlpha=.7;x.font="500 34px Inter,system-ui,sans-serif";
  const cap=[m.bpm?m.bpm+" BPM":"",m.keyName||""].filter(Boolean).join("  ·  "); const cw2=x.measureText(cap).width; x.fillText(cap,S-pad-cw2,pad+30);x.globalAlpha=1;
  /* title and artist */
  x.fillStyle=look.fg; let size=118; x.font="800 "+size+"px Inter,system-ui,sans-serif";
  let tl=wrap(x,m.title,S-pad*2,2); while(size>64&&tl.some(t=>x.measureText(t).width>S-pad*2)){ size-=6; x.font="800 "+size+"px Inter,system-ui,sans-serif"; tl=wrap(x,m.title,S-pad*2,2); }
  const base=S-pad-(m.artist?72:0)-(tl.length-1)*size*1.08;
  tl.forEach((t,i)=>x.fillText(t,pad,base+i*size*1.08));
  if(m.artist){ x.globalAlpha=.8; x.font="600 46px Inter,system-ui,sans-serif"; const al=wrap(x,m.artist,S-pad*2,1)[0]; x.fillText(al,pad,S-pad+4); x.globalAlpha=1; }
  return new Promise(r=>c.toBlob(b=>r(b),"image/jpeg",.9));
}
async function cover(m){
  if(upload) return upload;
  const sig=JSON.stringify([m.title,m.artist,m.bpm,m.keyName,m.steps,variant,m.laneIds.map(id=>m.pattern[id]&&m.pattern[id].join(""))]);
  if(cache.key===sig&&cache.blob) return cache.blob;
  const blob=await drawCover(m,LOOKS[variant%LOOKS.length]); cache={key:sig,blob}; return blob;
}

/* ---------- metadata ---------- */
const slug=s=>String(s||"").normalize("NFKD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"").toLowerCase();
function meta(src){
  const p=provider?provider(src):{}, saved=store.get();
  const title=(titleOverride||p.title||"Untitled").trim()||"Untitled";
  const artist=(saved.artist||p.artist||"").trim();
  const extra=(saved.extra||"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean).slice(0,8);
  const date=new Date().toISOString().slice(0,10);
  const lines=[];
  if(artist) lines.push("Artist: "+artist);
  if(p.instruments&&p.instruments.length) lines.push("Instruments: "+p.instruments.join(", "));
  if(p.voice) lines.push("Includes a recorded voice");
  if(p.bpm) lines.push(p.bpm+" BPM"+(p.keyName?", "+p.keyName:""));
  extra.forEach(e=>lines.push(e));
  lines.push("Made with PENNIO Studio, pennio.agency/studio");
  lines.push("Exported "+date);
  return Object.assign({},p,{title,artist,extra,date,year:date.slice(0,4),credits:lines.join("\n")});
}

/* ---------- ID3v2.3 ---------- */
const u16=s=>{ const b=new Uint8Array(2+s.length*2); b[0]=0xFF;b[1]=0xFE; for(let i=0;i<s.length;i++){ const c=s.charCodeAt(i); b[2+i*2]=c&255; b[3+i*2]=c>>8; } return b; };
const cat=a=>{ const n=a.reduce((t,x)=>t+x.length,0),o=new Uint8Array(n);let k=0;for(const x of a){o.set(x,k);k+=x.length;}return o; };
const frame=(id,body)=>{ const f=new Uint8Array(10+body.length); for(let i=0;i<4;i++) f[i]=id.charCodeAt(i); const n=body.length; f[4]=(n>>>24)&255;f[5]=(n>>>16)&255;f[6]=(n>>>8)&255;f[7]=n&255; f.set(body,10); return f; };
const textF=(id,s)=>frame(id,cat([new Uint8Array([1]),u16(String(s)),new Uint8Array([0,0])]));
const commF=(s)=>frame("COMM",cat([new Uint8Array([1]),enc.encode("eng"),new Uint8Array([0xFF,0xFE,0,0]),u16(s)]));
const apicF=(jpeg)=>frame("APIC",cat([new Uint8Array([0]),enc.encode("image/jpeg"),new Uint8Array([0,3,0]),jpeg]));
function id3(m,jpeg){
  const fr=[textF("TIT2",m.title),textF("TALB",m.title),textF("TYER",m.year),textF("TENC","PENNIO Studio"),textF("TPUB","PENNIO Studio"),commF(m.credits)];
  if(m.artist){ fr.push(textF("TPE1",m.artist),textF("TPE2",m.artist),textF("TCOM",m.artist)); }
  if(jpeg) fr.push(apicF(jpeg));
  const body=cat(fr),n=body.length;
  return cat([new Uint8Array([73,68,51,3,0,0,(n>>>21)&127,(n>>>14)&127,(n>>>7)&127,n&127]),body]);
}

/* ---------- WAV: INFO list and an id3 chunk after the audio ---------- */
function chunk(id,data){ const pad=data.length&1, c=new Uint8Array(8+data.length+pad); for(let i=0;i<4;i++) c[i]=id.charCodeAt(i); new DataView(c.buffer).setUint32(4,data.length,true); c.set(data,8); return c; }
const zstr=s=>{ const b=enc.encode(String(s)); const o=new Uint8Array(b.length+1); o.set(b); return o; };
function wavWith(bytes,m,jpeg){
  const info=[["INAM",m.title],["IART",m.artist],["ICMT",m.credits.replace(/\n/g," | ")],["ICRD",m.date],["ISFT","PENNIO Studio"]].filter(p=>p[1]).map(p=>chunk(p[0],zstr(p[1])));
  const list=chunk("LIST",cat([enc.encode("INFO"),...info]));
  const tag=chunk("id3 ",id3(m,jpeg));
  const out=cat([bytes,list,tag]); new DataView(out.buffer).setUint32(4,out.length-8,true); return out;
}

/* ---------- read back what is inside a file ---------- */
function inspect(bytes,kind){
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let tagBytes=null;
  if(kind==="mp3"){ if(bytes[0]===73&&bytes[1]===68&&bytes[2]===51){ const n=(bytes[6]<<21)|(bytes[7]<<14)|(bytes[8]<<7)|bytes[9]; tagBytes=bytes.subarray(10,10+n); } }
  else{ let p=12; while(p+8<=bytes.length){ const id=String.fromCharCode(bytes[p],bytes[p+1],bytes[p+2],bytes[p+3]),sz=dv.getUint32(p+4,true); if(id==="id3 "){ tagBytes=bytes.subarray(p+8+10,p+8+sz); break; } p+=8+sz+(sz&1); } }
  const out={title:false,artist:false,credits:false,cover:0};
  if(!tagBytes) return out;
  let p=0; while(p+10<=tagBytes.length){ const id=String.fromCharCode(tagBytes[p],tagBytes[p+1],tagBytes[p+2],tagBytes[p+3]); if(!/^[A-Z0-9]{4}$/.test(id)) break;
    const n=(tagBytes[p+4]*16777216)+(tagBytes[p+5]<<16)+(tagBytes[p+6]<<8)+tagBytes[p+7];
    if(id==="TIT2") out.title=n>4; if(id==="TPE1") out.artist=n>4; if(id==="COMM") out.credits=n>12; if(id==="APIC") out.cover=n;
    p+=10+n; }
  return out;
}

/* ---------- public ---------- */
async function tag(blob,kind,src){
  const m=meta(src), img=await cover(m), jpeg=new Uint8Array(await img.arrayBuffer());
  const audio=new Uint8Array(await blob.arrayBuffer());
  let out;
  if(kind==="mp3"){ /* drop any tag already at the start, then write ours */ let a=audio; if(a[0]===73&&a[1]===68&&a[2]===51){ const n=(a[6]<<21)|(a[7]<<14)|(a[8]<<7)|a[9]; a=a.subarray(10+n); } out=cat([id3(m,jpeg),a]); }
  else out=wavWith(audio,m,jpeg);
  const check=inspect(out,kind), ok=check.title&&check.credits&&check.cover>1000&&(!m.artist||check.artist);
  return {blob:new Blob([out],{type:kind==="mp3"?"audio/mpeg":"audio/wav"}),meta:m,coverBlob:img,check:Object.assign({ok},check),name:(slug(m.title)||"pennio-studio")+(m.artist?"-"+slug(m.artist):"")+"."+kind};
}
window.PennioCredits={
  tag, meta, cover:async src=>cover(meta(src)), inspect, slug,
  provide(fn){ provider=fn; },
  setTitle(v){ titleOverride=String(v||""); cache={key:"",blob:null}; },
  get saved(){ return store.get(); },
  save(o){ store.set(Object.assign(store.get(),o)); cache={key:"",blob:null}; },
  nextLook(){ upload=null; variant=(variant+1)%LOOKS.length; cache={key:"",blob:null}; return LOOKS[variant].name; },
  async useImage(file){ /* your own image, squared and resized to 1400 px, always written as JPEG */
    const bmp=await createImageBitmap(file), S=1400, c=document.createElement("canvas"); c.width=c.height=S; const x=c.getContext("2d");
    const s=Math.min(bmp.width,bmp.height); x.drawImage(bmp,(bmp.width-s)/2,(bmp.height-s)/2,s,s,0,0,S,S);
    upload=await new Promise(r=>c.toBlob(r,"image/jpeg",.9)); return upload; },
  clearImage(){ upload=null; },
  get hasUpload(){ return !!upload; }
};
})();
