(function(){
"use strict";
const $=id=>document.getElementById(id);
const state={tracks:[],selected:null,ctx:null,sources:[],playing:false,startTime:0,offset:0,timer:0,recorder:null,recordStream:null,recordChunks:[],effects:{eq:false,compressor:false,reverb:false,echo:false},undo:[]};
const status=(s)=>{const el=$("dawStatus");if(el)el.textContent=s;};
const duration=()=>state.tracks.reduce((m,t)=>Math.max(m,(t.timeline||0)+t.end-t.start),0);
const fmt=n=>{n=Math.max(0,n||0);return String(Math.floor(n/60)).padStart(2,"0")+":"+String(Math.floor(n%60)).padStart(2,"0")+"."+Math.floor(n%1*10)};
function snapshot(){state.undo.push({tracks:state.tracks.map(t=>({...t})),selected:state.selected});if(state.undo.length>20)state.undo.shift();$("dawUndo").disabled=false;}
function context(){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw Error("Web Audio is not supported in this browser.");if(!state.ctx)state.ctx=new C();if(state.ctx.state==="suspended")state.ctx.resume();return state.ctx;}
function drawWave(track,canvas){const c=canvas.getContext("2d"),w=canvas.width= Math.max(320,canvas.clientWidth*2),h=canvas.height=180;c.clearRect(0,0,w,h);const data=track.buffer.getChannelData(0),step=Math.max(1,Math.floor(data.length/w)),mid=h/2;c.strokeStyle=track.id===state.selected?"#ff8a55":"#b7a79a";c.lineWidth=1.3;c.beginPath();for(let x=0;x<w;x++){let min=1,max=-1;for(let j=0;j<step;j++){const v=data[x*step+j]||0;if(v<min)min=v;if(v>max)max=v;}c.moveTo(x,mid+min*mid*.82);c.lineTo(x,mid+max*mid*.82);}c.stroke();c.strokeStyle="#333";c.beginPath();c.moveTo(0,mid);c.lineTo(w,mid);c.stroke();}
function render(){const host=$("dawTracks");host.replaceChildren();if(!state.tracks.length){const e=document.createElement("div");e.className="daw-empty";e.textContent="Your tracks will appear here. Add vocals, instruments or field recordings.";host.append(e);}state.tracks.forEach(t=>{const row=document.createElement("div");row.className="daw-track";row.dataset.id=t.id;const head=document.createElement("div");head.className="daw-track-head";const name=document.createElement("input");name.className="daw-track-name";name.value=t.name;name.setAttribute("aria-label","Track name");name.onchange=()=>t.name=name.value;const controls=document.createElement("div");controls.className="daw-track-controls";[["M", "mute"],["S","solo"]].forEach(([label,key])=>{const b=document.createElement("button");b.textContent=label;b.classList.toggle("on",!!t[key]);b.onclick=()=>{t[key]=!t[key];render();};controls.append(b);});const remove=document.createElement("button");remove.textContent="×";remove.title="Remove track";remove.onclick=()=>{snapshot();state.tracks=state.tracks.filter(x=>x.id!==t.id);if(state.selected===t.id)state.selected=state.tracks[0]?.id||null;render();};controls.append(remove);const faders=document.createElement("div");faders.className="daw-track-faders";[["Level", "gain",0,1.5,.01],["Pan","pan",-1,1,.01],["Position","timeline",0,120,.1]].forEach(([label,key,min,max,step])=>{const lab=document.createElement("label");lab.textContent=label;const input=document.createElement("input");input.type="range";input.min=min;input.max=max;input.step=step;input.value=t[key];input.oninput=()=>{t[key]=+input.value;};lab.append(input);faders.append(lab);});head.append(name,controls,faders);const wave=document.createElement("div");wave.className="daw-track-wave";const canvas=document.createElement("canvas");wave.append(canvas);const region=document.createElement("div");region.className="daw-region";wave.append(region);row.append(head,wave);row.style.outline=t.id===state.selected?"1px solid var(--orange)":"none";row.onclick=e=>{if(e.target.closest("button,input"))return;state.selected=t.id;syncTrim();render();};host.append(row);requestAnimationFrame(()=>drawWave(t,canvas));});$("dawExport").disabled=!state.tracks.length;syncTrim();}
function selected(){return state.tracks.find(t=>t.id===state.selected)||null;}
function syncTrim(){const t=selected(),a=$("dawTrimStart"),b=$("dawTrimEnd");[a,b].forEach(x=>x.disabled=!t);if(t){a.max=t.buffer.duration;b.max=t.buffer.duration;a.value=t.start;b.value=t.end;a.step=b.step=".01";}}
function addBuffer(buffer,name){snapshot();const t={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:name||"Audio "+(state.tracks.length+1),buffer,start:0,end:buffer.duration,gain:1,pan:0,timeline:0,mute:false,solo:false};state.tracks.push(t);state.selected=t.id;render();status(t.name+" added · "+fmt(buffer.duration));}
async function importFiles(files){for(const file of Array.from(files||[])){try{const ctx=context(),buf=await ctx.decodeAudioData(await file.arrayBuffer());addBuffer(buf,file.name.replace(/\.[^.]+$/,""));}catch(e){status("Could not read "+file.name+": "+e.message);}}}
function stop(){state.sources.forEach(s=>{try{s.stop();}catch(e){}});state.sources=[];state.playing=false;clearInterval(state.timer);$("dawPlay").textContent="▶ Play";$("dawClock").textContent=fmt(state.offset);document.querySelectorAll(".daw-playhead").forEach(x=>x.remove());}
function chain(source,t,ctx,destination){let node=source,last=source;if(state.effects.eq){const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=75;last.connect(hp);last=hp;const eq=ctx.createBiquadFilter();eq.type="peaking";eq.frequency.value=2800;eq.Q.value=.8;eq.gain.value=1.5;last.connect(eq);last=eq;}if(state.effects.compressor){const c=ctx.createDynamicsCompressor();c.threshold.value=-20;c.ratio.value=3;c.attack.value=.008;c.release.value=.18;last.connect(c);last=c;}if(state.effects.echo){const d=ctx.createDelay(1);d.delayTime.value=.22;const fb=ctx.createGain();fb.gain.value=.18;last.connect(d);d.connect(fb);fb.connect(d);last=d;}if(state.effects.reverb){const d=ctx.createDelay(.5);d.delayTime.value=.045;const g=ctx.createGain();g.gain.value=.12;last.connect(d);d.connect(g);last.connect(g);last=g;}const gain=ctx.createGain();gain.gain.value=t.mute?0:t.gain;last.connect(gain);const pan=ctx.createStereoPanner?ctx.createStereoPanner():null;if(pan){pan.pan.value=t.pan;gain.connect(pan);pan.connect(destination);}else gain.connect(destination);}
function play(){if(!state.tracks.length){status("Import or record audio first.");return;}if(state.playing){state.offset=Math.min(duration(),state.offset+context().currentTime-state.startTime);stop();return;}try{const ctx=context(),solo=state.tracks.some(t=>t.solo),when=ctx.currentTime+.06;state.sources=[];state.tracks.forEach(t=>{if(t.mute||(solo&&!t.solo))return;const src=ctx.createBufferSource();src.buffer=t.buffer;chain(src,t,ctx,ctx.destination);const elapsed=Math.max(0,state.offset-(t.timeline||0)),sourceOffset=t.start+elapsed,remain=t.end-sourceOffset;if(remain<=0)return;const scheduled=when+Math.max(0,(t.timeline||0)-state.offset);src.start(scheduled,sourceOffset,remain);state.sources.push(src);});state.playing=true;state.startTime=ctx.currentTime;const base=state.offset;$("dawPlay").textContent="Ⅱ Pause";state.timer=setInterval(()=>{const now=base+ctx.currentTime-state.startTime;$("dawClock").textContent=fmt(now);if(now>=duration()){state.offset=0;stop();}},80);}catch(e){status(e.message);}}
function wavBlob(buffer){const channels=2,length=buffer.length,rate=buffer.sampleRate,bytes=length*channels*2,ab=new ArrayBuffer(44+bytes),v=new DataView(ab);const str=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};str(0,"RIFF");v.setUint32(4,36+bytes,true);str(8,"WAVE");str(12,"fmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(24,rate,true);v.setUint32(28,rate*channels*2,true);v.setUint16(32,channels*2,true);v.setUint16(34,16,true);str(36,"data");v.setUint32(40,bytes,true);const left=buffer.getChannelData(0),right=buffer.numberOfChannels>1?buffer.getChannelData(1):left;let p=44;for(let i=0;i<length;i++){for(const x of [left[i],right[i]]){const s=Math.max(-1,Math.min(1,x));v.setInt16(p,s<0?s*32768:s*32767,true);p+=2;}}return new Blob([ab],{type:"audio/wav"});}
async function exportMix(){if(!state.tracks.length)return;stop();status("Rendering your mix…");try{const rate=44100,secs=Math.max(.1,duration()),off=new OfflineAudioContext(2,Math.ceil(secs*rate),rate),solo=state.tracks.some(t=>t.solo);state.tracks.forEach(t=>{if(t.mute||(solo&&!t.solo))return;const src=off.createBufferSource();src.buffer=t.buffer;const gain=off.createGain();gain.gain.value=t.gain;src.connect(gain);let node=gain;if(state.effects.eq){const f=off.createBiquadFilter();f.type="highpass";f.frequency.value=75;node.connect(f);node=f;}if(state.effects.compressor){const c=off.createDynamicsCompressor();c.threshold.value=-20;c.ratio.value=3;node.connect(c);node=c;}if(state.effects.echo){const delay=off.createDelay(1),feedback=off.createGain();delay.delayTime.value=.22;feedback.gain.value=.18;node.connect(delay);delay.connect(feedback);feedback.connect(delay);node.connect(delay);const dry=off.createGain();dry.gain.value=.82;node.connect(dry);const wet=off.createGain();wet.gain.value=.28;delay.connect(wet);const sum=off.createGain();dry.connect(sum);wet.connect(sum);node=sum;}if(state.effects.reverb){const early=off.createDelay(.5),tail=off.createDelay(.5),wet=off.createGain();early.delayTime.value=.037;tail.delayTime.value=.071;wet.gain.value=.16;node.connect(early);early.connect(tail);tail.connect(wet);const dry=off.createGain();dry.gain.value=.88;node.connect(dry);const sum=off.createGain();dry.connect(sum);wet.connect(sum);node=sum;}const pan=off.createStereoPanner();pan.pan.value=t.pan;node.connect(pan);pan.connect(off.destination);src.start(t.timeline||0,t.start,t.end-t.start);});const rendered=await off.startRendering(),blob=wavBlob(rendered),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="ayan-mix.wav";a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);status("Mix exported · stereo WAV");}catch(e){status("Export failed: "+e.message);}}
$("dawImport").addEventListener("change",e=>{importFiles(e.target.files);e.target.value="";});
$("dawPlay").onclick=play;$("dawStop").onclick=()=>{state.offset=0;stop();};$("dawExport").onclick=exportMix;
$("dawUndo").onclick=()=>{const s=state.undo.pop();if(!s)return;state.tracks=s.tracks;state.selected=s.selected;$("dawUndo").disabled=!state.undo.length;render();status("Last track change undone.");};
$("dawTrimStart").oninput=e=>{const t=selected();if(!t)return;t.start=Math.min(+e.target.value,t.end-.02);};
$("dawTrimEnd").oninput=e=>{const t=selected();if(!t)return;t.end=Math.max(+e.target.value,t.start+.02);};
$("dawDelete").onclick=()=>{const t=selected();if(!t)return;snapshot();state.tracks=state.tracks.filter(x=>x.id!==t.id);state.selected=state.tracks[0]?.id||null;render();status("Track removed.");};
$("dawNormalize").onclick=()=>{const t=selected();if(!t)return;snapshot();const copy=context().createBuffer(t.buffer.numberOfChannels,t.buffer.length,t.buffer.sampleRate);let peak=0;for(let c=0;c<t.buffer.numberOfChannels;c++){const src=t.buffer.getChannelData(c),dst=copy.getChannelData(c);for(let i=0;i<src.length;i++){dst[i]=src[i];peak=Math.max(peak,Math.abs(src[i]));}}if(peak>0){const factor=.95/peak;for(let c=0;c<copy.numberOfChannels;c++){const d=copy.getChannelData(c);for(let i=0;i<d.length;i++)d[i]*=factor;}}t.buffer=copy;t.end=Math.min(t.end,copy.duration);render();status("Selected track normalized to -0.45 dBFS.");};
document.querySelectorAll("[data-fx]").forEach(b=>b.onclick=()=>{const k=b.dataset.fx;state.effects[k]=!state.effects[k];b.classList.toggle("primary",state.effects[k]);status(k+" "+(state.effects[k]?"on":"off")+" for playback and mix.");});
$("dawMic").onclick=async()=>{if(state.recorder&&state.recorder.state==="recording"){state.recorder.stop();$("dawMic").textContent="Record voice";return;}try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});state.recordStream=stream;state.recordChunks=[];const mime=MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":"";state.recorder=new MediaRecorder(stream,mime?{mimeType:mime}:{});state.recorder.ondataavailable=e=>{if(e.data.size)state.recordChunks.push(e.data);};state.recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const blob=new Blob(state.recordChunks,{type:state.recorder.mimeType||"audio/webm"});try{const buf=await context().decodeAudioData(await blob.arrayBuffer());addBuffer(buf,"Voice take");status("Voice take recorded.");}catch(e){status("Recording could not be decoded on this browser.");}};state.recorder.start();$("dawMic").textContent="■ Stop recording";status("Recording from microphone…");}catch(e){status("Microphone unavailable: "+e.message);}};

const composerStatus=(message)=>{const el=$("dawComposerStatus");if(el)el.textContent=message;};
function estimatePitches(buffer){
 const data=buffer.getChannelData(0),sr=buffer.sampleRate,win=4096,hop=2048,events=[];
 for(let start=0;start+win<data.length;start+=hop){
  let rms=0;for(let i=0;i<win;i+=4)rms+=data[start+i]*data[start+i];rms=Math.sqrt(rms/(win/4));if(rms<.018)continue;
  const minLag=Math.floor(sr/900),maxLag=Math.min(Math.floor(sr/75),win/2);
  let bestLag=0,best=-1;
  for(let lag=minLag;lag<=maxLag;lag+=1){let corr=0,n=0;for(let i=0;i<win-lag;i+=4){corr+=data[start+i]*data[start+i+lag];n++;}corr/=Math.max(1,n);if(corr>best){best=corr;bestLag=lag;}}
  if(!bestLag)continue;
  const hz=sr/bestLag;if(hz<75||hz>900)continue;
  const midi=Math.round(69+12*Math.log2(hz/440));
  const time=start/sr;
  const prev=events[events.length-1];
  if(prev&&prev.midi===midi&&time-prev.time<.35)prev.duration+=hop/sr;
  else events.push({midi,time,duration:hop/sr});
 }
 const merged=[];for(const e of events){const prev=merged[merged.length-1];if(prev&&prev.midi===e.midi&&e.time-prev.time<.22)prev.duration=e.time+e.duration-prev.time;else merged.push({...e});}
 return merged.filter(e=>e.duration>.07);
}
function synthNotes(events,transpose=0){
 const sr=44100,end=Math.max(1,...events.map(e=>e.time+Math.max(.16,e.duration))),buffer=context().createBuffer(1,Math.ceil((end+.4)*sr),sr),out=buffer.getChannelData(0);
 events.forEach(e=>{const hz=440*Math.pow(2,(e.midi+transpose-69)/12),start=Math.floor(e.time*sr),len=Math.max(1,Math.floor(Math.min(1.8,Math.max(.13,e.duration))*sr));for(let i=0;i<len&&start+i<out.length;i++){const t=i/sr,attack=Math.min(1,t/.018),release=Math.min(1,(len-i)/Math.max(1,sr*.09)),env=attack*release;const fundamental=Math.sin(2*Math.PI*hz*t),second=.22*Math.sin(2*Math.PI*hz*2*t),third=.08*Math.sin(2*Math.PI*hz*3*t);out[start+i]+=(fundamental+second+third)*env*.22;}});return buffer;
}
function estimateBeatbox(buffer){
 const data=buffer.getChannelData(0),sr=buffer.sampleRate,frame=Math.floor(sr*.025),hop=Math.floor(sr*.01),hits=[];let previous=0,last=-1;
 for(let start=0;start+frame<data.length;start+=hop){
  let energy=0,low=0,high=0;for(let i=0;i<frame;i+=2){const v=data[start+i];energy+=v*v;if(i>1){const diff=v-data[start+i-1];high+=diff*diff;low+=v*v;}}
  const rms=Math.sqrt(energy/(frame/2));const flux=Math.max(0,rms-previous);previous=rms;
  if(rms<.025||flux<.012||start/sr-last<.095)continue;
  const centroid=high/Math.max(.00001,low);
  const kind=centroid<.16?"kick":centroid>.72?"hat":"snare";
  hits.push({time:start/sr,kind,strength:Math.min(1,rms*4)});last=start/sr;
 }
 return hits;
}
function synthDrums(hits){
 const sr=44100,end=Math.max(1,...hits.map(h=>h.time+.5)),buffer=context().createBuffer(1,Math.ceil((end+.1)*sr),sr),out=buffer.getChannelData(0);
 hits.forEach(hit=>{const start=Math.floor(hit.time*sr),len=Math.floor(sr*(hit.kind==="kick"?.32:hit.kind==="snare"?.22:.09));let phase=0;for(let i=0;i<len&&start+i<out.length;i++){const t=i/sr,p=i/len,env=Math.pow(1-p,hit.kind==="kick"?3:5);let v;if(hit.kind==="kick"){const f=110-65*p;phase+=2*Math.PI*f/sr;v=Math.sin(phase)*env*.8;}else{v=(Math.random()*2-1)*env*(hit.kind==="hat"?.22:.48);if(hit.kind==="snare")v+=Math.sin(2*Math.PI*185*t)*env*.16;}out[start+i]+=v*hit.strength;}});return buffer;
}
async function captureIdea(kind,button){
 if(state.recorder&&state.recorder.state==="recording"){state.recorder.stop();button.textContent=kind==="hum"?"Record melody":"Record beatbox";return;}
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){composerStatus("This browser does not support microphone recording for voice-to-instrument.");return;}
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  state.recordStream=stream;state.recordChunks=[];
  const mime=MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":"";
  const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:{});state.recorder=recorder;
  recorder.ondataavailable=e=>{if(e.data.size)state.recordChunks.push(e.data);};
  recorder.onstop=async()=>{
   stream.getTracks().forEach(t=>t.stop());button.textContent=kind==="hum"?"Record melody":"Record beatbox";
   try{
    const raw=await context().decodeAudioData(await new Blob(state.recordChunks,{type:recorder.mimeType||"audio/webm"}).arrayBuffer());
    if(kind==="hum"){
     composerStatus("Listening for stable pitches…");const notes=estimatePitches(raw);
     if(notes.length<2){composerStatus("I couldn't find enough clear notes. Try humming a little louder, one note at a time, for 5–10 seconds.");return;}
     snapshot();addBuffer(synthNotes(notes),"Hummed melody");
     const interval=+$("dawHarmony").value;if(interval){addBuffer(synthNotes(notes,interval),"Harmony +"+interval+" semitones");}
     composerStatus("Built "+notes.length+" note events"+(interval?" with a harmony layer.":" as a melody.")+" Select the new tracks and press Play.");
    }else{
     composerStatus("Mapping your vocal percussion…");const hits=estimateBeatbox(raw);
     if(hits.length<3){composerStatus("I found too few clear hits. Try a stronger kick, a sharp snare sound and short hi-hats with small gaps.");return;}
     snapshot();addBuffer(synthDrums(hits),"Beatbox drums");
     const counts=hits.reduce((a,h)=>(a[h.kind]=(a[h.kind]||0)+1,a),{});
     composerStatus("Built "+hits.length+" drum hits: "+(counts.kick||0)+" kicks, "+(counts.snare||0)+" snares and "+(counts.hat||0)+" hi-hats. Press Play to hear the pattern.");
    }
   }catch(err){composerStatus("Could not analyse that recording: "+err.message);}
  };
  recorder.start();button.textContent="Stop and create";composerStatus(kind==="hum"?"Recording melody. Hum clearly, changing one note at a time.":"Recording beatbox. Try kick, snare and hi-hat sounds with clear attacks.");
 }catch(err){composerStatus("Microphone unavailable: "+err.message);}
}
$("dawHum").addEventListener("click",()=>captureIdea("hum",$("dawHum")));
$("dawBeatbox").addEventListener("click",()=>captureIdea("beatbox",$("dawBeatbox")));

window.addEventListener("beforeunload",stop);
})();