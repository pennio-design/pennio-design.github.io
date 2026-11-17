class StudioNoiseGateProcessor extends AudioWorkletProcessor{
 constructor(options){super();const p=options?.processorOptions||{};this.threshold=Math.pow(10,(p.thresholdDb??-58)/20);this.port.onmessage=e=>{if(Number.isFinite(e.data?.thresholdDb))this.threshold=Math.pow(10,e.data.thresholdDb/20);};this.floor=Math.pow(10,(p.floorDb??-36)/20);this.attack=Math.exp(-1/(sampleRate*.008));this.release=Math.exp(-1/(sampleRate*.09));this.envelope=0;this.gain=1;}
 process(inputs,outputs){
  const input=inputs[0],output=outputs[0];if(!input||!input.length||!output||!output.length)return true;
  for(let c=0;c<output.length;c++){const src=input[Math.min(c,input.length-1)],dst=output[c];if(!src){dst.fill(0);continue;}
   for(let i=0;i<dst.length;i++){const x=src[i]||0,level=Math.abs(x),coef=level>this.envelope?this.attack:this.release;this.envelope=coef*this.envelope+(1-coef)*level;
    const target=this.envelope<this.threshold?this.floor:1;const smoothing=target<this.gain?.75:.997;this.gain=target+(this.gain-target)*smoothing;dst[i]=x*this.gain;}
  }return true;
 }
}
registerProcessor("studio-noise-gate",StudioNoiseGateProcessor);
