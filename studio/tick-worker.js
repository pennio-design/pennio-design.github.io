/* Playback clock. Timers inside a worker are not delayed by page layout or paint work,
   so the scheduler keeps its beat on slower phones. It only posts a message; the page does the audio. */
let id=0;
self.onmessage=e=>{
  const d=e.data||{};
  if(d.stop){ clearInterval(id); id=0; return; }
  if(d.start){ clearInterval(id); id=setInterval(()=>self.postMessage(1),d.ms||25); }
};
