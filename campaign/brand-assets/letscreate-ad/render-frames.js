const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await (await b.newContext({viewport:{width:1080,height:1920},deviceScaleFactor:1})).newPage();
 await p.goto('file:///home/user/pennio-design.github.io/campaign/brand-assets/letscreate-ad/ad.html');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(800);
 const FPS=30,N=15*FPS,t0=Date.now();
 for(let f=0;f<N;f++){const t=f/FPS;await p.evaluate(t=>render(t),t);
  await p.screenshot({path:`adframes/f_${String(f).padStart(4,'0')}.jpg`,type:'jpeg',quality:95});
  if(f%75===0)console.log('frame',f,'/',N,((Date.now()-t0)/1000).toFixed(0)+'s');}
 console.log('done',((Date.now()-t0)/1000).toFixed(0)+'s');await b.close();})();
