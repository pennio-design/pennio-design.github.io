(function(){
"use strict";
const $=id=>document.getElementById(id);
const dock=$("studioRecorder"),launch=$("studioRecLaunch"),start=$("studioRecStart"),stop=$("studioRecStop"),preview=$("studioRecPreview"),result=$("studioRecResult"),status=$("studioRecStatus"),clock=$("studioRecClock"),useAyan=$("studioRecUse"),useTongue=$("studioRecTongue"),useFilm=$("studioRecFilm"),extract=$("studioRecExtract");
const trimPanel=$("studioRecTrim"),trimStart=$("studioRecTrimStart"),trimEnd=$("studioRecTrimEnd"),trimStartValue=$("studioRecTrimStartValue"),trimEndValue=$("studioRecTrimEndValue"),trimDuration=$("studioRecTrimDuration"),trimApply=$("studioRecTrimApply"),trimReset=$("studioRecTrimReset");
const liveWrap=$("studioRecLive"),liveVideo=$("studioRecLiveVideo"),liveFrame=$("studioRecLiveFrame"),liveRec=$("studioRecRec"),flipButton=$("studioRecFlip");let facing="environment";

if(!dock||!launch)return;
let mode="audio",stream=null,recorder=null,chunks=[],blob=null,sourceBlob=null,blobUrl=null,started=0,ticker=null,mediaDuration=0,takeProjectId=null,targetLaneId=null,targetLaneName="",vocalMode="hum";
const setStatus=s=>status.textContent=s;
const setMode=m=>{if(recorder&&recorder.state==="recording")return;if(stream)stopTracks();mode=m;document.querySelectorAll("[data-rec-mode]").forEach(b=>b.classList.toggle("on",b.dataset.recMode===m));$("studioRecTitle").textContent=m==="audio"?"Record a voice or sound":"Capture a scene reference";$("studioRecHint").textContent=m==="audio"?"Capture a clean voice note, melody or beatbox.":"Preview framing, then capture real light, locations and movement for your film or AI reference.";if(liveWrap)liveWrap.hidden=m!=="video";start.textContent=m==="audio"?"● Record audio":"Open camera";start.dataset.ready="false";if(liveVideo)liveVideo.srcObject=null;};
window.addEventListener("pennio:track-record-request",event=>{
 const detail=event.detail||{};if(!detail.laneId)return;
 targetLaneId=detail.laneId;targetLaneName=detail.laneName||detail.laneId;
 vocalMode=targetLaneId==="dd"?"beatbox":"hum";
 document.getElementById("studioVocalModes").hidden=false;
 document.querySelectorAll("[data-vocal-mode]").forEach(button=>button.classList.toggle("on",button.dataset.vocalMode===vocalMode));
 if(mode!=="audio")setMode("audio");
 useAyan.textContent="Add to "+targetLaneName;
 useAyan.hidden=false;
 setStatus("Recording target: "+targetLaneName+". Record, stop, then add the take to this track.");
 showDock(true);
});
async function prepareTakeProject(room){
 let projectId=takeProjectId||window.PennioWorkspace?.activeProjectId||"__studio_default__";
 if(projectId!=="__studio_default__"){
  const project=window.PennioWorkspace?.getProject?.(projectId);
  if(project)window.PennioWorkspace.setActiveProject(project);
  else projectId=window.PennioWorkspace?.activeProjectId||"__studio_default__";
 }else if(window.PennioWorkspace?.activeProjectId)window.PennioWorkspace.setActiveProject(null);
 if(window.PennioWorkspace?.openRoom)await window.PennioWorkspace.openRoom(room);
 return projectId;
}
function clearTake(){if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null;}takeProjectId=null;targetLaneId=null;targetLaneName="";document.getElementById("studioVocalModes").hidden=true;useAyan.textContent="Add to Àyàn";blob=null;sourceBlob=null;mediaDuration=0;preview.innerHTML="";preview.hidden=true;result.hidden=true;trimPanel.hidden=true;trimReset.disabled=true;clock.textContent="00:00";extract.hidden=true;useAyan.hidden=false;useTongue.hidden=false;useFilm.hidden=false;}
function fmtTime(value){const s=Math.max(0,Math.floor(value||0));return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");}
function configureTrim(media){
 trimPanel.hidden=true;
 const ready=()=>{const d=media.duration;if(!Number.isFinite(d)||d<=0)return;mediaDuration=d;trimStart.min="0";trimStart.max=String(Math.max(0,d-.1));trimStart.step="0.1";trimStart.value="0";trimEnd.min=String(Math.min(.1,d));trimEnd.max=String(d);trimEnd.step="0.1";trimEnd.value=String(d);trimStartValue.textContent=fmtTime(0);trimEndValue.textContent=fmtTime(d);trimDuration.textContent=fmtTime(d);trimPanel.hidden=false;trimReset.disabled=!sourceBlob||sourceBlob===blob;};
 if(media.readyState>=1)ready();else media.addEventListener("loadedmetadata",ready,{once:true});
}
function syncTrim(){let a=Number(trimStart.value),b=Number(trimEnd.value);if(a>=b-.1){if(document.activeElement===trimStart){a=Math.max(0,b-.1);trimStart.value=String(a);}else{b=Math.min(mediaDuration,a+.1);trimEnd.value=String(b);}}trimStartValue.textContent=fmtTime(a);trimEndValue.textContent=fmtTime(b);}
trimStart.addEventListener("input",syncTrim);trimEnd.addEventListener("input",syncTrim);
function showPreview(){
 if(!blob)return;if(blobUrl)URL.revokeObjectURL(blobUrl);blobUrl=URL.createObjectURL(blob);preview.innerHTML="";
 const media=document.createElement(mode==="video"?"video":"audio");media.controls=true;media.src=blobUrl;if(mode==="video")media.playsInline=true;
 preview.append(media);preview.hidden=false;configureTrim(media);
}
function encodeWav(buffer){
 const channels=buffer.numberOfChannels,length=buffer.length,rate=buffer.sampleRate,bytes=44+length*channels*2,view=new DataView(new ArrayBuffer(bytes));
 const write=(offset,str)=>{for(let i=0;i<str.length;i++)view.setUint8(offset+i,str.charCodeAt(i));};
 write(0,"RIFF");view.setUint32(4,bytes-8,true);write(8,"WAVE");write(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,rate,true);view.setUint32(28,rate*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);write(36,"data");view.setUint32(40,length*channels*2,true);
 let offset=44;for(let i=0;i<length;i++)for(let c=0;c<channels;c++){const sample=Math.max(-1,Math.min(1,buffer.getChannelData(c)[i]));view.setInt16(offset,sample<0?sample*32768:sample*32767,true);offset+=2;}
 return new Blob([view],{type:"audio/wav"});
}
async function trimAudio(input,a,b){
 const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx||!window.OfflineAudioContext)throw Error("Audio trimming is not supported in this browser.");
 const ctx=new Ctx();try{const decoded=await ctx.decodeAudioData(await input.arrayBuffer()),rate=decoded.sampleRate,startFrame=Math.floor(a*rate),frames=Math.max(1,Math.floor((b-a)*rate)),out=new OfflineAudioContext(decoded.numberOfChannels,frames,rate);
 for(let c=0;c<decoded.numberOfChannels;c++)out.destination.channelCount=decoded.numberOfChannels;
 const part=out.createBuffer(decoded.numberOfChannels,frames,rate);for(let c=0;c<decoded.numberOfChannels;c++)part.copyToChannel(decoded.getChannelData(c).slice(startFrame,startFrame+frames),c);
 const source=out.createBufferSource();source.buffer=part;source.connect(out.destination);source.start();return encodeWav(await out.startRendering());
 }finally{await ctx.close();}
}
async function trimVideo(input,a,b){
 const url=URL.createObjectURL(input),video=document.createElement("video");video.muted=false;video.playsInline=true;video.preload="auto";video.src=url;let capture=null;
 try{await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(Error("Could not load this video for trimming."));});const captureFn=video.captureStream||video.mozCaptureStream;if(!captureFn)throw Error("Video trimming needs a browser with media capture support.");video.currentTime=a;await new Promise(resolve=>video.addEventListener("seeked",resolve,{once:true}));capture=captureFn.call(video);const mime=["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"].find(t=>MediaRecorder.isTypeSupported(t));const mr=new MediaRecorder(capture,mime?{mimeType:mime}:undefined),parts=[];mr.ondataavailable=e=>{if(e.data&&e.data.size)parts.push(e.data);};const done=new Promise((resolve,reject)=>{mr.onerror=e=>reject(e.error||Error("Video trim failed."));mr.onstop=()=>resolve(new Blob(parts,{type:mr.mimeType||"video/webm"}));});mr.start(200);await video.play();await new Promise(resolve=>{const tick=()=>{if(video.currentTime>=b){video.pause();if(mr.state!=="inactive")mr.stop();resolve();}else requestAnimationFrame(tick);};requestAnimationFrame(tick);});const result=await done;if(!result.size)throw Error("The trimmed video was empty.");return result;
 }finally{if(capture)capture.getTracks().forEach(t=>t.stop());video.pause();video.removeAttribute("src");video.load();URL.revokeObjectURL(url);}
}
trimApply.addEventListener("click",async()=>{if(!blob||!mediaDuration)return;const a=Number(trimStart.value),b=Number(trimEnd.value);if(b-a<.2){setStatus("Choose a section at least 0.2 seconds long.");return;}trimApply.disabled=true;setStatus("Trimming your "+mode+"…");try{if(!sourceBlob)sourceBlob=blob;const trimmed=mode==="audio"?await trimAudio(blob,a,b):await trimVideo(blob,a,b);blob=trimmed;showPreview();trimReset.disabled=false;setStatus("Trim applied. Preview, save or send this section to another Studio room.");}catch(e){setStatus(e.message||"Could not trim this take.");}finally{trimApply.disabled=false;}});
trimReset.addEventListener("click",()=>{if(!sourceBlob)return;blob=sourceBlob;showPreview();trimReset.disabled=true;setStatus("Original take restored.");});

function showDock(open){
 if(!open&&recorder&&recorder.state==="recording"){setStatus("Stop the recording before closing this panel.");return}
 if(!open&&stream)stopTracks();
 dock.classList.toggle("open",open);launch.setAttribute("aria-expanded",String(open));document.body.classList.toggle("recorder-open",open);
 if(open)window.dispatchEvent(new CustomEvent("pennio:overlay-open",{detail:{source:"recorder"}}));
}
window.addEventListener("pennio:overlay-open",event=>{
 if(event.detail?.source==="recorder"||recorder&&recorder.state==="recording")return;
 showDock(false);
});
launch.addEventListener("click",()=>showDock(!dock.classList.contains("open")));
$("studioRecClose").addEventListener("click",()=>{if(recorder&&recorder.state==="recording")return;stopTracks();showDock(false);});
document.querySelectorAll("[data-rec-mode]").forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.recMode)));
document.querySelectorAll("[data-vocal-mode]").forEach(button=>button.addEventListener("click",()=>{
 if(recorder&&recorder.state==="recording")return;
 vocalMode=button.dataset.vocalMode;
 document.querySelectorAll("[data-vocal-mode]").forEach(item=>item.classList.toggle("on",item===button));
 const descriptions={beatbox:"Capture vocal percussion. Ìlù will map the attacks and rhythm into this lane.",hum:"Capture a sustained hum. Ìlù will follow the pitch contour into this lane.",tune:"Sing a melody. Ìlù will quantise the notes to the selected key and scale."};
 setStatus(descriptions[vocalMode]||"Voice mode selected.");
}));

flipButton.addEventListener("click",async()=>{if(mode!=="video"||recorder&&recorder.state==="recording")return;const wasReady=!!stream;stopTracks();if(!wasReady)return;facing=facing==="environment"?"user":"environment";try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:{facingMode:{ideal:facing},width:{ideal:1920},height:{ideal:1080}}});liveVideo.srcObject=stream;liveFrame.dataset.facing=facing;liveWrap.hidden=false;await liveVideo.play();flipButton.disabled=false;start.dataset.ready="true";start.textContent="● Record scene";setStatus(facing==="user"?"Front camera preview ready.":"Rear camera preview ready.");}catch(error){setStatus("Could not switch camera: "+error.message);}});
document.querySelectorAll("[data-rec-aspect]").forEach(button=>button.addEventListener("click",()=>{liveFrame.dataset.aspect=button.dataset.recAspect;document.querySelectorAll("[data-rec-aspect]").forEach(item=>item.classList.toggle("on",item===button));}));
function stopTracks(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}if(liveVideo)liveVideo.srcObject=null;if(liveWrap)liveWrap.hidden=true;if(flipButton)flipButton.disabled=true;start.dataset.ready="false";if(mode==="video")start.textContent="Open camera";liveRec&&(liveRec.hidden=true);}
start.addEventListener("click",async()=>{
 clearTake();takeProjectId=window.PennioWorkspace?.activeProjectId||"__studio_default__";chunks=[];
 if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.MediaRecorder){setStatus("Recording needs a supported browser and a secure HTTPS connection.");return;}
 try{
  if(mode==="video"&&!stream){
   window.PennioBeatControl?.stop?.();window.PennioDAWAudioControl?.stop?.();
   stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:{facingMode:{ideal:facing},width:{ideal:1920},height:{ideal:1080}}});
   liveVideo.srcObject=stream;liveFrame.dataset.facing=facing;liveWrap.hidden=false;await liveVideo.play();flipButton.disabled=false;start.dataset.ready="true";start.textContent="● Record scene";setStatus("Live preview ready. Check the framing, then record your scene.");return;
  }
  if(mode==="audio"){
   window.PennioBeatControl?.stop?.();window.PennioDAWAudioControl?.stop?.();
   stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  }
  const mimeCandidates=mode==="audio"?["audio/webm;codecs=opus","audio/mp4","audio/webm"]:["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/mp4"];
  const mime=mimeCandidates.find(x=>MediaRecorder.isTypeSupported(x));
  recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
  recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};
  recorder.onerror=e=>setStatus("Recording error: "+(e.error?.message||"unknown error"));
  recorder.onstop=()=>{
   document.body.classList.remove("recorder-active");stopTracks();blob=new Blob(chunks,{type:recorder.mimeType||(mode==="audio"?"audio/webm":"video/webm")});
   if(!blob.size){setStatus("No recording was captured. Try again.");return;}
   sourceBlob=blob;showPreview();result.hidden=false;useAyan.hidden=mode!=="audio";useTongue.hidden=mode!=="audio";useFilm.hidden=false;extract.hidden=mode!=="video";
   setStatus(mode==="audio"?"Take ready. Add it to Àyàn or save it to your device.":"Scene captured. Preview it, then save it with Film as a visual reference.");
   start.disabled=false;stop.disabled=true;clearInterval(ticker);
  };
  recorder.start(250);document.body.classList.add("recorder-active");if(liveRec)liveRec.hidden=false;started=Date.now();start.disabled=true;stop.disabled=false;setStatus(mode==="audio"?"Recording audio…":"Recording scene…");
  ticker=setInterval(()=>{const sec=Math.floor((Date.now()-started)/1000);clock.textContent=String(Math.floor(sec/60)).padStart(2,"0")+":"+String(sec%60).padStart(2,"0");},250);
 }catch(e){document.body.classList.remove("recorder-active");stopTracks();start.disabled=false;stop.disabled=true;setStatus("Could not start capture: "+(e.message||"Check microphone/camera permission and try again."));}
}); stop.addEventListener("click",()=>{if(recorder&&recorder.state==="recording"){recorder.stop();setStatus("Preparing your take…");}});
$("studioRecSave").addEventListener("click",()=>{if(!blob||!blobUrl)return;const a=document.createElement("a");a.href=blobUrl;const ext=(blob.type.includes("mp4")?"mp4":blob.type.includes("ogg")?"ogg":"webm");a.download=(mode==="audio"?"pennio-voice-take":"pennio-video-take")+"."+ext;document.body.append(a);a.click();a.remove();setStatus("Recording saved to your device.");});


async function extractVideoAudio(){if(!blob||mode!=="video")return;setStatus("Extracting the video's audio…");let url=URL.createObjectURL(blob),video=document.createElement("video"),stream=null,mr=null;video.preload="auto";video.src=url;video.playsInline=true;try{await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(Error("This video could not be opened."));});const capture=video.captureStream||video.mozCaptureStream;if(!capture)throw Error("Audio extraction is not supported in this browser. Try a desktop Chrome browser.");stream=capture.call(video);const tracks=stream.getAudioTracks();if(!tracks.length)throw Error("This video has no audio track to extract.");const audioStream=new MediaStream(tracks),candidates=["audio/webm;codecs=opus","audio/mp4","audio/webm"],mime=candidates.find(t=>MediaRecorder.isTypeSupported(t));mr=new MediaRecorder(audioStream,mime?{mimeType:mime}:undefined);const parts=[];mr.ondataavailable=e=>{if(e.data&&e.data.size)parts.push(e.data);};const finished=new Promise((resolve,reject)=>{mr.onerror=e=>reject(e.error||Error("Audio extraction failed."));mr.onstop=()=>resolve(new Blob(parts,{type:mr.mimeType||"audio/webm"}));});mr.start(250);const playbackEnded=new Promise(resolve=>{video.onended=resolve;});await video.play();await playbackEnded;mr.stop();const audio=await finished;if(!audio.size)throw Error("No audio was captured from this video.");blob=audio;sourceBlob=blob;mode="audio";setMode("audio");clearInterval(ticker);showPreview();result.hidden=false;useAyan.hidden=false;useTongue.hidden=false;useFilm.hidden=false;extract.hidden=true;setStatus("Audio extracted. Send it to Beat for Ìlù or Tongue for tone alignment.");}catch(e){setStatus(e.message||"Could not extract audio from this video.");}finally{if(stream)stream.getTracks().forEach(t=>t.stop());video.pause();video.removeAttribute("src");video.load();URL.revokeObjectURL(url);}}
extract.addEventListener("click",extractVideoAudio);
window.addEventListener("pennio:studio-media",e=>{const d=e.detail||{};if(!d.blob)return;clearTake();takeProjectId=d.projectId||window.PennioWorkspace?.activeProjectId||"__studio_default__";blob=d.blob;sourceBlob=blob;mode=d.kind==="video"?"video":"audio";setMode(mode);showPreview();result.hidden=false;useAyan.hidden=mode!=="audio";useTongue.hidden=mode!=="audio";useFilm.hidden=false;extract.hidden=mode!=="video";setStatus((d.name||"Media")+" received from another Studio room. Choose where to use it.");showDock(true);});
useTongue.addEventListener("click",()=>{
 if(!blob||mode!=="audio")return;
 const target=document.querySelector('nav button[data-v="write"]');if(target)target.click();
 window.dispatchEvent(new CustomEvent("pennio:write-audio",{detail:{blob,name:"Studio audio take"}}));
 setStatus("Sent to Tongue. Type the words you spoke to align the recording with Yoruba tone marks.");
 showDock(false);
});
useAyan.addEventListener("click",async()=>{
 if(!blob||mode!=="audio")return;
 try{
  const projectId=await prepareTakeProject("ayan");
  window.dispatchEvent(new CustomEvent("pennio:recorded-audio",{detail:{blob,name:"Studio audio take",projectId,targetLaneId,vocalMode}}));
  setStatus(targetLaneId?"Sent to "+targetLaneName+". The voice is being translated into that track.":"Sent to Àyàn. The take is now available in this project’s DAW and media library.");
  targetLaneId=null;targetLaneName="";useAyan.textContent="Add to Àyàn";
 }catch(error){setStatus("Could not open Àyàn: "+error.message);}
});
useFilm.addEventListener("click",async()=>{
 if(!blob)return;
 const kind=blob.type.startsWith("audio/")?"audio":"video";
 try{
  const projectId=await prepareTakeProject("faajiplace");
  window.dispatchEvent(new CustomEvent("pennio:film-media",{detail:{blob,name:kind==="video"?"Studio video take":"Studio audio take",kind,projectId}}));
  setStatus("Sent to Fàájìplace. The media is being saved with this project.");
 }catch(error){setStatus("Could not open Fàájìplace: "+error.message);}
});
window.addEventListener("pennio:workspace-media-error",event=>{setStatus("Media could not be saved: "+(event.detail&&event.detail.message||"Check available device storage."));});
$("studioRecAgain").addEventListener("click",()=>{clearTake();setStatus("Ready for another take.");});
window.addEventListener("beforeunload",()=>{stopTracks();if(blobUrl)URL.revokeObjectURL(blobUrl);clearInterval(ticker);});
setMode("audio");
})();