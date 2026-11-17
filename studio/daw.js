(function(){
"use strict";
const $=id=>document.getElementById(id);
if(!document.getElementById("dawSessionStyle")){const style=document.createElement("style");style.id="dawSessionStyle";style.textContent="#dawRoom.session-loading{opacity:.72;pointer-events:none;}";document.head.append(style);}
if(!document.getElementById("dawTimelineStyle")){const style=document.createElement("style");style.id="dawTimelineStyle";style.textContent=`
.daw-timeline-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;margin:0 0 10px;border:1px solid var(--line2,#343434);border-radius:10px;background:var(--surface,#171717);font-size:11px}
.daw-timeline-switch{display:flex;gap:3px;padding:3px;border:1px solid var(--line2,#343434);border-radius:8px}
.daw-timeline-switch button{padding:6px 11px;border-radius:6px;color:var(--mute,#999);font:inherit}
.daw-timeline-switch button.on{background:var(--text,#fff);color:var(--black,#090909);font-weight:700}
.daw-tempo-control,.daw-snap-control{display:flex;align-items:center;gap:6px;color:var(--mute,#999)}
.daw-tempo-control input{width:58px;padding:6px;border:1px solid var(--line2,#343434);border-radius:6px;background:var(--black,#090909);color:var(--text,#fff);font:inherit}
.daw-snap-control input{accent-color:var(--orange,#ff6b35)}
.daw-timeline-hint{margin-left:auto;color:var(--mute,#999)}
.daw-track-wave.daw-bars-view{background-image:linear-gradient(to right,transparent calc(100% - 1px),rgba(255,255,255,.12) 100%),linear-gradient(to right,transparent calc(100% - 1px),rgba(255,255,255,.055) 100%);background-size:var(--daw-bar-width,240px) 100%,var(--daw-beat-width,60px) 100%;background-repeat:repeat-x}
.daw-track-wave.daw-bars-view canvas{position:relative;z-index:1}
.daw-track-wave.daw-waves-view{background-image:none}
.daw-timeline-controls button:focus-visible,.daw-timeline-controls input:focus-visible{outline:2px solid var(--orange,#ff6b35);outline-offset:2px}
@media(max-width:560px){.daw-timeline-controls{gap:7px}.daw-timeline-hint{width:100%;margin:0}}
`;document.head.append(style);}
const state={tracks:[],selected:null,ctx:null,sources:[],dspChains:[],playGeneration:0,playStarting:false,playing:false,startTime:0,offset:0,timer:0,recorder:null,recordStream:null,recordChunks:[],effects:{eq:false,compressor:false,reverb:false,echo:false},undo:[],recordingDone:null,resolveRecordingDone:null,recordingKind:null,projectSwitching:false,lastSessionOperation:null,outputGain:null,plan:"",externalIsolation:null,timelineView:"waves",tempo:120,barSnap:true};
const status=(s)=>{const el=$("dawStatus");if(el)el.textContent=s;};
function trackAudible(t){
 const isolation=window.PennioLaneIsolation?.active;
 if(isolation)return isolation.source==="daw"&&isolation.id===t.id&&!!isolation.states?.[t.id];
 const solo=state.tracks.some(x=>x.solo);
 return !t.mute&&(!solo||t.solo);
}
function paintTrackIsolation(){
 const isolation=window.PennioLaneIsolation?.active;
 document.querySelectorAll(".daw-track").forEach(row=>{
  const id=row.dataset.id,selected=isolation?.source==="daw"&&isolation.id===id;
  const muted=!!isolation&&!selected;
  row.classList.toggle("isolation-active",selected);row.classList.toggle("isolation-muted",muted);
  const hold=row.querySelector(".daw-hold");if(hold){hold.classList.toggle("on",selected);hold.setAttribute("aria-pressed",String(selected));}
  row.querySelectorAll(".daw-track-mute,.daw-track-solo").forEach(button=>button.disabled=!!isolation);
 });
}
function syncTrackGains(){
 state.sources.forEach(src=>{const t=src.__pennioTrack,g=src.__pennioTrackGain;if(!t||!g||!state.ctx)return;const p=g.gain,now=state.ctx.currentTime;p.cancelScheduledValues(now);p.setValueAtTime(p.value,now);p.linearRampToValueAtTime(trackAudible(t)?t.gain:0,now+.008);});
 paintTrackIsolation();
}
function bindDawHold(button,track){
 const begin=(token)=>{const solo=state.tracks.some(t=>t.solo),states=Object.fromEntries(state.tracks.map(t=>[t.id,!t.mute&&(!solo||t.solo)]));window.PennioLaneIsolation?.begin("daw",track.id,token,states);};
 const end=token=>window.PennioLaneIsolation?.end(token);
 button.addEventListener("pointerdown",e=>{if(e.button!==undefined&&e.button!==0)return;e.preventDefault();e.stopPropagation();try{button.setPointerCapture(e.pointerId);}catch(_){}begin(e.pointerId);});
 button.addEventListener("pointerup",e=>end(e.pointerId));button.addEventListener("pointercancel",e=>end(e.pointerId));button.addEventListener("lostpointercapture",e=>end(e.pointerId));
 button.addEventListener("keydown",e=>{if((e.key===" "||e.key==="Enter")&&!e.repeat){e.preventDefault();begin("key:"+track.id);}});
 button.addEventListener("keyup",e=>{if(e.key===" "||e.key==="Enter"){e.preventDefault();end("key:"+track.id);}});
 button.addEventListener("click",e=>e.preventDefault());
}
window.PennioLaneIsolation?.subscribe(()=>syncTrackGains());
addEventListener("pointerup",e=>window.PennioLaneIsolation?.end(e.pointerId));
addEventListener("pointercancel",e=>window.PennioLaneIsolation?.end(e.pointerId));
const duration=()=>state.tracks.reduce((m,t)=>Math.max(m,(t.timeline||0)+t.end-t.start),0);
const fmt=n=>{n=Math.max(0,n||0);return String(Math.floor(n/60)).padStart(2,"0")+":"+String(Math.floor(n%60)).padStart(2,"0")+"."+Math.floor(n%1*10)};

const SESSION_DEFAULT="__studio_default__";
let sessionSaveTimer=0,sessionRestoring=false,sessionSwitchQueue=Promise.resolve(),sessionProjectOverride=SESSION_DEFAULT;
const sessionBlobCache=new Map();
function sessionProjectId(){return sessionProjectOverride||SESSION_DEFAULT;}
function queueSessionSave(){
 if(sessionRestoring||!window.PennioWorkspace?.saveSession)return;
 clearTimeout(sessionSaveTimer);
 sessionSaveTimer=setTimeout(()=>saveSessionNow().catch(e=>status("Session save failed: "+e.message)),900);
}
function trackWavBlob(buffer){
 const channels=buffer.numberOfChannels,length=buffer.length,rate=buffer.sampleRate,bytes=length*channels*2;
 const ab=new ArrayBuffer(44+bytes),v=new DataView(ab),write=(o,str)=>{for(let i=0;i<str.length;i++)v.setUint8(o+i,str.charCodeAt(i));};
 write(0,"RIFF");v.setUint32(4,36+bytes,true);write(8,"WAVE");write(12,"fmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(24,rate,true);v.setUint32(28,rate*channels*2,true);v.setUint16(32,channels*2,true);v.setUint16(34,16,true);write(36,"data");v.setUint32(40,bytes,true);
 const data=Array.from({length:channels},(_,c)=>buffer.getChannelData(c));let p=44;
 for(let i=0;i<length;i++)for(let c=0;c<channels;c++){const x=Math.max(-1,Math.min(1,data[c][i]));v.setInt16(p,x<0?x*32768:x*32767,true);p+=2;}
 return new Blob([ab],{type:"audio/wav"});
}
async function saveSessionNow(projectOverride){
 const projectId=projectOverride||sessionProjectId();
 if(!window.PennioWorkspace?.saveSession||sessionRestoring)return false;
 const tracks=[],audio=[];
 const savedOffset=state.playing&&state.ctx?Math.min(duration(),state.offset+state.ctx.currentTime-state.startTime):(state.offset||0);
 for(const t of state.tracks){
  const key=projectId+":"+t.id;
  let cached=sessionBlobCache.get(key),changed=!cached||cached.buffer!==t.buffer;
  if(changed){cached={buffer:t.buffer,blob:trackWavBlob(t.buffer),persisted:false};sessionBlobCache.set(key,cached);}
  tracks.push({id:t.id,name:t.name,start:t.start,end:t.end,gain:t.gain,pan:t.pan,timeline:t.timeline,mute:!!t.mute,solo:!!t.solo,bypassFx:!!t.bypassFx,dsp:{...(t.dsp||window.StudioCleanDefaults)},audioKey:key});
  audio.push({id:key,blob:cached.blob,force:changed||!cached.persisted});
 }
 await window.PennioWorkspace.saveSession(projectId,{version:1,tracks,selected:state.selected,effects:{...state.effects},offset:savedOffset,range:state.range?{...state.range}:null,plan:state.plan||"",timelineView:state.timelineView,tempo:state.tempo,barSnap:state.barSnap,audio});
 for(const t of state.tracks){const cached=sessionBlobCache.get(projectId+":"+t.id);if(cached)cached.persisted=true;}
 return true;
}
async function loadSessionFor(projectId){
 if(!window.PennioWorkspace?.loadSession)return;
 sessionProjectOverride=projectId||SESSION_DEFAULT;
 sessionRestoring=true;clearTimeout(sessionSaveTimer);const host=document.getElementById("dawRoom");host?.classList.add("session-loading");status("Restoring project session…");stop();
 try{
  const rec=await window.PennioWorkspace.loadSession(projectId||SESSION_DEFAULT);
  state.tracks=[];state.selected=null;state.effects={eq:false,compressor:false,reverb:false,echo:false};state.offset=0;state.range=null;state.plan="";state.timelineView=rec?.timelineView==="bars"?"bars":"waves";state.tempo=Math.max(40,Math.min(240,Number(rec?.tempo)||120));state.barSnap=rec?.barSnap!==false;$("dawPlan").value="";sessionBlobCache.clear();
  if(rec&&Array.isArray(rec.tracks)){
   const stored=new Map((rec.audio||[]).map(x=>[x.id,x.blob]));
   for(const meta of rec.tracks){
    const blob=stored.get(meta.audioKey);if(!blob)continue;
    try{
     const C=window.AudioContext||window.webkitAudioContext;if(!C)throw Error("Web Audio is unavailable.");if(!state.ctx)state.ctx=new C();const buffer=await state.ctx.decodeAudioData(await blob.arrayBuffer());
     const start=Math.max(0,Math.min(buffer.duration,Number(meta.start)||0));
     const end=Math.max(start,Math.min(buffer.duration,Number.isFinite(+meta.end)?+meta.end:buffer.duration));
     state.tracks.push({id:meta.id,name:meta.name||"Audio",buffer,start,end,gain:Number.isFinite(+meta.gain)?+meta.gain:1,pan:Number.isFinite(+meta.pan)?+meta.pan:0,timeline:Math.max(0,Number(meta.timeline)||0),mute:!!meta.mute,solo:!!meta.solo,bypassFx:!!meta.bypassFx,dsp:{...window.StudioCleanDefaults,...(meta.dsp||{})}});
     sessionBlobCache.set(meta.audioKey,{buffer,blob,persisted:true});
    }catch(e){console.warn("Could not restore DAW track",meta.name,e);}
   }
   state.selected=state.tracks.some(t=>t.id===rec.selected)?rec.selected:(state.tracks[0]?.id||null);
   Object.assign(state.effects,rec.effects||{});state.offset=Math.min(duration(),Number(rec.offset)||0);state.range=rec.range||null;state.plan=String(rec.plan||"");$("dawPlan").value=state.plan;
  }
  document.querySelectorAll("[data-fx]").forEach(button=>button.classList.toggle("primary",!!state.effects[button.dataset.fx]));
  render();$("dawClock").textContent=fmt(state.offset);status(rec?"Project session restored.":"A new DAW session is ready for this project.");
 }catch(e){status("Could not restore this project session: "+e.message);}
 finally{sessionRestoring=false;document.getElementById("dawRoom")?.classList.remove("session-loading");}
}
async function runInProjectSession(targetProjectId,task){
 const current=sessionProjectId(),target=targetProjectId||current;
 if(target===current)return task(current);
 clearTimeout(sessionSaveTimer);await saveSessionNow(current);await loadSessionFor(target);
 try{await task(target);}
 finally{clearTimeout(sessionSaveTimer);try{await saveSessionNow(target);}finally{await loadSessionFor(current);}}
}
function beginRecordingTask(kind){
 let resolve;state.recordingDone=new Promise(done=>{resolve=done;});state.resolveRecordingDone=resolve;state.recordingKind=kind;
}
function finishRecordingTask(){
 const resolve=state.resolveRecordingDone;state.resolveRecordingDone=null;state.recordingDone=null;state.recordingKind=null;if(resolve)resolve();
}
function queueSessionOperation(targetProjectId,task){
 const job=sessionSwitchQueue.then(()=>runInProjectSession(targetProjectId,task));
 sessionSwitchQueue=job.catch(error=>status("Audio operation failed: "+error.message));state.lastSessionOperation=job;
 return job;
}
async function flushDAWSession(){if(state.recorder&&state.recorder.state==="recording"){try{state.recorder.stop();}catch(e){}}if(state.recordingDone)await state.recordingDone;await sessionSwitchQueue;clearTimeout(sessionSaveTimer);return saveSessionNow();}
window.PennioDAWSession={save:flushDAWSession,flush:flushDAWSession};
window.addEventListener("pennio:workspace-project-open",e=>{
 const detail=e.detail||{},previous=detail.previousProjectId??SESSION_DEFAULT,next=detail.project?.id||SESSION_DEFAULT;
 if(previous===next)return;
 const switchGeneration=(window.__pennioDawSwitchGeneration=(window.__pennioDawSwitchGeneration||0)+1);state.projectSwitching=true;
 sessionSwitchQueue=sessionSwitchQueue.then(async()=>{
  document.getElementById("dawRoom")?.classList.add("session-loading");status("Switching project session…");
  if(state.recorder&&state.recorder.state==="recording"){try{state.recorder.stop();}catch(e){}}
  clearTimeout(sessionSaveTimer);
  try{await saveSessionNow(previous);}catch(err){status("Previous session could not be saved: "+err.message);}
  await loadSessionFor(next);
  if(switchGeneration===window.__pennioDawSwitchGeneration)state.projectSwitching=false;
 }).catch(err=>{if(switchGeneration===window.__pennioDawSwitchGeneration)state.projectSwitching=false;status("Project switch failed: "+err.message);});
});
function snapshot(){state.undo.push({tracks:state.tracks.map(t=>({...t})),selected:state.selected});if(state.undo.length>20)state.undo.shift();$("dawUndo").disabled=false;}
function context(){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw Error("Web Audio is not supported in this browser.");if(!state.ctx)state.ctx=new C();if(!state.outputGain){state.outputGain=state.ctx.createGain();state.outputGain.gain.value=1;state.outputGain.connect(state.ctx.destination);}if(state.ctx.state==="suspended")state.ctx.resume();return state.ctx;}function setOutputLevel(level){if(!state.ctx||!state.outputGain)return;const p=state.outputGain.gain,now=state.ctx.currentTime;p.cancelScheduledValues(now);p.setValueAtTime(p.value,now);p.linearRampToValueAtTime(level,now+.012);}
function drawWave(track,canvas){const c=canvas.getContext("2d"),w=canvas.width=Math.max(320,canvas.clientWidth*2),h=canvas.height=180,light=document.documentElement.dataset.theme==="light";c.clearRect(0,0,w,h);const data=track.buffer.getChannelData(0),step=Math.max(1,Math.floor(data.length/w)),mid=h/2;c.strokeStyle=track.id===state.selected?(light?"#b94317":"#ff8a55"):(light?"#625b52":"#b7a79a");c.lineWidth=1.5;c.beginPath();for(let x=0;x<w;x++){let min=1,max=-1;for(let j=0;j<step;j++){const v=data[x*step+j]||0;if(v<min)min=v;if(v>max)max=v;}c.moveTo(x,mid+min*mid*.82);c.lineTo(x,mid+max*mid*.82);}c.stroke();c.strokeStyle=light?"#c9c2b8":"#333";c.beginPath();c.moveTo(0,mid);c.lineTo(w,mid);c.stroke();}
function ensureTimelineControls(){
 const host=$("dawTracks");if(!host)return;
 let bar=document.getElementById("dawTimelineControls");
 if(!bar){
  bar=document.createElement("div");bar.id="dawTimelineControls";bar.className="daw-timeline-controls";
  bar.innerHTML='<div class="daw-timeline-switch" role="group" aria-label="Timeline display"><button type="button" data-timeline-view="bars" aria-pressed="false">Bars</button><button type="button" data-timeline-view="waves" aria-pressed="true">Waves</button></div><label class="daw-tempo-control">BPM <input id="dawTempo" type="number" min="40" max="240" step="1" value="120" inputmode="numeric"></label><label class="daw-snap-control"><input id="dawBarSnap" type="checkbox" checked> Snap to grid</label><span class="daw-timeline-hint" id="dawTimelineHint">Wave editing · free selection</span>';
  host.parentNode.insertBefore(bar,host);
  bar.querySelectorAll("[data-timeline-view]").forEach(button=>button.addEventListener("click",()=>{state.timelineView=button.dataset.timelineView;render();}));
  const tempo=bar.querySelector("#dawTempo");tempo.addEventListener("change",()=>{state.tempo=Math.max(40,Math.min(240,Math.round(Number(tempo.value)||120)));tempo.value=state.tempo;queueSessionSave();render();});
  const snap=bar.querySelector("#dawBarSnap");snap.addEventListener("change",()=>{state.barSnap=snap.checked;queueSessionSave();render();});
 }
 bar.querySelectorAll("[data-timeline-view]").forEach(button=>{const active=button.dataset.timelineView===state.timelineView;button.classList.toggle("on",active);button.setAttribute("aria-pressed",String(active));});
 bar.querySelector("#dawTempo").value=state.tempo;
 bar.querySelector("#dawTempo").disabled=state.timelineView!=="bars";
 bar.querySelector("#dawBarSnap").checked=state.barSnap;
 bar.querySelector("#dawBarSnap").disabled=state.timelineView!=="bars";
 bar.querySelector("#dawTimelineHint").textContent=state.timelineView==="bars"?"Bar editing · 1/16 grid snapping":"Wave editing · free selection";
}
function applyTimelineView(wave){
 wave.dataset.timelineView=state.timelineView;
 wave.classList.toggle("daw-bars-view",state.timelineView==="bars");
 wave.classList.toggle("daw-waves-view",state.timelineView==="waves");
 if(state.timelineView!=="bars")return;
 const bpm=Math.max(40,Math.min(240,state.tempo||120)),secondsPerBeat=60/bpm;
 const pixelsPerSecond=Math.max(1,wave.clientWidth/(wave.closest(".daw-track")?.querySelector("canvas")?.dataset.duration||1));
 const beatWidth=secondsPerBeat*pixelsPerSecond;
 wave.style.setProperty("--daw-beat-width",beatWidth+"px");
 wave.style.setProperty("--daw-bar-width",(beatWidth*4)+"px");
}
function render(){const host=$("dawTracks");ensureTimelineControls();host.replaceChildren();if(!state.tracks.length){const e=document.createElement("div");e.className="daw-empty";e.textContent="Your tracks will appear here. Add vocals, instruments or field recordings.";host.append(e);}state.tracks.forEach(t=>{const row=document.createElement("div");row.className="daw-track";row.dataset.id=t.id;const head=document.createElement("div");head.className="daw-track-head";const name=document.createElement("input");name.className="daw-track-name";name.value=t.name;name.setAttribute("aria-label","Track name");name.onchange=()=>{t.name=name.value;queueSessionSave();};const controls=document.createElement("div");controls.className="daw-track-controls";[["M","mute","daw-track-mute"],["S","solo","daw-track-solo"]].forEach(([label,key,cls])=>{const b=document.createElement("button");b.className=cls;b.textContent=label;b.classList.toggle("on",!!t[key]);b.setAttribute("aria-pressed",String(!!t[key]));b.title=key==="mute"?"Toggle track mute":"Toggle persistent solo";b.onclick=()=>{t[key]=!t[key];syncTrackGains();render();queueSessionSave();};controls.append(b);});const hold=document.createElement("button");hold.className="daw-hold";hold.type="button";hold.textContent="H";hold.title="Hold to hear this track alone";hold.setAttribute("aria-label","Hold to isolate "+t.name);hold.setAttribute("aria-pressed","false");bindDawHold(hold,t);controls.append(hold);const remove=document.createElement("button");remove.textContent="×";remove.title="Remove track";remove.onclick=()=>{snapshot();if(state.playing)stop();disposeTrackDsp(t.id);state.tracks=state.tracks.filter(x=>x.id!==t.id);if(state.selected===t.id)state.selected=state.tracks[0]?.id||null;render();};controls.append(remove);const faders=document.createElement("div");faders.className="daw-track-faders";[["Level", "gain",0,1.5,.01],["Pan","pan",-1,1,.01],["Position","timeline",0,120,.1]].forEach(([label,key,min,max,step])=>{const lab=document.createElement("label");lab.textContent=label;const input=document.createElement("input");input.type="range";input.min=min;input.max=max;input.step=step;input.value=t[key];input.oninput=()=>{t[key]=+input.value;syncTrackGains();queueSessionSave();};lab.append(input);faders.append(lab);});head.append(name,controls,faders);const wave=document.createElement("div");wave.className="daw-track-wave";const canvas=document.createElement("canvas");canvas.dataset.duration=t.buffer.duration;wave.append(canvas);const region=document.createElement("div");region.className="daw-region";wave.append(region);const range=document.createElement("div");range.className="daw-range-select";wave.append(range);applyTimelineView(wave);bindWaveSelection(wave,t);row.append(head,wave);row.style.outline=t.id===state.selected?"1px solid var(--orange)":"none";row.onclick=e=>{if(e.target.closest("button,input"))return;state.selected=t.id;syncTrim();render();};host.append(row);requestAnimationFrame(()=>{applyTimelineView(wave);drawWave(t,canvas);});});syncRangeUI();renderStudioCleanInspector();$("dawExport").disabled=!state.tracks.length;$("dawSendStudio").disabled=!state.tracks.length;$("dawMerge").disabled=!state.tracks.length;syncTrim();queueSessionSave();}

function renderStudioCleanInspector(){
 const host=$("studioCleanControls");if(!host)return;const t=selected();host.replaceChildren();
 if(!t){const p=document.createElement("p");p.className="studio-side-note";p.textContent="Select an audio layer in Beat to adjust its sound.";host.append(p);return;}
 t.dsp={...window.StudioCleanDefaults,...(t.dsp||{})};
 const toggle=document.createElement("label");toggle.className="studio-clean-toggle";const checkbox=document.createElement("input");checkbox.type="checkbox";checkbox.checked=!!t.dsp.enabled;checkbox.addEventListener("change",()=>{t.dsp.enabled=checkbox.checked;updateActiveDsp(t);queueSessionSave();renderStudioCleanInspector();});const label=document.createElement("span");label.textContent="Studio Clean";toggle.append(checkbox,label);host.append(toggle);
 const presets=document.createElement("div");presets.className="studio-clean-presets";presets.setAttribute("role","group");presets.setAttribute("aria-label","Studio Clean preset");
 [["natural","Natural"],["crisp_voice","Crisp Voice"],["warm","Warm"],["thump","Thump"]].forEach(([id,name])=>{const b=document.createElement("button");b.type="button";b.textContent=name;b.classList.toggle("on",t.dsp.preset===id);b.setAttribute("aria-pressed",String(t.dsp.preset===id));b.disabled=!t.dsp.enabled;b.addEventListener("click",()=>{t.dsp.preset=id;updateActiveDsp(t);queueSessionSave();renderStudioCleanInspector();});presets.append(b);});host.append(presets);
 const amount=document.createElement("label");amount.className="studio-clean-amount";const heading=document.createElement("span");heading.textContent="Enhance";const output=document.createElement("output");output.textContent=Math.round(t.dsp.enhanceAmount*100)+"%";heading.append(output);const slider=document.createElement("input");slider.type="range";slider.min="0";slider.max="100";slider.step="1";slider.value=Math.round(t.dsp.enhanceAmount*100);slider.disabled=!t.dsp.enabled;slider.addEventListener("input",()=>{t.dsp.enhanceAmount=Number(slider.value)/100;output.textContent=slider.value+"%";updateActiveDsp(t);queueSessionSave();});amount.append(heading,slider);host.append(amount);
}
function updateActiveDsp(track){const chain=state.dspChains.find(item=>item.trackId===track.id);if(chain)chain.setState(track.dsp,.015);}
function disposeTrackDsp(trackId){state.dspChains=state.dspChains.filter(chain=>{if(chain.trackId!==trackId)return true;chain.dispose();return false;});}
function selected(){return state.tracks.find(t=>t.id===state.selected)||null;}
function syncTrim(){const t=selected(),a=$("dawTrimStart"),b=$("dawTrimEnd");[a,b].forEach(x=>x.disabled=!t);if(t){a.max=t.buffer.duration;b.max=t.buffer.duration;a.value=t.start;b.value=t.end;a.step=b.step=".01";}}
function addBuffer(buffer,name){snapshot();const t={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:name||"Audio "+(state.tracks.length+1),buffer,start:0,end:buffer.duration,gain:1,pan:0,timeline:0,mute:false,solo:false,dsp:{...window.StudioCleanDefaults}};state.tracks.push(t);state.selected=t.id;render();status(t.name+" added · "+fmt(buffer.duration));}
async function importFiles(files){const target=sessionProjectId();return queueSessionOperation(target,async projectId=>{for(const file of Array.from(files||[])){try{const ctx=context(),buf=await ctx.decodeAudioData(await file.arrayBuffer());if(window.PennioWorkspace?.addAsset)window.PennioWorkspace.addAsset({blob:file,name:file.name,kind:"audio",projectId}).catch(e=>status("Track imported, but could not be added to shared media: "+e.message));addBuffer(buf,file.name.replace(/\.[^.]+$/,""));}catch(e){status("Could not read "+file.name+": "+e.message);}}});}
function stop(){state.playGeneration++;state.playStarting=false;state.sources.forEach(s=>{try{s.stop();}catch(e){}});state.sources=[];state.dspChains.forEach(c=>c.dispose());state.dspChains=[];setOutputLevel(0);state.playing=false;clearInterval(state.timer);$("dawPlay").textContent="▶ Play";$("dawClock").textContent=fmt(state.offset);document.querySelectorAll(".daw-playhead").forEach(x=>x.remove());queueSessionSave();}
function chain(source,t,ctx,destination){if(ctx===state.ctx&&state.outputGain)destination=state.outputGain;let node=source,last=source;if(state.effects.eq&&!t.bypassFx){const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=75;last.connect(hp);last=hp;const eq=ctx.createBiquadFilter();eq.type="peaking";eq.frequency.value=2800;eq.Q.value=.8;eq.gain.value=1.5;last.connect(eq);last=eq;}if(state.effects.compressor&&!t.bypassFx){const c=ctx.createDynamicsCompressor();c.threshold.value=-20;c.ratio.value=3;c.attack.value=.008;c.release.value=.18;last.connect(c);last=c;}if(state.effects.echo&&!t.bypassFx){const d=ctx.createDelay(1);d.delayTime.value=.22;const fb=ctx.createGain();fb.gain.value=.18;last.connect(d);d.connect(fb);fb.connect(d);last=d;}if(state.effects.reverb&&!t.bypassFx){const d=ctx.createDelay(.5);d.delayTime.value=.045;const g=ctx.createGain();g.gain.value=.12;last.connect(d);d.connect(g);last.connect(g);last=g;}const gain=ctx.createGain();gain.gain.value=ctx===state.ctx?(trackAudible(t)?t.gain:0):(t.mute?0:t.gain);last.connect(gain);const pan=ctx.createStereoPanner?ctx.createStereoPanner():null;if(pan){pan.pan.value=t.pan;gain.connect(pan);pan.connect(destination);}else gain.connect(destination);return gain;}
async function play(){if(!state.tracks.length){status("Import or record audio first.");return;}if(state.playStarting){stop();return;}if(state.playing){state.offset=Math.min(duration(),state.offset+context().currentTime-state.startTime);stop();return;}try{const generation=++state.playGeneration;state.playStarting=true;const ctx=context(),when=ctx.currentTime+.06,playOffset=state.offset;setOutputLevel(1);state.sources=[];state.dspChains=[];for(const t of state.tracks){const src=ctx.createBufferSource();src.buffer=t.buffer;let input=src;if(window.StudioCleanChain){const dsp=await window.StudioCleanChain.create(ctx,t.dsp||window.StudioCleanDefaults,{mono:t.buffer.numberOfChannels===1});if(generation!==state.playGeneration){dsp.dispose();return;}src.connect(dsp.input);input=dsp.output;src.__pennioDsp=dsp;dsp.trackId=t.id;state.dspChains.push(dsp);}const laneGain=chain(input,t,ctx,ctx.destination);src.__pennioTrack=t;src.__pennioTrackGain=laneGain;const elapsed=Math.max(0,playOffset-(t.timeline||0)),sourceOffset=t.start+elapsed,remain=t.end-sourceOffset;if(remain<=0)continue;const scheduled=when+Math.max(0,(t.timeline||0)-playOffset);src.start(scheduled,sourceOffset,remain);state.sources.push(src);}state.playStarting=false;state.playing=true;state.startTime=ctx.currentTime;const base=playOffset;$("dawPlay").textContent="Ⅱ Pause";state.timer=setInterval(()=>{const now=base+ctx.currentTime-state.startTime;$("dawClock").textContent=fmt(now);if(now>=duration()){state.offset=0;stop();}},80);}catch(e){stop();status(e.message);}}
window.PennioDAWAudioControl={stop:()=>{if(state.playing){state.offset=Math.min(duration(),state.offset+context().currentTime-state.startTime);stop();}},isPlaying:()=>state.playing};
function wavBlob(buffer){const channels=2,length=buffer.length,rate=buffer.sampleRate,bytes=length*channels*2,ab=new ArrayBuffer(44+bytes),v=new DataView(ab);const str=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};str(0,"RIFF");v.setUint32(4,36+bytes,true);str(8,"WAVE");str(12,"fmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(24,rate,true);v.setUint32(28,rate*channels*2,true);v.setUint16(32,channels*2,true);v.setUint16(34,16,true);str(36,"data");v.setUint32(40,bytes,true);const left=buffer.getChannelData(0),right=buffer.numberOfChannels>1?buffer.getChannelData(1):left;let p=44;for(let i=0;i<length;i++){for(const x of [left[i],right[i]]){const s=Math.max(-1,Math.min(1,x));v.setInt16(p,s<0?s*32768:s*32767,true);p+=2;}}return new Blob([ab],{type:"audio/wav"});}
async function exportMix(sendToStudio=false,mergeToTrack=false){if(!state.tracks.length)return;const exportProjectId=sessionProjectId();stop();status("Rendering your mix…");try{const rate=44100,secs=Math.max(.1,duration()),off=new OfflineAudioContext(2,Math.ceil(secs*rate),rate),solo=state.tracks.some(t=>t.solo);for(const t of state.tracks){if(t.mute||(solo&&!t.solo))continue;const src=off.createBufferSource();src.buffer=t.buffer;let node=src;if(window.StudioCleanChain){const dsp=await window.StudioCleanChain.create(off,t.dsp||window.StudioCleanDefaults,{mono:t.buffer.numberOfChannels===1});src.connect(dsp.input);node=dsp.output;}const gain=off.createGain();gain.gain.value=t.gain;node.connect(gain);node=gain;if(state.effects.eq&&!t.bypassFx){const f=off.createBiquadFilter();f.type="highpass";f.frequency.value=75;node.connect(f);node=f;}if(state.effects.compressor&&!t.bypassFx){const c=off.createDynamicsCompressor();c.threshold.value=-20;c.ratio.value=3;node.connect(c);node=c;}if(state.effects.echo&&!t.bypassFx){const delay=off.createDelay(1),feedback=off.createGain();delay.delayTime.value=.22;feedback.gain.value=.18;node.connect(delay);delay.connect(feedback);feedback.connect(delay);node.connect(delay);const dry=off.createGain();dry.gain.value=.82;node.connect(dry);const wet=off.createGain();wet.gain.value=.28;delay.connect(wet);const sum=off.createGain();dry.connect(sum);wet.connect(sum);node=sum;}if(state.effects.reverb&&!t.bypassFx){const early=off.createDelay(.5),tail=off.createDelay(.5),wet=off.createGain();early.delayTime.value=.037;tail.delayTime.value=.071;wet.gain.value=.16;node.connect(early);early.connect(tail);tail.connect(wet);const dry=off.createGain();dry.gain.value=.88;node.connect(dry);const sum=off.createGain();dry.connect(sum);wet.connect(sum);node=sum;}const pan=off.createStereoPanner();pan.pan.value=t.pan;node.connect(pan);pan.connect(off.destination);src.start(t.timeline||0,t.start,t.end-t.start);}let rendered=await off.startRendering();const normalize=state.tracks.some(t=>!t.mute&&(!solo||t.solo)&&t.dsp?.enabled&&t.dsp?.normalizeLufs!==false);if(window.StudioCleanOffline){if(normalize){const result=window.StudioCleanOffline.normalizeAndFade(rendered,-14,-1,.015);rendered=result.buffer;status("Studio Clean export · "+(Number.isFinite(result.measuredLufs)?result.measuredLufs.toFixed(1)+" LUFS before normalization":"silent mix")+" · estimated peak "+(Number.isFinite(result.peakDbfs)?result.peakDbfs.toFixed(1)+" dBFS":"n/a"));}else window.StudioCleanOffline.applyBoundaryFades(rendered,.015);}if(mergeToTrack){snapshot();state.tracks.forEach(t=>{t.mute=true;t.solo=false;});const merged={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:"Merged mix",buffer:rendered,start:0,end:rendered.duration,gain:1,pan:0,timeline:0,mute:false,solo:false,bypassFx:true};state.tracks.push(merged);state.selected=merged.id;state.offset=0;render();queueSessionSave();status("Merged mix added as one track. Original layers are muted and still available.");return;}const blob=wavBlob(rendered);if(sendToStudio){window.dispatchEvent(new CustomEvent("pennio:studio-media",{detail:{blob,name:"Àyàn DAW mix",kind:"audio",projectId:exportProjectId}}));status("Stereo WAV sent to the Studio recorder. Choose Film or Àyàn from the shared panel.");}else{const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="ayan-mix.wav";a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);status("Mix exported · stereo WAV");}}catch(e){status("Export failed: "+e.message);}}
$("dawImport").addEventListener("change",e=>{importFiles(e.target.files);e.target.value="";});
window.addEventListener("pennio:recorded-audio",e=>{const detail=e.detail||{},blob=detail.blob;if(!blob)return;const target=detail.projectId||sessionProjectId();queueSessionOperation(target,async projectId=>{const buffer=await context().decodeAudioData(await blob.arrayBuffer());addBuffer(buffer,detail.name||"Studio recording");status("Recording added as a new DAW track.");$("dawRoom").scrollIntoView({behavior:"smooth",block:"start"});}).catch(err=>status("Could not add recording to Àyàn: "+err.message));});
const modeCopy={beat:"Build and arrange your beat. Your patterns and tracks stay in the same project.",record:"Record a voice or instrument. Keep the beat playing while you capture a take.",overlay:"Add a new take over an existing passage. Select a section to compare or re-record it.",edit:"Select, trim, keep or remove a passage. Original takes remain available until you change them.",mix:"Balance track levels and shape the sound with EQ, compression, reverb and echo.",plan:"Keep session direction, recording order and mix notes with this project.",merge:"Export a stereo WAV, merge tracks or send the mix back to the Beat workspace."};
const modeTargets={beat:$("dawTracks"),record:$("dawHead"),overlay:$("dawSelectionPanel"),edit:$("dawSelectionPanel"),mix:$("dawBottom"),plan:$("dawPlanPanel"),merge:$("dawToolbar")};
const dawRoot=$("dawRoom");if(dawRoot)dawRoot.dataset.mode="beat";
function selectEngineerMode(mode){
 const root=$("dawRoom"),plan=$("dawPlanPanel");
 if(!modeCopy[mode])return;
 if(root)root.dataset.mode=mode;
 document.querySelectorAll("[data-engineer-mode]").forEach(item=>{const active=item.dataset.engineerMode===mode;item.classList.toggle("on",active);item.setAttribute("aria-pressed",String(active));});
 plan.hidden=mode!=="plan";$("dawModeHelp").textContent=modeCopy[mode]||"";
 document.querySelectorAll("#dawHead,#dawToolbar,#dawPlanPanel,#dawTracks,#dawSelectionPanel,#dawBottom").forEach(item=>item.classList.remove("daw-mode-focus"));
 const target=modeTargets[mode];target?.classList.add("daw-mode-focus");
 if(mode==="plan")$("dawPlan").focus({preventScroll:true});
 if(innerWidth<760)target?.scrollIntoView({behavior:"smooth",block:"nearest"});
}
document.querySelectorAll("[data-engineer-mode]").forEach(button=>button.addEventListener("click",()=>selectEngineerMode(button.dataset.engineerMode)));
$("dawPlan").addEventListener("input",()=>{state.plan=$("dawPlan").value;queueSessionSave();});$("dawPlay").onclick=play;$("dawStop").onclick=()=>{state.offset=0;stop();queueSessionSave();};$("dawMerge").onclick=()=>exportMix(false,true);$("dawExport").onclick=()=>exportMix(false);$("dawSendStudio").onclick=()=>exportMix(true);
$("dawUndo").onclick=()=>{const s=state.undo.pop();if(!s)return;state.tracks=s.tracks;state.selected=s.selected;$("dawUndo").disabled=!state.undo.length;render();status("Last track change undone.");queueSessionSave();};
$("dawTrimStart").oninput=e=>{const t=selected();if(!t)return;t.start=Math.min(+e.target.value,t.end-.02);queueSessionSave();};
$("dawTrimEnd").oninput=e=>{const t=selected();if(!t)return;t.end=Math.max(+e.target.value,t.start+.02);queueSessionSave();};
$("dawDelete").onclick=()=>{const t=selected();if(!t)return;snapshot();if(state.playing)stop();disposeTrackDsp(t.id);state.tracks=state.tracks.filter(x=>x.id!==t.id);state.selected=state.tracks[0]?.id||null;render();status("Track removed.");};
$("dawNormalize").onclick=()=>{const t=selected();if(!t)return;snapshot();const copy=context().createBuffer(t.buffer.numberOfChannels,t.buffer.length,t.buffer.sampleRate);let peak=0;for(let c=0;c<t.buffer.numberOfChannels;c++){const src=t.buffer.getChannelData(c),dst=copy.getChannelData(c);for(let i=0;i<src.length;i++){dst[i]=src[i];peak=Math.max(peak,Math.abs(src[i]));}}if(peak>0){const factor=.95/peak;for(let c=0;c<copy.numberOfChannels;c++){const d=copy.getChannelData(c);for(let i=0;i<d.length;i++)d[i]*=factor;}}t.buffer=copy;t.end=Math.min(t.end,copy.duration);render();status("Selected track normalized to -0.45 dBFS.");};
document.querySelectorAll("[data-fx]").forEach(b=>b.onclick=()=>{const k=b.dataset.fx;state.effects[k]=!state.effects[k];b.classList.toggle("primary",state.effects[k]);status(k+" "+(state.effects[k]?"on":"off")+" for playback and mix.");queueSessionSave();});
$("dawMic").onclick=async()=>{
 if(state.recorder&&state.recorder.state==="recording"){state.recorder.stop();$("dawMic").textContent="Record voice";return;}
 if(state.recordingDone){status("Finishing the previous take…");return;}
 if(state.projectSwitching){status("Wait for the project session to finish switching.");return;}
 const recordProjectId=sessionProjectId();
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  if(state.projectSwitching||sessionProjectId()!==recordProjectId){stream.getTracks().forEach(t=>t.stop());status("Recording cancelled because the project changed.");return;}
  state.recordStream=stream;state.recordChunks=[];
  const mime=MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":"";
  state.recorder=new MediaRecorder(stream,mime?{mimeType:mime}:{});state.recorderKind="mic";beginRecordingTask("mic");
  state.recorder.ondataavailable=e=>{if(e.data.size)state.recordChunks.push(e.data);};
  state.recorder.onstop=async()=>{
   try{
    stream.getTracks().forEach(t=>t.stop());state.recordStream=null;$("dawMic").textContent="Record voice";
    const blob=new Blob(state.recordChunks,{type:state.recorder.mimeType||"audio/webm"});state.recorder=null;state.recorderKind=null;
    if(!blob.size){status("No voice take was captured.");return;}
    if(window.PennioWorkspace?.addAsset)window.PennioWorkspace.addAsset({blob,name:"Voice take",kind:"audio",projectId:recordProjectId}).catch(e=>status("Voice take recorded, but could not be added to shared media: "+e.message));
    await queueSessionOperation(recordProjectId,async()=>{const buf=await context().decodeAudioData(await blob.arrayBuffer());addBuffer(buf,"Voice take");status("Voice take recorded.");});
   }catch(error){status("Recording could not be added to its project: "+error.message);}
   finally{finishRecordingTask();}
  };
  state.recorder.start();$("dawMic").textContent="■ Stop recording";status("Recording from microphone…");
 }catch(e){if(state.recordStream){state.recordStream.getTracks().forEach(t=>t.stop());state.recordStream=null;}if(state.recordingKind==="mic")finishRecordingTask();status("Microphone unavailable: "+e.message);}
};
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden"){clearTimeout(sessionSaveTimer);saveSessionNow().catch(()=>{});}});
window.addEventListener("pagehide",()=>{clearTimeout(sessionSaveTimer);saveSessionNow().catch(()=>{});});
window.addEventListener("beforeunload",()=>{clearTimeout(sessionSaveTimer);saveSessionNow().catch(()=>{});stop();});

// Timeline selection: drag across a waveform to mark an exact passage.
state.range=null;
const selectionReadout=$("dawSelectionReadout"),clearSelection=$("dawClearSelection"),keepSelection=$("dawKeepSelection"),punchRecord=$("dawPunchRecord"),humBeat=$("dawHumBeat");
const selectionActions=document.querySelector(".daw-selection-actions");
let duplicateSelectionButton=$("dawDuplicateSelection");
if(selectionActions&&!duplicateSelectionButton){
 duplicateSelectionButton=document.createElement("button");duplicateSelectionButton.type="button";duplicateSelectionButton.className="btn";duplicateSelectionButton.id="dawDuplicateSelection";duplicateSelectionButton.textContent="Duplicate to new track";duplicateSelectionButton.disabled=true;selectionActions.insertBefore(duplicateSelectionButton,humBeat||null);
}
duplicateSelectionButton?.addEventListener("click",()=>{
 const r=rangeTimes();if(!r)return;
 try{
  const source=r.track,from=Math.floor(r.start*source.buffer.sampleRate),to=Math.max(from+1,Math.floor(r.end*source.buffer.sampleRate)),frames=to-from,copy=context().createBuffer(source.buffer.numberOfChannels,frames,source.buffer.sampleRate);
  for(let channel=0;channel<source.buffer.numberOfChannels;channel++)copy.copyToChannel(source.buffer.getChannelData(channel).slice(from,to),channel);
  snapshot();
  const track={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:(source.name||"Audio")+" · selection",buffer:copy,start:0,end:copy.duration,gain:source.gain,pan:source.pan,timeline:r.timeline,mute:false,solo:false,bypassFx:!!source.bypassFx,dsp:{...window.StudioCleanDefaults,...(source.dsp||{})}};
  state.tracks.push(track);state.selected=track.id;clearRange();render();status("Selected passage duplicated to a new track. The source track is unchanged.");
 }catch(error){status("Could not duplicate this passage: "+error.message);}
});

function rangeTimes(){const t=selected();if(!t||!state.range)return null;const a=Math.max(t.start,Math.min(state.range.start,state.range.end)),b=Math.min(t.end,Math.max(state.range.start,state.range.end));return b-a>=.08?{track:t,start:a,end:b,duration:b-a,timeline:(t.timeline||0)+a-t.start}:null;}
function syncRangeUI(){
 const r=rangeTimes(),fmt=n=>{n=Math.max(0,n||0);return String(Math.floor(n/60)).padStart(2,"0")+":"+String(Math.floor(n%60)).padStart(2,"0")+"."+Math.floor(n%1*10)};
 if(selectionReadout)selectionReadout.textContent=r?fmt(r.start)+" – "+fmt(r.end)+" · "+fmt(r.duration)+" selected":"Drag across a waveform to select a timeframe.";
 [clearSelection,keepSelection,punchRecord,humBeat,duplicateSelectionButton].forEach(b=>{if(b)b.disabled=!r;});
 document.querySelectorAll(".daw-range-select").forEach(el=>{const row=el.closest(".daw-track"),t=state.tracks.find(x=>x.id===row?.dataset.id);if(!r||!t||t.id!==r.track.id){el.classList.remove("on");return;}el.style.left=(r.start/t.buffer.duration*100)+"%";el.style.width=((r.end-r.start)/t.buffer.duration*100)+"%";el.classList.add("on");});
}
function clearRange(){state.range=null;syncRangeUI();queueSessionSave();}
function bindWaveSelection(wave,t){
 let down=false,x0=0;
 const point=e=>{const rect=wave.getBoundingClientRect(),pct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));let time=pct*t.buffer.duration;if(state.timelineView==="bars"&&state.barSnap){const quantum=60/Math.max(40,state.tempo||120)/4;time=Math.round(time/quantum)*quantum;}return Math.max(t.start,Math.min(t.end,time));};
 wave.addEventListener("pointerdown",e=>{if(e.target.closest("button,input"))return;down=true;x0=point(e);state.selected=t.id;state.range={start:x0,end:x0+.1};wave.setPointerCapture?.(e.pointerId);syncRangeUI();});
 wave.addEventListener("pointermove",e=>{if(!down)return;const x=point(e);state.range={start:Math.min(x0,x),end:Math.max(x0,x)};syncRangeUI();});
 const finish=()=>{if(!down)return;down=false;const r=rangeTimes();if(!r)clearRange();else syncRangeUI();queueSessionSave();};
 wave.addEventListener("pointerup",finish);wave.addEventListener("pointercancel",finish);
}
clearSelection?.addEventListener("click",clearRange);
const playSelectionButton=$("dawPlaySelection");
playSelectionButton?.addEventListener("click",async()=>{
 const r=rangeTimes();if(!r)return;
 try{
  stop();const generation=state.playGeneration,ctx=context();setOutputLevel(1);const src=ctx.createBufferSource();src.buffer=r.track.buffer;
  const dsp=window.StudioCleanChain?await window.StudioCleanChain.create(ctx,r.track.dsp||window.StudioCleanDefaults,{mono:r.track.buffer.numberOfChannels===1}):null;if(generation!==state.playGeneration){dsp?.dispose();return;}if(dsp){src.connect(dsp.input);dsp.trackId=r.track.id;state.dspChains=[dsp];}const laneGain=chain(dsp?dsp.output:src,r.track,ctx,ctx.destination);src.__pennioTrack=r.track;src.__pennioTrackGain=laneGain;
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
 const captureProjectId=sessionProjectId();
 if(state.projectSwitching){status("Wait for the project session to finish switching.");return;}
 if(state.recordingDone||state.recorder&&state.recorder.state==="recording"){status("A recording is already in progress. Stop it before starting another.");return;}
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status("Microphone recording needs a supported HTTPS browser. Open Studio in Chrome and allow microphone access.");return;}
 let mic=null,src=null,stopTimer=0,finished=false;
 try{
  status("Requesting microphone access…");
  mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  if(state.projectSwitching||sessionProjectId()!==captureProjectId){mic.getTracks().forEach(track=>track.stop());status("Recording cancelled because the project changed.");return;}
  const ctx=context();if(ctx.state!=="running")await ctx.resume();
  const parts=[],supported=["audio/webm;codecs=opus","audio/mp4","audio/webm"].find(x=>MediaRecorder.isTypeSupported(x));
  const mr=new MediaRecorder(mic,supported?{mimeType:supported}:undefined);state.recorder=mr;state.recorderKind="selection";beginRecordingTask("selection");
  src=ctx.createBufferSource();src.buffer=r.track.buffer;
  const gain=ctx.createGain();gain.gain.value=r.track.mute?0:Math.max(0,Math.min(1.5,r.track.gain||1));src.connect(gain);gain.connect(ctx.destination);
  const cleanup=()=>{if(finished)return;finished=true;clearTimeout(stopTimer);mic?.getTracks().forEach(x=>x.stop());try{src?.stop();}catch(_){}};
  mr.ondataavailable=e=>{if(e.data&&e.data.size)parts.push(e.data);};
  mr.onerror=()=>{cleanup();state.recorder=null;state.recorderKind=null;finishRecordingTask();status("Recording failed. Check microphone permission, then try again.");};
  mr.onstart=()=>{
   status(kind==="hum"?"Recording started. Hum along with the selected passage.":"Recording started. Speak or sing over the selected passage.");
   const when=ctx.currentTime+.12;
   try{src.start(when,r.start,r.duration);}catch(e){try{mr.stop();}catch(_){}status("Could not play the selected passage: "+e.message);return;}
   stopTimer=setTimeout(()=>{if(mr.state==="recording")mr.stop();},Math.max(350,r.duration*1000+180));
  };
  mr.onstop=async()=>{
   cleanup();state.recorder=null;state.recorderKind=null;
   try{
    const take=new Blob(parts,{type:mr.mimeType||"audio/webm"});
    if(!take.size){status("No audio was captured. Check microphone permission and try again.");return;}
    if(kind==="hum"){
     window.dispatchEvent(new CustomEvent("pennio:recorded-audio",{detail:{blob:take,name:"Hum over selection",projectId:captureProjectId}}));
     if(state.lastSessionOperation)await state.lastSessionOperation;
     status("Hum sent to Àyàn and Ìlù. Select “Translate my voice to drum” to create the talking-drum line.");
    }else{
     const buffer=await ctx.decodeAudioData(await take.arrayBuffer());
     await queueSessionOperation(captureProjectId,async()=>{snapshot();const track={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:"Re-recorded passage",buffer,start:0,end:buffer.duration,gain:1,pan:0,timeline:r.timeline,mute:false,solo:false};state.tracks.push(track);state.selected=track.id;render();status("New take placed at the selected timeline position. Original track preserved.");});
    }
   }catch(error){status("The take was captured, but could not be added to its project: "+error.message);}
   finally{finishRecordingTask();}
  };
  mr.start(100);status("Starting microphone and selected passage…");
 }catch(e){
  mic?.getTracks().forEach(x=>x.stop());state.recorder=null;state.recorderKind=null;finishRecordingTask();
  status("Could not start recording: "+(e.name==="NotAllowedError"?"Allow microphone access in your browser settings.":e.message||"Check microphone permission and try again."));
 }
}

punchRecord?.addEventListener("click",()=>captureSelection("punch"));
humBeat?.addEventListener("click",()=>captureSelection("hum"));
sessionSwitchQueue=loadSessionFor(window.PennioWorkspace?.activeProjectId||SESSION_DEFAULT).catch(e=>status("Could not open the current project session: "+e.message));
})();