(function(root){
"use strict";
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
const workletLoads=new WeakMap();
const db=v=>Math.pow(10,v/20);
class StudioCleanChain{
 constructor(context,initialState,options={}){
  if(!context||typeof context.createGain!=="function")throw new TypeError("StudioCleanChain needs a BaseAudioContext.");
  this.context=context;this.state={enabled:false,preset:"natural",enhanceAmount:.75,normalizeLufs:true,...initialState};this.disposed=false;this.nodes=[];this.gateNode=options.gateNode||null;
  const make=(factory)=>{const n=factory();this.nodes.push(n);return n;};
  this.input=make(()=>context.createGain());this.output=make(()=>context.createGain());
  this.dry=make(()=>context.createGain());this.wet=make(()=>context.createGain());
  this.input.connect(this.dry);this.dry.connect(this.output);
  let source=this.input;
  const p=root.StudioCleanPresets?.[this.state.preset]||root.StudioCleanPresets?.natural;
  if(!p)throw new Error("Studio Clean presets are unavailable.");
  if(options.gateNode){source.connect(options.gateNode);source=options.gateNode;this.nodes.push(options.gateNode);}
  const hpf=make(()=>context.createBiquadFilter());hpf.type="highpass";hpf.frequency.value=p.highpassHz;hpf.Q.value=.707;source.connect(hpf);source=hpf;
  const box=make(()=>context.createBiquadFilter());box.type="peaking";box.frequency.value=300;box.Q.value=1.4;box.gain.value=p.lowMidCutDb;source.connect(box);source=box;
  const presence=make(()=>context.createBiquadFilter());presence.type="peaking";presence.frequency.value=4200;presence.Q.value=1.1;presence.gain.value=p.presenceBoostDb;source.connect(presence);source=presence;
  const air=make(()=>context.createBiquadFilter());air.type="highshelf";air.frequency.value=10000;air.gain.value=p.airShelfDb;source.connect(air);source=air;
  // Split-band de-esser: the compressed 4.5–9.5 kHz band is recombined with the unaffected low band.
  const low=make(()=>context.createBiquadFilter());low.type="lowpass";low.frequency.value=4500;low.Q.value=.707;
  const high=make(()=>context.createBiquadFilter());high.type="highpass";high.frequency.value=4500;high.Q.value=.707;
  const band=make(()=>context.createBiquadFilter());band.type="lowpass";band.frequency.value=9500;band.Q.value=.707;
  const airBand=make(()=>context.createBiquadFilter());airBand.type="highpass";airBand.frequency.value=9500;airBand.Q.value=.707;
  const deComp=make(()=>context.createDynamicsCompressor());deComp.threshold.value=p.deEsserThresholdDb;deComp.knee.value=3;deComp.ratio.value=6;deComp.attack.value=.002;deComp.release.value=.04;
  const sum=make(()=>context.createGain());source.connect(low);source.connect(high);source.connect(airBand);high.connect(band);band.connect(deComp);low.connect(sum);deComp.connect(sum);airBand.connect(sum);source=sum;
  this.deEsser=deComp;
  // Mid/side width processing. The delayed side signal cancels when L+R is summed to mono.
  if(options.mono){this.widthNode=null;}
  else{
   const splitter=make(()=>context.createChannelSplitter(2)),merger=make(()=>context.createChannelMerger(2));
   const mid=make(()=>context.createGain()),sideL=make(()=>context.createGain()),sideR=make(()=>context.createGain()),sideDelay=make(()=>context.createDelay(.05)),sideBlend=make(()=>context.createGain()),leftSum=make(()=>context.createGain()),rightSum=make(()=>context.createGain());
   source.connect(splitter);splitter.connect(mid,0);splitter.connect(mid,1);mid.gain.value=.5;
   splitter.connect(sideL,0);splitter.connect(sideR,1);sideL.gain.value=.5;sideR.gain.value=-.5;
   sideL.connect(sideDelay);sideR.connect(sideDelay);sideDelay.delayTime.value=.011;sideDelay.connect(sideBlend);sideBlend.gain.value=1;
   mid.connect(leftSum);sideBlend.connect(leftSum);mid.connect(rightSum);
   const invert=make(()=>context.createGain());invert.gain.value=-1;sideBlend.connect(invert);invert.connect(rightSum);
   leftSum.connect(merger,0,0);rightSum.connect(merger,0,1);source=merger;this.widthNode=sideBlend;
  }
  const glue=make(()=>context.createDynamicsCompressor());glue.threshold.value=p.compThresholdDb;glue.knee.value=6;glue.ratio.value=p.compRatio;glue.attack.value=.015;glue.release.value=.12;source.connect(glue);source=glue;
  const makeup=make(()=>context.createGain());makeup.gain.value=db(p.makeupGainDb);source.connect(makeup);source=makeup;
  const limiter=make(()=>context.createDynamicsCompressor());limiter.threshold.value=-1;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=.001;limiter.release.value=.05;source.connect(limiter);limiter.connect(this.wet);this.wet.connect(this.output);
  this.params={hpf,box,presence,air,glue,limiter,makeup};
  this.setState(this.state,0);
 }
 static async create(context,state,options={}){
  let gateNode=null;
  try{if(context.audioWorklet&&typeof AudioWorkletNode!=="undefined"){let loaded=workletLoads.get(context);if(!loaded){loaded=context.audioWorklet.addModule("/studio/audio/dsp/worklets/noiseGateProcessor.js");workletLoads.set(context,loaded);}await loaded;gateNode=new AudioWorkletNode(context,"studio-noise-gate",{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{thresholdDb:(root.StudioCleanPresets?.[state?.preset]||root.StudioCleanPresets?.natural)?.gateThresholdDb??-58}});}}
  catch(e){console.warn("Studio Clean noise gate worklet unavailable; continuing without the gate.",e);}
  return new StudioCleanChain(context,state,{...options,gateNode});
 }
 setState(next={},ramp=.015){
  if(this.disposed)return;this.state={...this.state,...next};const p=root.StudioCleanPresets?.[this.state.preset]||root.StudioCleanPresets.natural,now=this.context.currentTime;
  const set=(param,value)=>{param.cancelScheduledValues(now);param.setTargetAtTime(value,now,Math.max(.001,ramp));};
  set(this.params.hpf.frequency,p.highpassHz);set(this.params.box.gain,p.lowMidCutDb);set(this.params.presence.gain,p.presenceBoostDb);set(this.params.air.gain,p.airShelfDb);
  set(this.deEsser.threshold,p.deEsserThresholdDb);if(this.gateNode?.port)this.gateNode.port.postMessage({thresholdDb:p.gateThresholdDb});set(this.params.glue.threshold,p.compThresholdDb);set(this.params.glue.ratio,p.compRatio);set(this.params.makeup.gain,db(p.makeupGainDb));
  if(this.widthNode)set(this.widthNode.gain,1+(p.stereoWidth*.35));
  const amount=clamp(this.state.enabled?this.state.enhanceAmount:0,0,1);
  set(this.dry.gain,Math.cos(amount*Math.PI/2));set(this.wet.gain,Math.sin(amount*Math.PI/2));
 }
 dispose(){if(this.disposed)return;this.disposed=true;for(const n of this.nodes){try{n.disconnect();}catch(e){}}this.nodes.length=0;}
}
root.StudioCleanChain=StudioCleanChain;
})(window);
