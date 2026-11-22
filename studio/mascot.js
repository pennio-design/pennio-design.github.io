/* PENNIO Studio mascot. Headphones on, curls, white tee, orange beanbag. The art is the supplied illustration
   set, cropped to its portrait tiles (studio/art/mascot/*.webp); nothing here draws or edits a face.
   PennioMascot.moment("celebrate", "Track exported.") shows a small card for about three seconds and never blocks a tap.
   Moods map to the moments the Studio has: onboarding, loading, a feature introduction, success. */
(()=>{
const MOODS={
  celebrate:"celebrate", success:"dancing", joy:"joy", listening:"hands-on", listeningClose:"listening-close", lift:"listening-lift",
  composing:"composing", editing:"editing", thinking:"thinking", dreaming:"dreaming", discovery:"discovery",
  browsing:"scrolling", relaxing:"relaxing", profile:"profile", away:"from-behind"
};
const src=m=>"/studio/art/mascot/"+(MOODS[m]||m)+".webp";
let st=document.createElement("style");
st.textContent=".mascot-moment{position:fixed;left:50%;bottom:calc(86px + env(safe-area-inset-bottom,0px));transform:translate(-50%,12px);z-index:90;display:flex;align-items:center;gap:12px;width:max-content;max-width:min(92vw,360px);padding:8px 16px 8px 8px;border-radius:18px;background:#FAF7F3;color:#1E1713;box-shadow:0 14px 40px rgba(0,0,0,.35);opacity:0;pointer-events:none;transition:opacity .25s,transform .25s}"
 +".mascot-moment.on{opacity:1;transform:translate(-50%,0)}"
 +".mascot-moment img{width:72px;height:72px;border-radius:12px;object-fit:cover;flex:none}"
 +".mascot-moment b{display:block;font:800 15px/1.2 Inter,system-ui,sans-serif}.mascot-moment span{display:block;margin-top:3px;font:500 12px/1.3 Inter,system-ui,sans-serif;color:#5b5047}"
 +"@media (prefers-reduced-motion:reduce){.mascot-moment{transition:none}}";
document.head.appendChild(st);
let el=null,timer=0;
function moment(mood,title,sub){
  if(!el){ el=document.createElement("div"); el.className="mascot-moment"; el.setAttribute("role","status"); el.setAttribute("aria-live","polite"); document.body.appendChild(el); }
  el.innerHTML=""; const i=new Image(); i.alt=""; i.src=src(mood); const d=document.createElement("div"), b=document.createElement("b"); b.textContent=title||""; d.appendChild(b);
  if(sub){ const s=document.createElement("span"); s.textContent=sub; d.appendChild(s); }
  el.append(i,d); requestAnimationFrame(()=>el.classList.add("on")); clearTimeout(timer); timer=setTimeout(()=>el.classList.remove("on"),3600);
}
window.PennioMascot={moods:Object.keys(MOODS),src,moment};
})();
