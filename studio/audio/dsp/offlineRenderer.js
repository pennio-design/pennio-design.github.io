(function(root){
"use strict";
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function biquad(data,b,a){const out=new Float32Array(data.length);let x1=0,x2=0,y1=0,y2=0;for(let i=0;i<data.length;i++){const x=data[i];const y=b[0]*x+b[1]*x1+b[2]*x2-a[1]*y1-a[2]*y2;out[i]=y;x2=x1;x1=x;y2=y1;y1=y;}return out;}
function kWeight(data,rate){
 const f=1681.974450955533,dbGain=3.999843853973347,Q=.7071752369554196,K=Math.tan(Math.PI*f/rate),Vh=Math.pow(10,dbGain/20),Vb=Math.pow(Vh,.4996667741545416),a0=1+K/Q+K*K;
 const shelfB=[(Vh+Vb*K/Q+K*K)/a0,2*(K*K-Vh)/a0,(Vh-Vb*K/Q+K*K)/a0],shelfA=[1,2*(K*K-1)/a0,(1-K/Q+K*K)/a0];
 const shelf=biquad(data,shelfB,shelfA);
 const f2=38.13547087602444,Q2=.5003270373238773,K2=Math.tan(Math.PI*f2/rate),a02=1+K2/Q2+K2*K2;
 return biquad(shelf,[1,-2,1],[1,2*(K2*K2-1)/a02,(1-K2/Q2+K2*K2)/a02]);
}
function measureIntegratedLufs(buffer){
 const rate=buffer.sampleRate,channels=Array.from({length:buffer.numberOfChannels},(_,c)=>kWeight(buffer.getChannelData(c),rate)),block=Math.max(1,Math.floor(rate*.4)),energies=[];
 for(let start=0;start<buffer.length;start+=block){const end=Math.min(buffer.length,start+block);let energy=0;for(const channel of channels){let sum=0;for(let i=start;i<end;i++)sum+=channel[i]*channel[i];energy+=sum/Math.max(1,end-start);}if(energy>1e-7)energies.push(energy);}
 if(!energies.length)return -Infinity;
 const absGate=energies.filter(e=>-0.691+10*Math.log10(e)>-70);if(!absGate.length)return -Infinity;
 const ungated=absGate.reduce((a,b)=>a+b,0)/absGate.length,relativeGate=ungated*.1,kept=absGate.filter(e=>e>=relativeGate);if(!kept.length)return -Infinity;
 const mean=kept.reduce((a,b)=>a+b,0)/kept.length;return -0.691+10*Math.log10(mean);
}
function estimateTruePeak(channels){let peak=0;for(const data of channels){for(let i=0;i<data.length;i++){const a=data[i],b=data[Math.min(i+1,data.length-1)];peak=Math.max(peak,Math.abs(a));for(let k=1;k<4;k++)peak=Math.max(peak,Math.abs(a+(b-a)*(k/4)));}}return peak;}
function applyBoundaryFades(buffer,fadeSeconds=.015){
 const fade=Math.min(Math.floor(buffer.sampleRate*fadeSeconds),Math.floor(buffer.length/2));
 if(!fade)return buffer;
 for(let c=0;c<buffer.numberOfChannels;c++){const data=buffer.getChannelData(c);for(let i=0;i<fade;i++){const fadeIn=.5-.5*Math.cos(Math.PI*i/fade),fadeOut=.5-.5*Math.cos(Math.PI*(fade-i)/fade);data[i]*=fadeIn;data[data.length-1-i]*=fadeOut;}}
 return buffer;
}
function normalizeAndFade(buffer,targetLufs=-14,peakDb=-1,fadeSeconds=.015){
 const channels=Array.from({length:buffer.numberOfChannels},(_,c)=>buffer.getChannelData(c)),lufs=measureIntegratedLufs(buffer),peak=estimateTruePeak(channels);
 let gain=Number.isFinite(lufs)?Math.pow(10,(targetLufs-lufs)/20):1;const ceiling=Math.pow(10,peakDb/20);if(peak>0)gain=Math.min(gain,ceiling/peak);
 for(const data of channels)for(let i=0;i<data.length;i++)data[i]*=gain;
 applyBoundaryFades(buffer,fadeSeconds);
 return {buffer,measuredLufs:lufs,appliedGain:gain,peakDbfs:peak>0?20*Math.log10(peak*gain):-Infinity};
}
async function renderMix(tracks,options={}){
 const rate=options.sampleRate||44100,seconds=Math.max(.1,options.duration||tracks.reduce((m,t)=>Math.max(m,(t.timeline||0)+t.end-t.start),0)),length=Math.ceil(seconds*rate),Offline=root.OfflineAudioContext||root.webkitOfflineAudioContext;
 if(!Offline)throw new Error("Offline audio rendering is not supported in this browser.");
 const context=new Offline(2,length,rate),sources=[];
 for(const track of tracks){if(track.mute||(options.solo&& !track.solo))continue;const source=context.createBufferSource();source.buffer=track.buffer;const chain=await root.StudioCleanChain.create(context,track.dsp||root.StudioCleanDefaults,{mono:track.buffer.numberOfChannels===1});source.connect(chain.input);chain.output.connect(context.destination);
  const level=context.createGain();level.gain.value=track.gain??1;chain.output.disconnect();chain.output.connect(level);const pan=context.createStereoPanner?context.createStereoPanner():null;if(pan){pan.pan.value=track.pan||0;level.connect(pan);pan.connect(context.destination);}else level.connect(context.destination);
  const elapsed=Math.max(0,(options.offset||0)-(track.timeline||0)),offset=track.start+elapsed,remaining=track.end-offset;if(remaining>0)source.start(Math.max(0,(track.timeline||0)-(options.offset||0)),offset,remaining);sources.push({source,chain});
 }
 const rendered=await context.startRendering();sources.forEach(x=>x.chain.dispose());
 const norm=options.normalize===false?{buffer:applyBoundaryFades(rendered,.015),measuredLufs:measureIntegratedLufs(rendered),appliedGain:1,peakDbfs:null}:normalizeAndFade(rendered,options.targetLufs??-14,-1,.015);
 return {...norm,buffer:rendered};
}
root.StudioCleanOffline={renderMix,measureIntegratedLufs,normalizeAndFade,applyBoundaryFades};
})(window);
