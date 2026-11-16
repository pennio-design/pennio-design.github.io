(function(){
"use strict";
const $=id=>document.getElementById(id);
const dock=$("studioRecorder"),launch=$("studioRecLaunch"),start=$("studioRecStart"),stop=$("studioRecStop"),preview=$("studioRecPreview"),result=$("studioRecResult"),status=$("studioRecStatus"),clock=$("studioRecClock");
if(!dock||!launch)return;
let mode="audio",stream=null,recorder=null,chunks=[],blob=null,blobUrl=null,started=0,ticker=null;
const setStatus=s=>status.textContent=s;
const setMode=m=>{if(recorder&&recorder.state==="recording")return;mode=m;document.querySelectorAll("[data-rec-mode]").forEach(b=>b.classList.toggle("on",b.dataset.recMode===m));$("studioRecTitle").textContent=m==="audio"?"Record a voice or sound":"Record a video take";$("studioRecHint").textContent=m==="audio"?"Capture a voice note, melody or beatbox.":"Capture a performance, scene or visual idea.";start.textContent=m==="audio"?"● Record audio":"● Record video";};
function clearTake(){if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null;}blob=null;preview.innerHTML="";preview.hidden=true;result.hidden=true;clock.textContent="00:00";}
function showDock(open){dock.classList.toggle("open",open);launch.setAttribute("aria-expanded",String(open));}
launch.addEventListener("click",()=>showDock(!dock.classList.contains("open")));
$("studioRecClose").addEventListener("click",()=>showDock(false));
document.querySelectorAll("[data-rec-mode]").forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.recMode)));
function stopTracks(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}}
start.addEventListener("click",async()=>{
 clearTake();chunks=[];
 if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.MediaRecorder){setStatus("Recording needs a supported browser and a secure HTTPS connection.");return;}
 try{
  stream=await navigator.mediaDevices.getUserMedia(mode==="audio"?{audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}}:{audio:true,video:{facingMode:"user",width:{ideal:1920},height:{ideal:1080}}});
  const mimeCandidates=mode==="audio"?["audio/webm;codecs=opus","audio/mp4","audio/webm"]:["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/mp4"];
  const mime=mimeCandidates.find(x=>MediaRecorder.isTypeSupported(x));
  recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
  recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};
  recorder.onerror=e=>setStatus("Recording error: "+(e.error?.message||"unknown error"));
  recorder.onstop=()=>{
   stopTracks();blob=new Blob(chunks,{type:recorder.mimeType|| (mode==="audio"?"audio/webm":"video/webm")});
   if(!blob.size){setStatus("No recording was captured. Try again.");return;}
   blobUrl=URL.createObjectURL(blob);
   const media=mode==="audio"?document.createElement("audio"):document.createElement("video");
   media.controls=true;media.src=blobUrl;if(mode==="video"){media.playsInline=true;media.muted=true;}
   preview.append(media);preview.hidden=false;result.hidden=false;
   $("studioRecUse").hidden=mode!=="audio";$("studioRecFilm").hidden=mode!=="video";
   setStatus(mode==="audio"?"Take ready. Add it to Àyàn or save it to your device.":"Video take ready. Preview it, use it in Film or save it to your device.");
   start.disabled=false;stop.disabled=true;clearInterval(ticker);
  };
  recorder.start(250);started=Date.now();start.disabled=true;stop.disabled=false;setStatus(mode==="audio"?"Recording audio…":"Recording video…");
  ticker=setInterval(()=>{const sec=Math.floor((Date.now()-started)/1000);clock.textContent=String(Math.floor(sec/60)).padStart(2,"0")+":"+String(sec%60).padStart(2,"0");},250);
 }catch(e){stopTracks();start.disabled=false;stop.disabled=true;setStatus("Could not start recording: "+(e.message||"Check microphone/camera permission and try again."));}
});
stop.addEventListener("click",()=>{if(recorder&&recorder.state==="recording"){recorder.stop();setStatus("Preparing your take…");}});
$("studioRecSave").addEventListener("click",()=>{if(!blob||!blobUrl)return;const a=document.createElement("a");a.href=blobUrl;a.download=(mode==="audio"?"pennio-voice-take":"pennio-video-take")+(mode==="audio"?".webm":".webm");document.body.append(a);a.click();a.remove();setStatus("Recording saved to your device.");});
$("studioRecUse").addEventListener("click",()=>{if(!blob)return;window.dispatchEvent(new CustomEvent("pennio:recorded-audio",{detail:{blob,name:"Studio voice take"}}));setStatus("Sending your take to Àyàn…");});
$("studioRecFilm").addEventListener("click",()=>{if(!blob||mode!=="video")return;const video=$("filmVideo"),empty=$("filmEmpty"),note=$("filmClipNote");if(!video){setStatus("Open the Film room to use this video take.");return;}const url=URL.createObjectURL(blob);video.src=url;video.hidden=false;video.load();if(empty)empty.hidden=true;if(note)note.textContent="Recorded in PENNIO Studio. This clip stays on this device.";document.querySelectorAll("[data-v]").forEach(b=>{if(b.dataset.v==="faajiplace")b.click();});setStatus("Video added to Film for preview. Save the original take to keep a copy.");});
$("studioRecAgain").addEventListener("click",()=>{clearTake();setStatus("Ready for another take.");});
window.addEventListener("beforeunload",()=>{stopTracks();if(blobUrl)URL.revokeObjectURL(blobUrl);clearInterval(ticker);});
setMode("audio");
})();