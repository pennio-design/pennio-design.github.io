(function(){
"use strict";
const $=id=>document.getElementById(id);
const state={tracks:[],selected:null,ctx:null,sources:[],playing:false,startTime:0,offset:0,timer:0,recorder:null,recordStream:null,recordChunks:[],effects:{eq:false,compressor:false,reverb:false,echo:false},undo:[]};
const status=(s)=>{const el=$("dawStatus");if(el)el.textContent=s;};
const duration=()=>state.tracks.reduce((m,t)=>Math.max(m,(t.timeline||0)+t.end-t.start),0);
const fmt=n=>{n=Math.max(0,n||0);return String(Math.floor(n/60)).padStart(2,"0")+":"+String(Math.floor(n%60)).padStart(2,"0")+"."+Math.floor(n%1*10)};
function snapshot(){state.undo.push({tracks:state.tracks.map(t=>({...t})),selected:state.selected});if(state.undo.length>20)state.undo.shift();$("dawUndo").disabled=false;}
function context(){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw Error("Web Audio is not supported in this browser.");if(!state.ctx)state.ctx=new C();if(state.ctx.state==="suspended")state.ctx.resume();return state.ctx;}
function drawWave(track,canvas){const c=canvas.getContext("2d"),w=canvas.width=Math.max(320,canvas.clientWidth*2),h=canvas.height=180,light=document.documentElement.dataset.theme==="light";c.clearRect(0,0,w,h);const data=track.buffer.getChannelData(0),step=Math.max(1,Math.floor(data.length/w)),mid=h/2;c.strokeStyle=track.id===state.selected?(light?"#b94317":"#ff8a55"):(light?"#625b52":"#b7a79a");c.lineWidth=1.5;c.beginPath();for(let x=0;x<w;x++){let min=1,max=-1;for(let j=0;j<step;j++){const v=data[x*step+j]||0;if(v<min)min=v;if(v>max)max=v;}c.moveTo(x,mid+min*mid*.82);c.lineTo(x,mid+max*mid*.82);}c.stroke();c.strokeStyle=light?"#c9c2b8":"#333";c.beginPath();c.moveTo(0,mid);c.lineTo(w,mid);c.stroke();}
function render(){const host=$("dawTracks");host.replaceChildren();if(!state.tracks.length){const e=document.createElement("div");e.className="daw-empty";e.textContent="Your tracks will appear here. Add vocals, instruments or field recordings.";host.append(e);}state.tracks.forEach(t=>{const row=document.createElement("div");row.className="daw-track";row.dataset.id=t.id;const head=document.createElement("div");head.className="daw-track-head";const name=document.createElement("input");name.className="daw-track-name";name.value=t.name;name.setAttribute("aria-label","Track name");name.onchange=()=>t.name=name.value;const controls=document.createElement("div");controls.className="daw-track-controls";[["M", "mute"],["S","solo"]].forEach(([label,key])=>{const b=document.createElement("button");b.textContent=label;b.classList.toggle("on",!!t[key]);b.onclick=()=>{t[key]=!t[key];render();};controls.append(b);});const remove=document.createElement("button");remove.textContent="×";remove.title="Remove track";remove.onclick=()=>{snapshot();state.tracks=state.tracks.filter(x=>x.id!==t.id);if(state.selected===t.id)state.selected=state.tracks[0]?.id||null;render();};controls.append(remove);const faders=document.createElement("div");faders.className="daw-track-faders";[["Level", "gain",0,1.5,.01],["Pan","pan",-1,1,.01],["Position","timeline",0,120,.1]].forEach(([label,key,min,max,step])=>{const lab=document.createElement("label");lab.textContent=label;const input=document.createElement("input");input.type="range";input.min=min;input.max=max;input.step=step;input.value=t[key];input.oninput=()=>{t[key]=+input.value;};lab.append(input);faders.append(lab);});head.append(name,controls,faders);const wave=document.createElement("div");wave.className="daw-track-wave";const canvas=document.createElement("canvas");wave.append(canvas);const region=document.createElement("div");region.className="daw-region";wave.append(region);const range=document.createElement("div");range.className="daw-range-select";wave.append(range);bindWaveSelection(wave,t);row.append(head,wave);row.style.outline=t.id===state.selected?"1px solid var(--orange)":"none";row.onclick=e=>{if(e.target.closest("button,input"))return;state.selected=t.id;syncTrim();render();};host.append(row);requestAnimationFrame(()=>drawWave(t,canvas));});syncRangeUI();$("dawExport").disabled=!state.tracks.length;$("dawSendStudio").disabled=!state.tracks.length;syncTrim();}
function selected(){return state.tracks.find(t=>t.id===state.selected)||null;}
function syncTrim(){const t=selected(),a=$("dawTrimStart"),b=$("dawTrimEnd");[a,b].forEach(x=>x.disabled=!t);if(t){a.max=t.buffer.duration;b.max=t.buffer.duration;a.value=t.start;b.value=t.end;a.step=b.step=".01";}}
function addBuffer(buffer,name){snapshot();const t={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:name||"Audio "+(state.tracks.length+1),buffer,start:0,end:buffer.duration,gain:1,pan:0,timeline:0,mute:false,solo:false};state.tracks.push(t);state.selected=t.id;render();status(t.name+" added · "+fmt(buffer.duration));}
async function importFiles(files){for(const file of Array.from(files||[])){try{const ctx=context(),buf=await ctx.decodeAudioData(await file.arrayBuffer());addBuffer(buf,file.name.replace(/\.[^.]+$/,""));}catch(e){status("Could not read "+file.name+": "+e.message);}}}
function stop(){state.sources.forEach(s=>{try{s.stop();}catch(e){}});state.sources=[];state.playing=false;clearInterval(state.timer);$("dawPlay").textContent="▶ Play";$("dawClock").textContent=fmt(state.offset);document.querySelectorAll(".daw-playhead").forEach(x=>x.remove());}
function chain(source,t,ctx,destination){let node=source,last=source;if(state.effects.eq){const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=75;last.connect(hp);last=hp;const eq=ctx.createBiquadFilter();eq.type="peaking";eq.frequency.value=2800;eq.Q.value=.8;eq.gain.value=1.5;last.connect(eq);last=eq;}if(state.effects.compressor){const c=ctx.createDynamicsCompressor();c.threshold.value=-20;c.ratio.value=3;c.attack.value=.008;c.release.value=.18;last.connect(c);last=c;}if(state.effects.echo){const d=ctx.createDelay(1);d.delayTime.value=.22;const fb=ctx.createGain();fb.gain.value=.18;last.connect(d);d.connect(fb);fb.connect(d);last=d;}if(state.effects.reverb){const d=ctx.createDelay(.5);d.delayTime.value=.045;const g=ctx.createGain();g.gain.value=.12;last.connect(d);d.connect(g);last.connect(g);last=g;}const gain=ctx.createGain();gain.gain.value=t.mute?0:t.gain;last.connect(gain);const pan=ctx.createStereoPanner?ctx.createStereoPanner():null;if(pan){pan.pan.value=t.pan;gain.connect(pan);pan.connect(destination);}else gain.connect(destination);}
function play(){if(!state.tracks.length){status("Import or record audio first.");return;}if(state.playing){state.offset=Math.min(duration(),state.offset+context().currentTime-state.startTime);stop();return;}try{const ctx=context(),solo=state.tracks.some(t=>t.solo),when=ctx.currentTime+.06;state.sources=[];state.tracks.forEach(t=>{if(t.mute||(solo&&!t.solo))return;const src=ctx.createBufferSource();src.buffer=t.buffer;chain(src,t,ctx,ctx.destination);const elapsed=Math.max(0,state.offset-(t.timeline||0)),sourceOffset=t.start+elapsed,remain=t.end-sourceOffset;if(remain<=0)return;const scheduled=when+Math.max(0,(t.timeline||0)-state.offset);src.start(scheduled,sourceOffset,remain);state.sources.push(src);});state.playing=true;state.startTime=ctx.currentTime;const base=state.offset;$("dawPlay").textContent="Ⅱ Pause";state.timer=setInterval(()=>{const now=base+ctx.currentTime-state.startTime;$("dawClock").textContent=fmt(now);if(now>=duration()){state.offset=0;stop();}},80);}catch(e){status(e.message);}}
function wavBlob(buffer){const channels=2,length=buffer.length,rate=buffer.sampleRate,bytes=length*channels*2,ab=new ArrayBuffer(44+bytes),v=new DataView(ab);const str=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};str(0,"RIFF");v.setUint32(4,36+bytes,true);str(8,"WAVE");str(12,"fmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(24,rate,true);v.setUint32(28,rate*channels*2,true);v.setUint16(32,channels*2,true);v.setUint16(34,16,true);str(36,"data");v.setUint32(40,bytes,true);const left=buffer.getChannelData(0),right=buffer.numberOfChannels>1?buffer.getChannelData(1):left;let p=44;for(let i=0;i<length;i++){for(const x of [left[i],right[i]]){const s=Math.max(-1,Math.min(1,x));v.setInt16(p,s<0?s*32768:s*32767,true);p+=2;}}return new Blob([ab],{type:"audio/wav"});}
async function exportMix(sendToStudio=false){if(!state.tracks.length)return;stop();status("Rendering your mix…");try{const rate=44100,secs=Math.max(.1,duration()),off=new OfflineAudioContext(2,Math.ceil(secs*rate),rate),solo=state.tracks.some(t=>t.solo);state.tracks.forEach(t=>{if(t.mute||(solo&&!t.solo))return;const src=off.createBufferSource();src.buffer=t.buffer;const gain=off.createGain();gain.gain.value=t.gain;src.connect(gain);let node=gain;if(state.effects.eq){const f=off.createBiquadFilter();f.type="highpass";f.frequency.value=75;node.connect(f);node=f;}if(state.effects.compressor){const c=off.createDynamicsCompressor();c.threshold.value=-20;c.ratio.value=3;node.connect(c);node=c;}if(state.effects.echo){const delay=off.createDelay(1),feedback=off.createGain();delay.delayTime.value=.22;feedback.gain.value=.18;node.connect(delay);delay.connect(feedback);feedback.connect(delay);node.connect(delay);const dry=off.createGain();dry.gain.value=.82;node.connect(dry);const wet=off.createGain();wet.gain.value=.28;delay.connect(wet);const sum=off.createGain();dry.connect(sum);wet.connect(sum);node=sum;}if(state.effects.reverb){const early=off.createDelay(.5),tail=off.createDelay(.5),wet=off.createGain();early.delayTime.value=.037;tail.delayTime.value=.071;wet.gain.value=.16;node.connect(early);early.connect(tail);tail.connect(wet);const dry=off.createGain();dry.gain.value=.88;node.connect(dry);const sum=off.createGain();dry.connect(sum);wet.connect(sum);node=sum;}const pan=off.createStereoPanner();pan.pan.value=t.pan;node.connect(pan);pan.connect(off.destination);src.start(t.timeline||0,t.start,t.end-t.start);});const rendered=await off.startRendering(),blob=wavBlob(rendered);if(sendToStudio){window.dispatchEvent(new CustomEvent("pennio:studio-media",{detail:{blob,name:"Àyàn DAW mix",kind:"audio"}}));status("Stereo WAV sent to the Studio recorder. Choose Film or Àyàn from the shared panel.");}else{const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="ayan-mix.wav";a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);status("Mix exported · stereo WAV");}}catch(e){status("Export failed: "+e.message);}}
$("dawImport").addEventListener("change",e=>{importFiles(e.target.files);e.target.value="";});
window.addEventListener("pennio:recorded-audio",async e=>{const blob=e.detail&&e.detail.blob;if(!blob)return;try{const buffer=await context().decodeAudioData(await blob.arrayBuffer());addBuffer(buffer,e.detail.name||"Studio recording");status("Recording added as a new DAW track.");$("dawRoom").scrollIntoView({behavior:"smooth",block:"start"});}catch(err){status("Could not add recording to Àyàn: "+err.message);}});
$("dawPlay").onclick=play;$("dawStop").onclick=()=>{state.offset=0;stop();};$("dawExport").onclick=()=>exportMix(false);$("dawSendStudio").onclick=()=>exportMix(true);
$("dawUndo").onclick=()=>{const s=state.undo.pop();if(!s)return;state.tracks=s.tracks;state.selected=s.selected;$("dawUndo").disabled=!state.undo.length;render();status("Last track change undone.");};
$("dawTrimStart").oninput=e=>{const t=selected();if(!t)return;t.start=Math.min(+e.target.value,t.end-.02);};
$("dawTrimEnd").oninput=e=>{const t=selected();if(!t)return;t.end=Math.max(+e.target.value,t.start+.02);};
$("dawDelete").onclick=()=>{const t=selected();if(!t)return;snapshot();state.tracks=state.tracks.filter(x=>x.id!==t.id);state.selected=state.tracks[0]?.id||null;render();status("Track removed.");};
$("dawNormalize").onclick=()=>{const t=selected();if(!t)return;snapshot();const copy=context().createBuffer(t.buffer.numberOfChannels,t.buffer.length,t.buffer.sampleRate);let peak=0;for(let c=0;c<t.buffer.numberOfChannels;c++){const src=t.buffer.getChannelData(c),dst=copy.getChannelData(c);for(let i=0;i<src.length;i++){dst[i]=src[i];peak=Math.max(peak,Math.abs(src[i]));}}if(peak>0){const factor=.95/peak;for(let c=0;c<copy.numberOfChannels;c++){const d=copy.getChannelData(c);for(let i=0;i<d.length;i++)d[i]*=factor;}}t.buffer=copy;t.end=Math.min(t.end,copy.duration);render();status("Selected track normalized to -0.45 dBFS.");};
document.querySelectorAll("[data-fx]").forEach(b=>b.onclick=()=>{const k=b.dataset.fx;state.effects[k]=!state.effects[k];b.classList.toggle("primary",state.effects[k]);status(k+" "+(state.effects[k]?"on":"off")+" for playback and mix.");});
$("dawMic").onclick=async()=>{if(state.recorder&&state.recorder.state==="recording"){state.recorder.stop();$("dawMic").textContent="Record voice";return;}try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});state.recordStream=stream;state.recordChunks=[];const mime=MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":"";state.recorder=new MediaRecorder(stream,mime?{mimeType:mime}:{});state.recorder.ondataavailable=e=>{if(e.data.size)state.recordChunks.push(e.data);};state.recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const blob=new Blob(state.recordChunks,{type:state.recorder.mimeType||"audio/webm"});try{const buf=await context().decodeAudioData(await blob.arrayBuffer());addBuffer(buf,"Voice take");status("Voice take recorded.");}catch(e){status("Recording could not be decoded on this browser.");}};state.recorder.start();$("dawMic").textContent="■ Stop recording";status("Recording from microphone…");}catch(e){status("Microphone unavailable: "+e.message);}};
window.addEventListener("beforeunload",stop);

// Timeline selection: drag across a waveform to mark an exact passage.
state.range=null;
const selectionReadout=$("dawSelectionReadout"),clearSelection=$("dawClearSelection"),keepSelection=$("dawKeepSelection"),punchRecord=$("dawPunchRecord"),humBeat=$("dawHumBeat");
function rangeTimes(){const t=selected();if(!t||!state.range)return null;const a=Math.max(t.start,Math.min(state.range.start,state.range.end)),b=Math.min(t.end,Math.max(state.range.start,state.range.end));return b-a>=.08?{track:t,start:a,end:b,duration:b-a,timeline:(t.timeline||0)+a-t.start}:null;}
function syncRangeUI(){
 const r=rangeTimes(),fmt=n=>{n=Math.max(0,n||0);return String(Math.floor(n/60)).padStart(2,"0")+":"+String(Math.floor(n%60)).padStart(2,"0")+"."+Math.floor(n%1*10)};
 if(selectionReadout)selectionReadout.textContent=r?fmt(r.start)+" – "+fmt(r.end)+" · "+fmt(r.duration)+" selected":"Drag across a waveform to select a timeframe.";
 [clearSelection,keepSelection,punchRecord,humBeat].forEach(b=>{if(b)b.disabled=!r;});
 document.querySelectorAll(".daw-range-select").forEach(el=>{const row=el.closest(".daw-track"),t=state.tracks.find(x=>x.id===row?.dataset.id);if(!r||!t||t.id!==r.track.id){el.classList.remove("on");return;}el.style.left=(r.start/t.buffer.duration*100)+"%";el.style.width=((r.end-r.start)/t.buffer.duration*100)+"%";el.classList.add("on");});
}
function clearRange(){state.range=null;syncRangeUI();}
function bindWaveSelection(wave,t){
 let down=false,x0=0;
 const point=e=>{const rect=wave.getBoundingClientRect(),pct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));return pct*t.buffer.duration;};
 wave.addEventListener("pointerdown",e=>{if(e.target.closest("button,input"))return;down=true;x0=point(e);state.selected=t.id;state.range={start:x0,end:x0+.1};wave.setPointerCapture?.(e.pointerId);syncRangeUI();});
 wave.addEventListener("pointermove",e=>{if(!down)return;const x=point(e);state.range={start:Math.min(x0,x),end:Math.max(x0,x)};syncRangeUI();});
 const finish=()=>{if(!down)return;down=false;const r=rangeTimes();if(!r)clearRange();else syncRangeUI();};
 wave.addEventListener("pointerup",finish);wave.addEventListener("pointercancel",finish);
}
clearSelection?.addEventListener("click",clearRange);
const playSelectionButton=$("dawPlaySelection");
playSelectionButton?.addEventListener("click",()=>{
 const r=rangeTimes();if(!r)return;
 try{
  stop();const ctx=context(),src=ctx.createBufferSource();src.buffer=r.track.buffer;
  chain(src,r.track,ctx,ctx.destination);
  state.sources=[src];state.playing=true;state.offset=r.timeline;state.startTime=ctx.currentTime;
  src.start(ctx.currentTime+.025,r.start,r.duration);
  $("dawPlay").textContent="Ⅱ Pause";status("Auditioning selected passage · "+r.track.name);
  state.timer=setInterval(()=>{
   const elapsed=ctx.currentTime-state.startTime;
   $("dawClock").textContent=fmt(r.timeline+Math.min(elapsed,r.duration));
   if(elapsed>=r.duration){state.offset=r.timeline+r.duration;stop();}
  },50);
 }catch(e){status("Could not play selection: "+e.message);}
});
keepSelection?.addEventListener("click",()=>{
 const r=rangeTimes();if(!r)return;const t=r.track;snapshot();const from=Math.floor(r.start*t.buffer.sampleRate),to=Math.max(from+1,Math.floor(r.end*t.buffer.sampleRate)),frames=to-from;
 const cropped=context().createBuffer(t.buffer.numberOfChannels,frames,t.buffer.sampleRate);
 for(let c=0;c<t.buffer.numberOfChannels;c++)cropped.copyToChannel(t.buffer.getChannelData(c).slice(from,to),c);
 t.timeline=r.timeline;t.buffer=cropped;t.start=0;t.end=cropped.duration;clearRange();render();status("Selection isolated as the active clip. Undo restores the full track.");
});
async function captureSelection(kind){
 const r=rangeTimes();if(!r)return;
 if(state.recorder&&state.recorder.state==="recording"){status("A recording is already in progress. Stop it before starting another.");return;}
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status("Microphone recording needs a supported HTTPS browser. Open Studio in Chrome and allow microphone access.");return;}
 let mic=null,src=null,stopTimer=0,finished=false;
 try{
  status("Requesting microphone access…");
  mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  const ctx=context();if(ctx.state!=="running")await ctx.resume();
  const parts=[],supported=["audio/webm;codecs=opus","audio/mp4","audio/webm"].find(x=>MediaRecorder.isTypeSupported(x));
  const mr=new MediaRecorder(mic,supported?{mimeType:supported}:undefined);state.recorder=mr;
  src=ctx.createBufferSource();src.buffer=r.track.buffer;
  const gain=ctx.createGain();gain.gain.value=r.track.mute?0:Math.max(0,Math.min(1.5,r.track.gain||1));src.connect(gain);gain.connect(ctx.destination);
  const cleanup=()=>{if(finished)return;finished=true;clearTimeout(stopTimer);mic?.getTracks().forEach(x=>x.stop());try{src?.stop();}catch(_){}};
  mr.ondataavailable=e=>{if(e.data&&e.data.size)parts.push(e.data);};
  mr.onerror=()=>{cleanup();status("Recording failed. Check microphone permission, then try again.");};
  mr.onstart=()=>{
   status(kind==="hum"?"Recording started. Hum along with the selected passage.":"Recording started. Speak or sing over the selected passage.");
   const when=ctx.currentTime+.12;
   try{src.start(when,r.start,r.duration);}catch(e){try{mr.stop();}catch(_){}status("Could not play the selected passage: "+e.message);return;}
   stopTimer=setTimeout(()=>{if(mr.state==="recording")mr.stop();},Math.max(350,r.duration*1000+180));
  };
  mr.onstop=async()=>{
   cleanup();state.recorder=null;
   const take=new Blob(parts,{type:mr.mimeType||"audio/webm"});
   if(!take.size){status("No audio was captured. Check microphone permission and try again.");return;}
   if(kind==="hum"){
    window.dispatchEvent(new CustomEvent("pennio:recorded-audio",{detail:{blob:take,name:"Hum over selection"}}));
    status("Hum sent to Àyàn and Ìlù. Select “Translate my voice to drum” to create the talking-drum line.");
   }else{
    try{const buffer=await ctx.decodeAudioData(await take.arrayBuffer());snapshot();const track={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:"Re-recorded passage",buffer,start:0,end:buffer.duration,gain:1,pan:0,timeline:r.timeline,mute:false,solo:false};state.tracks.push(track);state.selected=track.id;render();status("New take placed at the selected timeline position. Original track preserved.");}
    catch(e){status("The take was captured, but this browser could not decode it. Try Chrome or import the saved recording.");}
   }
  };
  mr.start(100);
  status("Starting microphone and selected passage…");
 }catch(e){
  mic?.getTracks().forEach(x=>x.stop());state.recorder=null;
  status("Could not start recording: "+(e.name==="NotAllowedError"?"Allow microphone access in your browser settings.":e.message||"Check microphone permission and try again."));
 }
}
punchRecord?.addEventListener("click",()=>captureSelection("punch"));
humBeat?.addEventListener("click",()=>captureSelection("hum"));
})();