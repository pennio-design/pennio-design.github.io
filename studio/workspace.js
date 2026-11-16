(function(){
"use strict";
const PROJECTS_KEY="ps.studio.projects.v1",ACTIVE_KEY="ps.studio.activeProject.v1";
const $=id=>document.getElementById(id);
let activeProjectId=null,dbPromise=null,assets=[];
const roomNames={ayan:"Àyàn",write:"Akéwì",faajiplace:"Fàájíplace",beauty:"Model / Beauty"};
function readProjects(){try{const v=JSON.parse(localStorage.getItem(PROJECTS_KEY)||"[]");return Array.isArray(v)?v:[]}catch(e){return[]}}
function openDB(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  if(!window.indexedDB){reject(Error("This browser does not support local media storage."));return;}
  const req=indexedDB.open("pennio-studio-workspace",2);
  req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains("assets")){const store=d.createObjectStore("assets",{keyPath:"id"});store.createIndex("projectId","projectId",{unique:false});store.createIndex("created","created",{unique:false});}if(!d.objectStoreNames.contains("sessions"))d.createObjectStore("sessions",{keyPath:"projectId"});if(!d.objectStoreNames.contains("sessionAudio")){const a=d.createObjectStore("sessionAudio",{keyPath:"id"});a.createIndex("projectId","projectId",{unique:false});}};
  req.onblocked=()=>reject(Error("Close other PENNIO Studio tabs to finish updating local project storage."));req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();dbPromise=null;};resolve(db);};req.onerror=()=>reject(req.error||Error("Could not open Studio media storage."));
 });
 return dbPromise;
}
async function storeAsset(detail){
 if(!detail||!detail.blob||!detail.blob.size)return null;
 const d=await openDB(),asset={id:"m"+Date.now().toString(36)+Math.random().toString(36).slice(2,7),projectId:activeProjectId||null,name:String(detail.name||"Studio media").slice(0,120),kind:detail.kind||(detail.blob.type.startsWith("video/")?"video":"audio"),type:detail.blob.type||"",size:detail.blob.size,created:Date.now(),blob:detail.blob};
 await new Promise((resolve,reject)=>{const tx=d.transaction("assets","readwrite");tx.objectStore("assets").put(asset);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error("Could not save this media."));});
 await refreshAssets();window.dispatchEvent(new CustomEvent("pennio:workspace-media-saved",{detail:{id:asset.id,projectId:asset.projectId}}));return asset;
}
async function getAssets(){
 const d=await openDB();
 return new Promise((resolve,reject)=>{const tx=d.transaction("assets","readonly"),req=tx.objectStore("assets").getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});
}
async function getAsset(id){
 const d=await openDB();
 return new Promise((resolve,reject)=>{const req=d.transaction("assets","readonly").objectStore("assets").get(id);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});
}
async function deleteAsset(id){
 const d=await openDB();await new Promise((resolve,reject)=>{const tx=d.transaction("assets","readwrite");tx.objectStore("assets").delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});await refreshAssets();
}
function setActive(project,silent){
 const previous=activeProjectId;activeProjectId=project&&project.id?project.id:null;
 try{if(activeProjectId)localStorage.setItem(ACTIVE_KEY,activeProjectId);else localStorage.removeItem(ACTIVE_KEY);}catch(e){}
 const label=$("workspaceProjectName");if(label)label.textContent=project?project.name:"Studio workspace";
 const select=$("workspaceProjectSelect");if(select&&select.value!==(activeProjectId||""))select.value=activeProjectId||"";
 refreshAssets();
 if(!silent&&activeProjectId!==previous)window.dispatchEvent(new CustomEvent("pennio:workspace-project-open",{detail:{project,previousProjectId:previous}}));
}
function projectById(id){return readProjects().find(p=>p.id===id)||null;}
function buildUI(){
 if($("pennioWorkspaceDock"))return;
 const style=document.createElement("style");
 style.textContent=`
 #pennioWorkspaceDock{position:fixed;z-index:9000;right:16px;bottom:16px;width:min(390px,calc(100vw - 24px));color:var(--text,#f5f3ef);font:inherit}
 #pennioWorkspaceDock .ws-shell{background:var(--panel,#171717);border:1px solid var(--line,rgba(255,255,255,.16));border-radius:16px;box-shadow:0 12px 48px #0005;overflow:hidden}
 #pennioWorkspaceDock .ws-head{display:flex;align-items:center;gap:9px;padding:11px 13px}
 #pennioWorkspaceDock .ws-mark{width:8px;height:8px;border-radius:50%;background:#ff6a00;flex:none}
 #pennioWorkspaceDock .ws-head-copy{min-width:0;flex:1}
 #pennioWorkspaceDock .ws-head-copy small{display:block;font-size:9px;letter-spacing:.12em;opacity:.58;text-transform:uppercase}
 #pennioWorkspaceDock .ws-head-copy b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 #pennioWorkspaceDock button,#pennioWorkspaceDock select{font:inherit;color:inherit}
 #pennioWorkspaceDock .ws-toggle{border:1px solid var(--line,rgba(255,255,255,.16));background:transparent;border-radius:9px;padding:7px 9px;font-size:11px}
 #pennioWorkspaceDock .ws-body{border-top:1px solid var(--line,rgba(255,255,255,.12));padding:11px 13px;max-height:45vh;overflow:auto}
 #pennioWorkspaceDock .ws-project{width:100%;border:1px solid var(--line,rgba(255,255,255,.15));border-radius:9px;background:transparent;padding:9px;margin:0 0 10px;font-size:12px}
 #pennioWorkspaceDock .ws-assets{display:grid;gap:7px}
 #pennioWorkspaceDock .ws-asset{display:flex;align-items:center;gap:9px;padding:9px;border-radius:10px;background:var(--surface,#222);min-width:0}
 #pennioWorkspaceDock .ws-asset-main{min-width:0;flex:1}
 #pennioWorkspaceDock .ws-asset-main b{display:block;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 #pennioWorkspaceDock .ws-asset-main small{display:block;font-size:10px;opacity:.6;margin-top:2px}
 #pennioWorkspaceDock .ws-asset button{border:1px solid var(--line,rgba(255,255,255,.15));background:transparent;border-radius:8px;padding:6px 8px;font-size:10px;white-space:nowrap}
 #pennioWorkspaceDock .ws-empty{font-size:11px;line-height:1.5;opacity:.65;padding:8px 2px}
 #pennioWorkspaceDock[hidden],#pennioWorkspaceDock .ws-body[hidden]{display:none}
 @media(max-width:560px){#pennioWorkspaceDock{right:10px;bottom:10px;width:min(360px,calc(100vw - 20px))}}
 `;
 document.head.append(style);
 const dock=document.createElement("aside");dock.id="pennioWorkspaceDock";dock.innerHTML='<div class="ws-shell"><div class="ws-head"><i class="ws-mark"></i><div class="ws-head-copy"><small>Shared workspace</small><b id="workspaceProjectName">Studio workspace</b></div><button type="button" class="ws-toggle" id="workspaceToggle" aria-expanded="false">Media · 0</button></div><div class="ws-body" id="workspaceBody" hidden><label for="workspaceProjectSelect" style="display:block;font-size:10px;opacity:.65;margin:0 0 5px">ACTIVE PROJECT</label><select class="ws-project" id="workspaceProjectSelect"><option value="">Studio workspace · all media</option></select><div class="ws-assets" id="workspaceAssets"><div class="ws-empty">Record or import media in any room. It will appear here for this project.</div></div></div></div>';
 document.body.append(dock);
 $("workspaceToggle").addEventListener("click",()=>{const body=$("workspaceBody"),open=body.hidden;body.hidden=!open;$("workspaceToggle").setAttribute("aria-expanded",String(open));});
 $("workspaceProjectSelect").addEventListener("change",e=>{const p=projectById(e.target.value);setActive(p);});
}
async function refreshAssets(){
 if(!$("workspaceAssets"))return;
 try{
  assets=(await getAssets()).filter(a=>!activeProjectId||a.projectId===activeProjectId).sort((a,b)=>b.created-a.created);
  $("workspaceToggle").textContent="Media · "+assets.length;
  const host=$("workspaceAssets");host.replaceChildren();
  if(!assets.length){const empty=document.createElement("div");empty.className="ws-empty";empty.textContent="Record or import media in any room. It will appear here for this project.";host.append(empty);return;}
  assets.slice(0,30).forEach(asset=>{
   const row=document.createElement("div");row.className="ws-asset";
   const copy=document.createElement("div");copy.className="ws-asset-main";
   const name=document.createElement("b");name.textContent=asset.name;
   const meta=document.createElement("small");meta.textContent=(asset.kind==="video"?"Video":"Audio")+" · "+new Date(asset.created).toLocaleString();
   copy.append(name,meta);
   const action=document.createElement("button");action.type="button";action.textContent=asset.kind==="video"?"Film":"Àyàn";
   action.addEventListener("click",async()=>{
    const full=await getAsset(asset.id);if(!full)return;
    if(full.kind==="video"){
     window.dispatchEvent(new CustomEvent("pennio:film-media",{detail:{blob:full.blob,name:full.name,assetId:full.id}}));
     const nav=document.querySelector('nav button[data-v="faajiplace"]');if(nav)nav.click();else location.hash="faajiplace";
    }else{
     window.dispatchEvent(new CustomEvent("pennio:recorded-audio",{detail:{blob:full.blob,name:full.name,workspaceReplay:true,assetId:full.id}}));
     const nav=document.querySelector('nav button[data-v="ayan"]');if(nav)nav.click();else location.hash="ayan";
    }
   });
   const save=document.createElement("button");save.type="button";save.textContent="Save";
   save.addEventListener("click",async()=>{const full=await getAsset(asset.id);if(!full)return;const url=URL.createObjectURL(full.blob),a=document.createElement("a");a.href=url;a.download=asset.name.replace(/[^a-z0-9-_]+/gi,"-")+"."+(full.kind==="video"?"webm":"wav");a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);});
   row.append(copy,action,save);host.append(row);
  });
 }catch(e){const host=$("workspaceAssets");if(host){host.textContent="Local media storage is unavailable in this browser.";}}
}
function refreshProjectSelect(){
 const select=$("workspaceProjectSelect");if(!select)return;
 const current=activeProjectId;select.replaceChildren();
 const all=document.createElement("option");all.value="";all.textContent="Studio workspace · all media";select.append(all);
 readProjects().forEach(p=>{const option=document.createElement("option");option.value=p.id;option.textContent=p.name;select.append(option);});
 select.value=current||"";
}
async function saveSession(projectId,session){
 if(!projectId||!session)return false;
 const d=await openDB(),audio=Array.isArray(session.audio)?session.audio:[];
 const record=Object.assign({projectId,updated:Date.now()},session);delete record.audio;
 return new Promise((resolve,reject)=>{
  const tx=d.transaction(["sessions","sessionAudio"],"readwrite");
  tx.objectStore("sessions").put(record);
  const audioStore=tx.objectStore("sessionAudio"),req=audioStore.index("projectId").getAll(projectId);
  req.onsuccess=()=>{
   const keep=new Set(audio.map(x=>x.id));
   (req.result||[]).forEach(x=>{if(!keep.has(x.id))audioStore.delete(x.id);});
   audio.forEach(x=>audioStore.put({id:x.id,projectId,blob:x.blob}));
  };
  req.onerror=()=>{try{tx.abort();}catch(e){}};
  tx.oncomplete=()=>resolve(true);
  tx.onerror=()=>reject(tx.error||Error("Could not save this session."));
  tx.onabort=()=>reject(tx.error||Error("Session save was interrupted."));
 });
}
async function loadSession(projectId){
 if(!projectId)return null;
 const d=await openDB();
 return new Promise((resolve,reject)=>{
  const tx=d.transaction(["sessions","sessionAudio"],"readonly");
  const req=tx.objectStore("sessions").get(projectId),audioReq=tx.objectStore("sessionAudio").index("projectId").getAll(projectId);
  let record=null,audio=null;
  req.onsuccess=()=>{record=req.result||null;if(audio!==null&&record)resolve(Object.assign(record,{audio}));};
  audioReq.onsuccess=()=>{audio=audioReq.result||[];if(record)resolve(Object.assign(record,{audio}));};
  tx.onerror=()=>reject(tx.error||Error("Could not open this session."));
  tx.oncomplete=()=>{if(!record)resolve(null);};
 });
}
async function deleteSession(projectId){
 if(!projectId)return;
 const d=await openDB();
 return new Promise((resolve,reject)=>{
  const tx=d.transaction(["sessions","sessionAudio"],"readwrite");
  tx.objectStore("sessions").delete(projectId);
  const req=tx.objectStore("sessionAudio").index("projectId").getAllKeys(projectId);
  req.onsuccess=()=>req.result.forEach(key=>tx.objectStore("sessionAudio").delete(key));
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
 });
}
window.PennioWorkspace={
 get activeProjectId(){return activeProjectId;},
 setActiveProject:setActive,
 listAssets:()=>getAssets(),
 getAsset,
 addAsset:storeAsset,
 saveSession,loadSession,deleteSession,
 refresh:refreshAssets
};
window.addEventListener("pennio:workspace-project-open",e=>{
 const p=e.detail&&e.detail.project,previous=activeProjectId;
 if(e.detail&&!Object.prototype.hasOwnProperty.call(e.detail,"previousProjectId"))e.detail.previousProjectId=previous;
 setActive(p||null,true);refreshProjectSelect();
 if(p&&document.getElementById("dawRoom")?.getClientRects().length)window.PennioAyanWorkspace?.open(p).catch(err=>console.warn("Àyàn project restore:",err));
 if(p&&document.getElementById("filmDesk")?.getClientRects().length)window.PennioFilmWorkspace?.restore(p).catch(err=>console.warn("Film project restore:",err));
});
document.addEventListener("click",e=>{
 const button=e.target.closest('nav button[data-v]');
 if(button)window.dispatchEvent(new CustomEvent("pennio:workspace-room-open",{detail:{room:button.dataset.v}}));
});
window.addEventListener("pennio:workspace-room-open",e=>{
 if(e.detail?.room==="ayan"&&activeProjectId){const project=projectById(activeProjectId);if(project)window.PennioAyanWorkspace?.open(project).catch(err=>console.warn("Àyàn project restore:",err));}
 if((e.detail?.room==="faajiplace"||e.detail?.room==="film")&&activeProjectId){const project=projectById(activeProjectId);if(project)window.PennioFilmWorkspace?.restore(project).catch(err=>console.warn("Film project restore:",err));}
});
window.addEventListener("pennio:recorded-audio",e=>{if(e.detail&&e.detail.workspaceReplay)return;storeAsset({...e.detail,kind:"audio"}).catch(err=>console.warn("Studio media save:",err));});
window.addEventListener("pennio:studio-media",e=>{storeAsset(e.detail||{}).catch(err=>console.warn("Studio media save:",err));});
window.addEventListener("pennio:film-media",e=>{const d=e.detail||{};if(!d.blob||d.assetId)return;const kind=d.kind||(d.blob.type.startsWith("audio/")?"audio":"video");storeAsset({...d,kind}).then(asset=>window.dispatchEvent(new CustomEvent("pennio:film-media-saved",{detail:{id:asset.id,name:asset.name,kind:asset.kind}}))).catch(err=>console.warn("Studio media save:",err));});
buildUI();
const saved=(()=>{try{return localStorage.getItem(ACTIVE_KEY)}catch(e){return null}})();
setActive(projectById(saved)||null);refreshProjectSelect();refreshAssets();
if(activeProjectId&&["#ayan","#faajiplace","#film"].includes(location.hash))window.dispatchEvent(new CustomEvent("pennio:workspace-room-open",{detail:{room:location.hash.slice(1)}}));
window.dispatchEvent(new CustomEvent("pennio:workspace-ready",{detail:{projectId:activeProjectId}}));
})();