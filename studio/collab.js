/* Collaboration: share a session with people by email, each with a fixed role.
   Roles decide which section a person can change, and the database enforces it (supabase/migrations/202611230001):
     Producer = beat + mix   Beat maker = beat   Mixer = mix   Viewer = listens only   Owner = everything.
   Beat = pattern, tempo, swing, key and chords. Mix = levels and strip effects.
   Sync is near-live: every 2 s each person's changes to their sections are written with a revision number, and
   other people's newer revisions are applied. If two people changed the same lane or setting, the edit that
   was made on this device wins for that item and everything else is merged. Nothing here shows until the
   migration is applied (the Studio probes for project_members first). Voice recordings and playlist clips are
   not shared in this version. */
(()=>{
const ROLES={
  owner:{label:"Owner",sections:["beat","mix"],note:"Everything"},
  producer:{label:"Producer",sections:["beat","mix"],note:"Beat and mix"},
  beat:{label:"Beat maker",sections:["beat"],note:"Pattern, tempo, swing, key and chords"},
  mixer:{label:"Mixer",sections:["mix"],note:"Levels and strip effects"},
  viewer:{label:"Viewer",sections:[],note:"Listens, cannot edit"}
};
const SECTIONS=["beat","mix"], SECNAME={beat:"Beat",mix:"Mix"};
const pick={ beat:s=>({p:s.p,bank:s.bank,bpm:s.bpm,sw:s.sw,n:s.n,harm:s.harm}), mix:s=>s.mix };
const put=(s,sec,d)=>{ if(sec==="beat"){ s.p=d.p; s.bpm=d.bpm; s.sw=d.sw; s.n=d.n; s.harm=d.harm; if(d.bank) s.bank=d.bank; } else s.mix=d; };
const clone=o=>JSON.parse(JSON.stringify(o===undefined?null:o));
const key=o=>{ const k=v=>v&&typeof v==="object"?(Array.isArray(v)?"["+v.map(k).join(",")+"]":"{"+Object.keys(v).sort().map(x=>JSON.stringify(x)+":"+k(v[x])).join(",")+"}"):JSON.stringify(v===undefined?null:v); return k(o); };
const C=()=>window.PennioCore;
let ready=false, S=null, timer=0, busy=false, members=[], lastMembers=0, lastTouch=0, ownerChecked=0, ownerHas=false, suppress=false;

/* items changed here win; everything else comes from the newer remote copy */
function merge(base,local,remote,depth){
  if(!local||typeof local!=="object"||Array.isArray(local)||depth<=0) return key(local)!==key(base)?local:remote;
  const out={}, ks=new Set([...Object.keys(local),...Object.keys(remote||{}),...Object.keys(base||{})]);
  ks.forEach(k=>{ const l=local[k], b=base?base[k]:undefined, r=remote?remote[k]:undefined;
    if(key(l)===key(b)) out[k]=r; else if(key(r)===key(b)) out[k]=l;
    else out[k]=(l&&typeof l==="object"&&!Array.isArray(l)&&depth>1)?merge(b,l,r,depth-1):l; });
  return out;
}
async function api(path,opts){ return C().fetch(path,opts); }
const me=()=>C().user();
const q=()=>"owner_id=eq."+S.owner+"&project_id=eq."+encodeURIComponent(S.pid);
const canWrite=sec=>!!S&&ROLES[S.role].sections.includes(sec);

async function probe(){
  if(ready||!C()||!C().cloud()) return ready;
  try{ const r=await api("/rest/v1/project_members?select=email&limit=1"); if(!r.ok) return false; ready=true;
    try{ await api("/rest/v1/rpc/studio_accept_invites",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}); }catch(e){}
    document.dispatchEvent(new CustomEvent("pennio:collab-ready")); return true;
  }catch(e){ return false; }
}
async function loadMembers(){
  if(!S) return; try{ const r=await api("/rest/v1/project_members?select=email,role,status,seen_at,member_id&"+q()+"&order=invited_at.asc"); if(r.ok){ members=await r.json(); lastMembers=Date.now(); } }catch(e){}
}
async function attach(id){
  S=null; members=[]; paint();
  const rec=await C().getRec(id); if(!rec) return;
  if(rec.collab){ S={id,owner:rec.collab.owner,pid:rec.collab.pid,role:rec.collab.role in ROLES?rec.collab.role:"viewer",rev:{beat:0,mix:0},base:{},hash:{},pending:{}}; }
  else{
    const u=me(); if(!u) return; ownerChecked=Date.now();
    const r=await api("/rest/v1/project_members?select=email&owner_id=eq."+u.id+"&project_id=eq."+encodeURIComponent(id)+"&limit=1"); if(!r.ok) return;
    ownerHas=(await r.json()).length>0; ownerChecked=Date.now(); if(!ownerHas) return;
    S={id,owner:u.id,pid:id,role:"owner",rev:{beat:0,mix:0},base:{},hash:{},pending:{}};
  }
  await loadMembers(); await first(); paint();
}
const localOf=sec=>pick[sec](C().snap());
function applyRemote(sec,data){
  const s=C().snap(); put(s,sec,clone(data)); suppress=true;
  try{ C().applySnap(s); }finally{ suppress=false; }
  const now=localOf(sec); S.base[sec]=clone(now); S.hash[sec]=key(now);
}
async function first(){
  const r=await api("/rest/v1/project_sections?select=section,rev,data&"+q()); if(!r.ok) return;
  const rows=await r.json(), have={}; rows.forEach(x=>have[x.section]=x);
  for(const sec of SECTIONS){
    if(have[sec]){ S.rev[sec]=have[sec].rev; applyRemote(sec,have[sec].data); }
    else{ const d=localOf(sec); S.base[sec]=clone(d); S.hash[sec]=key(d);
      if(canWrite(sec)) await insert(sec,d); }
  }
}
async function insert(sec,d){
  const u=me(); const r=await api("/rest/v1/project_sections",{method:"POST",headers:{"Content-Type":"application/json",Prefer:"resolution=ignore-duplicates,return=representation"},
    body:JSON.stringify({owner_id:S.owner,project_id:S.pid,section:sec,data:d,rev:1,updated_by:u.id,updated_by_email:u.email})});
  if(r.ok){ const a=await r.json(); if(a.length){ S.rev[sec]=1; S.base[sec]=clone(d); S.hash[sec]=key(d); } }
}
async function push(sec){
  const d=localOf(sec), u=me(); if(S.rev[sec]===0) return insert(sec,d);
  const r=await api("/rest/v1/project_sections?"+q()+"&section=eq."+sec+"&rev=eq."+S.rev[sec],{method:"PATCH",headers:{"Content-Type":"application/json",Prefer:"return=representation"},
    body:JSON.stringify({data:d,rev:S.rev[sec]+1,updated_by:u.id,updated_by_email:u.email,updated_at:new Date().toISOString()})});
  if(!r.ok) return;
  const a=await r.json();
  if(a.length){ S.rev[sec]=a[0].rev; S.base[sec]=clone(d); S.hash[sec]=key(d); S.pending[sec]=0; }
  else S.pending[sec]=1; /* someone wrote first: the next pull merges, then pushes again */
}
async function tick(){
  if(busy||!S||!C()||!C().cloud()) return; busy=true;
  try{
    const r=await api("/rest/v1/project_sections?select=section,rev,updated_by_email&"+q()); if(!r.ok) return;
    const rows=await r.json();
    for(const row of rows){ const sec=row.section; if(row.rev<=S.rev[sec]) continue;
      const fr=await api("/rest/v1/project_sections?select=data,rev&"+q()+"&section=eq."+sec); if(!fr.ok) continue; const full=(await fr.json())[0]; if(!full) continue;
      const mineChanged=canWrite(sec)&&key(localOf(sec))!==S.hash[sec];
      S.rev[sec]=full.rev;
      if(mineChanged){ const m=merge(S.base[sec],localOf(sec),full.data,2); applyRemote(sec,m); S.hash[sec]=""; S.base[sec]=clone(full.data); await push(sec); }
      else{ applyRemote(sec,full.data); if(row.updated_by_email&&row.updated_by_email!==(me()||{}).email) note(SECNAME[sec]+" updated by "+row.updated_by_email.split("@")[0]); }
    }
    for(const sec of SECTIONS){
      const changed=key(localOf(sec))!==S.hash[sec];
      if(!changed) continue;
      if(canWrite(sec)) await push(sec);
      else{ applyRemote(sec,S.base[sec]); note("The "+SECNAME[sec].toLowerCase()+" is "+ROLES[S.role].label.toLowerCase()+"-locked on this session"); }
    }
    if(Date.now()-lastMembers>8000) await loadMembers();
    if(S.role!=="owner"&&Date.now()-lastTouch>8000){ lastTouch=Date.now(); api("/rest/v1/rpc/studio_touch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({o:S.owner,p:S.pid})}).catch(()=>{}); }
    paint();
  }catch(e){}finally{ busy=false; }
}
let noteT=0; function note(m){ if(Date.now()-noteT<4000) return; noteT=Date.now(); C().toast(m); }

/* ---------- loop: follows whichever session is open ---------- */
async function loop(){
  const c=C(); if(!c||!c.cloud()){ schedule(4000); return; }
  if(!ready&&!(await probe())){ schedule(15000); return; }
  const id=c.currentId();
  if(id&&id!==lastId){ lastId=id; await attach(id); }
  else if(!S&&id&&Date.now()-ownerChecked>20000) await attach(id);
  if(S) await tick();
  schedule(document.hidden?8000:2000);
}
let lastId=""; const schedule=ms=>{ clearTimeout(timer); timer=setTimeout(loop,ms); };

/* ---------- interface ---------- */
const st=document.createElement("style");
st.textContent=`
#collabPill{position:fixed;left:12px;bottom:calc(78px + env(safe-area-inset-bottom,0px));z-index:80;display:none;align-items:center;gap:8px;min-height:40px;max-width:calc(100vw - 24px);padding:0 14px;border-radius:999px;background:#FAF7F3;color:#1E1713;border:0;font:700 12px Inter,system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.35);cursor:pointer}
#collabPill.on{display:inline-flex}#collabPill i{width:8px;height:8px;border-radius:50%;background:#2FB07A;flex:none}#collabPill span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
body.collab-lock-beat #rows,body.collab-lock-beat #harm,body.collab-lock-beat #bpm,body.collab-lock-beat #sw,body.collab-lock-beat #addRows{pointer-events:none;opacity:.45}
body.collab-lock-mix #layers,body.collab-lock-mix #mxInsp{pointer-events:none;opacity:.45}
#collabDlg{width:min(92vw,460px);max-height:86vh;padding:0;border:1px solid var(--border);border-radius:20px;background:var(--surface-1,#141414);color:var(--tp,#f4f1ec);overflow:auto}
#collabDlg::backdrop{background:rgba(0,0,0,.6)}
#collabDlg .cd{display:grid;gap:14px;padding:20px}
#collabDlg h2{margin:0;font-size:18px}#collabDlg p{margin:0;font-size:12.5px;color:var(--ts,#a9a39b);line-height:1.5}
#collabDlg .cd-row{display:flex;gap:8px;flex-wrap:wrap}
#collabDlg input,#collabDlg select{min-height:44px;padding:0 12px;border-radius:12px;border:1px solid var(--border);background:transparent;color:inherit;font:500 14px Inter,system-ui,sans-serif;min-width:0}
#collabDlg input{flex:1 1 180px}
#collabDlg button{min-height:44px;padding:0 16px;border-radius:12px;border:1px solid var(--border);background:transparent;color:inherit;font:700 13px Inter,system-ui,sans-serif;cursor:pointer}
#collabDlg button.pri{background:#F26522;border-color:#F26522;color:#140A04}
#collabDlg .cd-m{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;min-width:0}
#collabDlg .cd-m div{flex:1;min-width:0}#collabDlg .cd-m b{display:block;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#collabDlg .cd-m small{font-size:11px;color:var(--ts,#a9a39b)}
#collabDlg .cd-m select{min-height:40px;font-size:12px}#collabDlg .cd-x{min-height:40px;width:40px;padding:0}
#collabDlg .dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;background:#777}#collabDlg .dot.on{background:#2FB07A}
#collabDlg .cd-roles{display:grid;gap:4px;font-size:12px;color:var(--ts,#a9a39b)}#collabDlg .cd-roles b{color:var(--tp,#f4f1ec)}
`;
document.head.appendChild(st);
const pill=document.createElement("button"); pill.id="collabPill"; pill.type="button"; pill.innerHTML='<i></i><span></span>'; pill.setAttribute("aria-label","Open collaboration");
document.addEventListener("DOMContentLoaded",()=>document.body.appendChild(pill)); if(document.body) document.body.appendChild(pill);
const online=m=>m.seen_at&&Date.now()-Date.parse(m.seen_at)<25000;
function paint(){
  const b=document.body; if(!b) return;
  ["beat","mix"].forEach(sec=>b.classList.toggle("collab-lock-"+sec,!!S&&!canWrite(sec)));
  if(!S){ pill.classList.remove("on"); return; }
  const here=members.filter(online).length+(S.role==="owner"?0:1);
  pill.classList.add("on");
  pill.querySelector("span").textContent=ROLES[S.role].label+" · "+(members.length+1)+" on this session"+(here>1?" · "+here+" here now":"");
}
pill.onclick=()=>openDialog();
function dlg(){
  let d=document.getElementById("collabDlg"); if(d) return d;
  d=document.createElement("dialog"); d.id="collabDlg"; document.body.appendChild(d); d.addEventListener("click",e=>{ if(e.target===d) d.close(); }); return d;
}
async function openDialog(){
  if(!S){ const id=C().currentId(); if(!id) return; const u=me(); if(!u){ C().toast("Sign in to share a session."); return; }
    S={id,owner:u.id,pid:id,role:"owner",rev:{beat:0,mix:0},base:{},hash:{},pending:{}}; await loadMembers(); await first(); paint(); schedule(500); }
  await loadMembers(); render(dlg()); dlg().showModal();
}
function render(d){
  const owner=S.role==="owner", name=C().sessionName();
  const roleOpts=sel=>["producer","beat","mixer","viewer"].map(r=>'<option value="'+r+'"'+(r===sel?" selected":"")+'>'+ROLES[r].label+'</option>').join("");
  d.innerHTML='<div class="cd"><h2></h2><p></p>'+
   (owner?'<div class="cd-row"><input type="email" id="cdEmail" placeholder="Their email" autocomplete="off" maxlength="120" aria-label="Email of the person to invite"><select id="cdRole" aria-label="Role">'+roleOpts("beat")+'</select><button class="pri" id="cdInvite" type="button">Invite</button></div>'+
     '<p id="cdMsg">They sign in to the Studio with that email and the session appears under Shared with me. No email is sent from here, so tell them.</p>':'')+
   '<div id="cdList" style="display:grid;gap:8px"></div>'+
   '<div class="cd-roles"><span><b>Producer</b> beat and mix</span><span><b>Beat maker</b> pattern, tempo, swing, key, chords</span><span><b>Mixer</b> levels and strip effects</span><span><b>Viewer</b> listens only</span></div>'+
   '<p>Voice recordings and Playlist clips are not shared yet. Changes sync about every two seconds.</p>'+
   '<div class="cd-row"><button id="cdClose" type="button">Close</button></div></div>';
  d.querySelector("h2").textContent="Share “"+name+"”";
  d.querySelector("p").textContent=owner?"People you invite can open this session and change only the sections their role covers.":"You are "+ROLES[S.role].label+" on this session: "+ROLES[S.role].note+".";
  const list=d.querySelector("#cdList");
  if(!members.length) list.innerHTML='<p>No one else is on this session yet.</p>';
  members.forEach(m=>{ const row=document.createElement("div"); row.className="cd-m";
    row.innerHTML='<div><b></b><small></small></div>'+(owner?'<select aria-label="Role">'+roleOpts(m.role)+'</select><button class="cd-x" type="button" aria-label="Remove">×</button>':'<small></small>');
    row.querySelector("b").textContent=m.email;
    row.querySelector("small").innerHTML='<span class="dot'+(online(m)?" on":"")+'"></span>'+(m.status==="active"?(online(m)?"Here now":"Joined"):"Invited, not joined yet");
    if(owner){ row.querySelector("select").onchange=async e=>{ await api("/rest/v1/project_members?"+q()+"&email=eq."+encodeURIComponent(m.email),{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({role:e.target.value})}); await loadMembers(); render(d); };
      row.querySelector(".cd-x").onclick=async()=>{ await api("/rest/v1/project_members?"+q()+"&email=eq."+encodeURIComponent(m.email),{method:"DELETE"}); await loadMembers(); render(d); paint(); };
    } else row.lastElementChild.textContent=ROLES[m.role]?ROLES[m.role].label:m.role;
    list.append(row); });
  d.querySelector("#cdClose").onclick=()=>d.close();
  if(owner) d.querySelector("#cdInvite").onclick=async()=>{
    const email=d.querySelector("#cdEmail").value.trim().toLowerCase(), msg=d.querySelector("#cdMsg");
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ msg.textContent="Enter a valid email address."; return; }
    if(email===(me().email||"").toLowerCase()){ msg.textContent="That is your own email."; return; }
    const r=await api("/rest/v1/project_members",{method:"POST",headers:{"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({owner_id:S.owner,project_id:S.pid,email,role:d.querySelector("#cdRole").value})});
    if(!r.ok){ msg.textContent="Could not invite. Try again."; return; }
    await loadMembers(); render(d); paint(); await first(); schedule(500);
  };
}
/* a Share button beside the current session's actions, and the Shared with me list on the dashboard */
function addShare(){
  const cs=document.getElementById("curSess"); if(!cs) return;
  const row=cs.querySelector(".crow"); if(!row||row.querySelector("#csShare")||!ready) return;
  const b=document.createElement("button"); b.className="btn"; b.id="csShare"; b.type="button"; b.textContent="Share"; b.onclick=()=>openDialog(); row.append(b);
}
document.addEventListener("DOMContentLoaded",()=>{ const cs=document.getElementById("curSess"); if(cs) new MutationObserver(addShare).observe(cs,{childList:true,subtree:true}); });
document.addEventListener("pennio:collab-ready",()=>{ addShare(); sharedList(); });
async function sharedList(){
  const blk=document.getElementById("dhSharedBlock"), wrap=document.getElementById("dhShared"); if(!blk||!ready) return; const u=me(); if(!u) return;
  try{
    const r=await api("/rest/v1/project_members?select=owner_id,project_id,role&member_id=eq."+u.id+"&status=eq.active"); if(!r.ok) return; const ms=await r.json();
    wrap.replaceChildren(); blk.hidden=!ms.length;
    for(const m of ms){
      const pr=await api("/rest/v1/projects?select=name,updated_at,state&user_id=eq."+m.owner_id+"&id=eq."+encodeURIComponent(m.project_id)); if(!pr.ok) continue; const row=(await pr.json())[0]; if(!row) continue;
      const b=document.createElement("button"); b.type="button"; b.className="dh-card";
      b.innerHTML='<span class="dh-thumb"></span><b></b><small></small>'; b.querySelector("b").textContent=row.name||"Shared session";
      b.querySelector("small").innerHTML=""; b.querySelector("small").textContent=(ROLES[m.role]||ROLES.viewer).label+" · shared with me";
      b.onclick=async()=>{ b.disabled=true; try{ await openShared(m,row); }finally{ b.disabled=false; } };
      wrap.append(b);
    }
  }catch(e){}
}
async function openShared(m,row){
  const id="sh_"+m.owner_id.slice(0,8)+"_"+m.project_id; let rec=await C().getRec(id);
  const state=row.state?clone(row.state):null; if(state) delete state._meta;
  if(!rec) rec={id,name:row.name||"Shared session",created:Date.now(),updated:Date.now(),state,audio:null};
  rec.collab={owner:m.owner_id,pid:m.project_id,role:m.role}; if(!rec.state) rec.state=state;
  await C().putRec(rec); await C().openRec(rec);
  const btn=document.querySelector('nav button[data-v="ayan"]'); if(btn) btn.click();
}
setInterval(()=>{ const h=document.getElementById("v-home"); if(ready&&h&&h.classList.contains("on")&&!document.hidden) sharedList(); },5000);
window.PennioCollab={open:openDialog,ready:()=>ready,role:()=>S&&S.role,members:()=>members.slice(),state:()=>S,tick,merge,ROLES};
addEventListener("load",()=>schedule(1500));
})();
