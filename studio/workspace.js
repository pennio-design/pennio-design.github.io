(function(){
"use strict";
const PROJECTS_KEY="ps.studio.projects.v1",ACTIVE_KEY="ps.studio.activeProject.v1";
const $=id=>document.getElementById(id);
let activeProjectId=null,dbPromise=null,assets=[],roomSwitchPromise=Promise.resolve();
const deletingProjects=new Set(),pendingAssetWrites=new Map();
const roomNames={ayan:"Àyàn",write:"Akéwì",faajiplace:"Fàájíplace",beauty:"Model / Beauty"};
function readProjects(){try{const v=JSON.parse(localStorage.getItem(PROJECTS_KEY)||"[]");return Array.isArray(v)?v:[]}catch(e){return[]}}
function openDB(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  if(!window.indexedDB){reject(Error("This browser does not support local media storage."));return;}
  const req=indexedDB.open("pennio-studio-workspace",2);
  req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains("assets")){const store=d.createObjectStore("assets",{keyPath:"id"});store.createIndex("projectId","projectId",{unique:false});store.createIndex("created","created",{unique:false});}if(!d.objectStoreNames.contains("sessions"))d.createObjectStore("sessions",{keyPath:"projectId"});if(!d.objectStoreNames.contains("sessionAudio")){const a=d.createObjectStore("sessionAudio",{keyPath:"id"});a.createIndex("projectId","projectId",{unique:false});}const cursor=req.transaction.objectStore("assets").openCursor();cursor.onsuccess=()=>{const item=cursor.result;if(!item)return;const value=item.value;if(!value.projectId){value.projectId="__studio_default__";item.update(value);}item.continue();};};
  req.onblocked=()=>reject(Error("Close other PENNIO Studio tabs to finish updating local project storage."));req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();dbPromise=null;};resolve(db);};req.onerror=()=>reject(req.error||Error("Could not open Studio media storage."));
 });
 return dbPromise;
}
async function storeAsset(detail){
 if(!detail||!detail.blob||!detail.blob.size)return null;
 const projectId=detail.projectId||activeProjectId||"__studio_default__";
 if(deletingProjects.has(projectId))throw Error("This project is being deleted. Start a new project before saving more media.");
 const previous=pendingAssetWrites.get(projectId)||Promise.resolve();
 const operation=previous.catch(()=>{}).then(async()=>{
  if(deletingProjects.has(projectId))throw Error("This project is being deleted. Start a new project before saving more media.");
  await checkAssetCapacity(detail.blob);
  const d=await openDB(),asset={id:"m"+Date.now().toString(36)+Math.random().toString(36).slice(2,7),projectId,name:String(detail.name||"Studio media").slice(0,120),kind:detail.kind||(detail.blob.type.startsWith("video/")?"video":"audio"),type:detail.blob.type||"",size:detail.blob.size,created:Date.now(),blob:detail.blob};
  await new Promise((resolve,reject)=>{const tx=d.transaction("assets","readwrite");tx.objectStore("assets").put(asset);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error("Could not save this media."));});
  await refreshAssets();refreshStorageHealth();window.dispatchEvent(new CustomEvent("pennio:workspace-media-saved",{detail:{id:asset.id,projectId:asset.projectId}}));return asset;
 });
 pendingAssetWrites.set(projectId,operation);
 try{return await operation;}
 finally{if(pendingAssetWrites.get(projectId)===operation)pendingAssetWrites.delete(projectId);}
}
async function flushMediaWrites(){await Promise.all([...pendingAssetWrites.values()].map(p=>p.catch(()=>{})));return true;}
function formatBytes(value){if(!Number.isFinite(value)||value<0)return "—";const units=["B","KB","MB","GB"];let n=value,i=0;while(n>=1024&&i<units.length-1){n/=1024;i++;}return (i===0?Math.round(n):n.toFixed(1))+" "+units[i];}
async function refreshStorageHealth(){const label=$("workspaceStorageLabel"),value=$("workspaceStorageValue"),fill=$("workspaceStorageFill"),note=$("workspaceStorageNote"),button=$("workspaceProtectStorage");if(!label)return;try{const storage=navigator.storage;if(!storage?.estimate){label.textContent="Storage status unavailable";value.textContent="";fill.style.width="0";return;}const [estimate,persisted]=await Promise.all([storage.estimate(),storage.persisted?storage.persisted():Promise.resolve(false)]);const usage=Number(estimate.usage)||0,quota=Number(estimate.quota)||0,pct=quota?Math.min(100,usage/quota*100):0;label.textContent=pct>=90?"Storage nearly full":pct>=75?"Storage getting tight":"Local storage";value.textContent=quota?formatBytes(usage)+" / "+formatBytes(quota):formatBytes(usage)+" used";fill.style.width=pct.toFixed(1)+"%";fill.style.background=pct>=90?"#dc5b42":pct>=75?"#d69b36":"#ff6a00";if(persisted){button.hidden=true;note.textContent="This browser protects the site’s local data from routine storage cleanup. Backups are still required.";}else{button.hidden=false;note.textContent="Studio media and sessions live on this device. Download backups before clearing browser data or changing devices.";}}catch(error){label.textContent="Could not check storage";value.textContent="";note.textContent="Keep a current backup outside this device.";}}
async function checkAssetCapacity(blob){try{const estimate=await navigator.storage?.estimate?.();if(estimate&&Number.isFinite(estimate.quota)&&estimate.quota>0){const remaining=estimate.quota-(Number(estimate.usage)||0);if(blob.size>remaining*.98)throw Error("This recording may exceed the available browser storage. Download a backup, free device storage or use a smaller file.");}}catch(error){if(error&&error.message&&error.message.startsWith("This recording"))throw error;}}
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
 if(project&&deletingProjects.has(project.id))project=null;
 const previous=activeProjectId;activeProjectId=project&&project.id?project.id:null;
 try{if(activeProjectId)localStorage.setItem(ACTIVE_KEY,activeProjectId);else localStorage.removeItem(ACTIVE_KEY);}catch(e){}
 const label=$("workspaceProjectName");if(label)label.textContent=project?project.name:"Studio workspace";
 const select=$("workspaceProjectSelect");if(select&&select.value!==(activeProjectId||""))select.value=activeProjectId||"";
 refreshAssets();
 if(!silent&&activeProjectId!==previous)window.dispatchEvent(new CustomEvent("pennio:workspace-project-open",{detail:{project,previousProjectId:previous}}));
}
function projectById(id){if(deletingProjects.has(id))return null;return readProjects().find(p=>p.id===id)||null;}
function beginProjectDeletion(id){if(id)deletingProjects.add(id);}
function cancelProjectDeletion(id){deletingProjects.delete(id);}
function finishProjectDeletion(id){deletingProjects.delete(id);}
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
 #pennioWorkspaceDock .ws-storage{display:grid;gap:6px;padding:9px 10px;margin:0 0 10px;border:1px solid var(--line,rgba(255,255,255,.15));border-radius:10px;font-size:10px}
 #pennioWorkspaceDock .ws-storage-line{display:flex;justify-content:space-between;gap:8px;align-items:center}
 #pennioWorkspaceDock .ws-storage-meter{height:5px;border-radius:9px;background:var(--line,rgba(255,255,255,.16));overflow:hidden}
 #pennioWorkspaceDock .ws-storage-meter i{display:block;height:100%;width:0;background:#ff6a00;border-radius:9px}
 #pennioWorkspaceDock .ws-storage button{justify-self:start;border:1px solid var(--line,rgba(255,255,255,.2));border-radius:7px;background:transparent;color:inherit;padding:5px 8px;font:inherit}
 #pennioWorkspaceDock[hidden],#pennioWorkspaceDock .ws-body[hidden]{display:none}
 @media(max-width:560px){#pennioWorkspaceDock{right:10px;bottom:10px;width:min(360px,calc(100vw - 20px))}}
 `;
 document.head.append(style);
 const dock=document.createElement("aside");dock.id="pennioWorkspaceDock";dock.innerHTML='<div class="ws-shell"><div class="ws-head"><i class="ws-mark"></i><div class="ws-head-copy"><small>Shared workspace</small><b id="workspaceProjectName">Studio workspace</b></div><button type="button" class="ws-toggle" id="workspaceToggle" aria-expanded="false">Media · 0</button></div><div class="ws-body" id="workspaceBody" hidden><label for="workspaceProjectSelect" style="display:block;font-size:10px;opacity:.65;margin:0 0 5px">ACTIVE PROJECT</label><select class="ws-project" id="workspaceProjectSelect"><option value="">Studio workspace · all media</option></select><div class="ws-storage" id="workspaceStorage" aria-live="polite"><div class="ws-storage-line"><b id="workspaceStorageLabel">Checking device storage…</b><span id="workspaceStorageValue"></span></div><div class="ws-storage-meter"><i id="workspaceStorageFill"></i></div><button type="button" id="workspaceProtectStorage">Protect local work</button><small id="workspaceStorageNote">Studio data stays in this browser. Download backups regularly.</small></div><div class="ws-assets" id="workspaceAssets"><div class="ws-empty">Record or import media in any room. It will appear here for this project.</div></div></div></div>';
 document.body.append(dock);
 $("workspaceToggle").addEventListener("click",()=>{const body=$("workspaceBody"),open=body.hidden;body.hidden=!open;$("workspaceToggle").setAttribute("aria-expanded",String(open));});
 $("workspaceProjectSelect").addEventListener("change",e=>{const p=projectById(e.target.value);setActive(p);});
 $("workspaceProtectStorage").addEventListener("click",async()=>{const button=$("workspaceProtectStorage");button.disabled=true;button.textContent="Checking…";try{if(!navigator.storage?.persist)throw Error("This browser cannot protect local site storage.");const granted=await navigator.storage.persist();button.textContent=granted?"Storage protection enabled":"Protection not granted";$("workspaceStorageNote").textContent=granted?"The browser has agreed to protect this site’s local data from routine storage cleanup. Backups are still required.":"Your browser declined persistent storage. Keep a current backup outside this device."; }catch(error){button.textContent="Protection unavailable";$("workspaceStorageNote").textContent=error.message+" Keep a current backup outside this device.";}finally{button.disabled=false;refreshStorageHealth();}});
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
    if(deletingProjects.has(full.projectId))return;
    const project=projectById(full.projectId);
    if(project)setActive(project);
    else if(full.projectId==="__studio_default__")setActive(null);
    if(full.kind==="video"){
     await window.PennioWorkspace.openRoom("faajiplace");
     window.dispatchEvent(new CustomEvent("pennio:film-media",{detail:{blob:full.blob,name:full.name,assetId:full.id,projectId:full.projectId,kind:"video"}}));
    }else{
     await window.PennioWorkspace.openRoom("ayan");
     window.dispatchEvent(new CustomEvent("pennio:recorded-audio",{detail:{blob:full.blob,name:full.name,workspaceReplay:true,assetId:full.id,projectId:full.projectId}}));
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
   const keep=new Set((record.tracks||[]).map(track=>track.audioKey).filter(Boolean));
   const existing=new Set((req.result||[]).map(item=>item.id));
   (req.result||[]).forEach(item=>{if(!keep.has(item.id))audioStore.delete(item.id);});
   audio.forEach(item=>{if(item.force||!existing.has(item.id))audioStore.put({id:item.id,projectId,blob:item.blob});});
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
async function deleteProjectData(projectId){
 if(!projectId)return;
 deletingProjects.add(projectId);
 const pending=pendingAssetWrites.get(projectId);if(pending)await pending.catch(()=>{});
 const d=await openDB();
 return new Promise((resolve,reject)=>{
  const tx=d.transaction(["assets","sessions","sessionAudio"],"readwrite");
  tx.objectStore("sessions").delete(projectId);
  const assetKeys=tx.objectStore("assets").index("projectId").getAllKeys(projectId);
  assetKeys.onsuccess=()=>assetKeys.result.forEach(key=>tx.objectStore("assets").delete(key));
  const audioKeys=tx.objectStore("sessionAudio").index("projectId").getAllKeys(projectId);
  audioKeys.onsuccess=()=>audioKeys.result.forEach(key=>tx.objectStore("sessionAudio").delete(key));
  tx.oncomplete=()=>{refreshAssets();resolve(true);};
  tx.onerror=()=>reject(tx.error||Error("Could not delete this project’s local media."));
  tx.onabort=()=>reject(tx.error||Error("Project data deletion was interrupted."));
 });
}
async function exportProjectData(projectIds){
 const d=await openDB(),ids=Array.isArray(projectIds)?[...new Set(projectIds)]:await new Promise((resolve,reject)=>{const req=d.transaction("sessions","readonly").objectStore("sessions").getAllKeys();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});
 const allowed=new Set(ids),assets=(await getAssets()).filter(asset=>allowed.has(asset.projectId));
 const sessions=[];for(const id of ids){const session=await loadSession(id);if(session)sessions.push(session);}
 return {assets,sessions};
}
async function importProjectData(data){
 const d=await openDB(),assets=Array.isArray(data&&data.assets)?data.assets:[],sessions=Array.isArray(data&&data.sessions)?data.sessions:[];
 return new Promise((resolve,reject)=>{
  const tx=d.transaction(["assets","sessions","sessionAudio"],"readwrite"),assetStore=tx.objectStore("assets"),sessionStore=tx.objectStore("sessions"),audioStore=tx.objectStore("sessionAudio");
  assets.forEach(asset=>{if(asset&&asset.id&&asset.blob)assetStore.put(asset);});
  sessions.forEach(incoming=>{
   if(!incoming||!incoming.projectId)return;
   const get=sessionStore.get(incoming.projectId);
   get.onsuccess=()=>{
    const current=get.result;if(current&&Number(current.updated||0)>=Number(incoming.updated||0))return;
    const record=Object.assign({},incoming),audio=Array.isArray(record.audio)?record.audio:[];delete record.audio;sessionStore.put(record);
    const keys=audioStore.index("projectId").getAllKeys(incoming.projectId);
    keys.onsuccess=()=>{
     const keep=new Set(audio.map(item=>item.id));
     keys.result.forEach(key=>{if(!keep.has(key))audioStore.delete(key);});
     audio.forEach(item=>{if(item&&item.id&&item.blob)audioStore.put({id:item.id,projectId:incoming.projectId,blob:item.blob});});
    };
   };
  });
  tx.oncomplete=()=>{refreshAssets();resolve({assets:assets.length,sessions:sessions.length});};
  tx.onerror=()=>reject(tx.error||Error("Could not import Studio project data."));
  tx.onabort=()=>reject(tx.error||Error("Studio project import was interrupted."));
 });
}
window.PennioWorkspace={
 get activeProjectId(){return activeProjectId;},
 setActiveProject:setActive,
 getProject:projectById,
 listAssets:()=>getAssets(),
 getAsset,
 addAsset:storeAsset,
 saveSession,loadSession,deleteSession,deleteProjectData,exportProjectData,importProjectData,
 refreshProjects:refreshProjectSelect,
 flushMediaWrites,
 beginProjectDeletion,cancelProjectDeletion,finishProjectDeletion,
 openRoom:async room=>{const button=document.querySelector('nav button[data-v="'+room+'"]');if(button)button.click();else window.dispatchEvent(new CustomEvent("pennio:workspace-room-open",{detail:{room}}));await roomSwitchPromise;},
 refresh:refreshAssets
};
window.addEventListener("pennio:workspace-project-open",e=>{
 const p=e.detail&&e.detail.project,previous=activeProjectId;
 if(e.detail&&!Object.prototype.hasOwnProperty.call(e.detail,"previousProjectId"))e.detail.previousProjectId=previous;
 setActive(p||null,true);refreshProjectSelect();
 if(document.getElementById("dawRoom")?.getClientRects().length)roomSwitchPromise=Promise.resolve(window.PennioAyanWorkspace?.open(p||{id:"__studio_default__",name:"Studio workspace",room:"ayan"})).catch(err=>{console.warn("Àyàn project restore:",err);throw err;});
 if(document.getElementById("filmDesk")?.getClientRects().length)roomSwitchPromise=Promise.resolve(window.PennioFilmWorkspace?.restore(p||null)).catch(err=>{console.warn("Film project restore:",err);throw err;});
});
document.addEventListener("click",e=>{
 const button=e.target.closest('nav button[data-v]');
 if(button)window.dispatchEvent(new CustomEvent("pennio:workspace-room-open",{detail:{room:button.dataset.v}}));
});
window.addEventListener("pennio:workspace-room-open",e=>{
 roomSwitchPromise=Promise.resolve();
 const project=activeProjectId?projectById(activeProjectId):null;
 if(e.detail?.room==="ayan")roomSwitchPromise=Promise.resolve(window.PennioAyanWorkspace?.open(project||{id:"__studio_default__",name:"Studio workspace",room:"ayan"})).catch(err=>{console.warn("Àyàn project restore:",err);throw err;});
 if(e.detail?.room==="faajiplace"||e.detail?.room==="film")roomSwitchPromise=Promise.resolve(window.PennioFilmWorkspace?.restore(project)).catch(err=>{console.warn("Film project restore:",err);throw err;});
});
function reportMediaError(error){const raw=error&&error.message||"Browser storage is unavailable.",message=error&&error.name==="QuotaExceededError"?"Device storage is full. Download a Studio backup and free space before recording more media.":raw;console.warn("Studio media save:",error);window.dispatchEvent(new CustomEvent("pennio:workspace-media-error",{detail:{message}}));refreshStorageHealth();}
window.addEventListener("pennio:recorded-audio",e=>{if(e.detail&&e.detail.workspaceReplay)return;storeAsset({...e.detail,kind:"audio"}).catch(reportMediaError);});
window.addEventListener("pennio:studio-media",e=>{storeAsset(e.detail||{}).catch(reportMediaError);});
window.addEventListener("pennio:workspace-media-save",e=>{storeAsset(e.detail||{}).catch(reportMediaError);});
window.addEventListener("pennio:film-media",e=>{const d=e.detail||{};if(!d.blob||d.assetId)return;const kind=d.kind||(d.blob.type.startsWith("audio/")?"audio":"video");storeAsset({...d,kind}).then(asset=>window.dispatchEvent(new CustomEvent("pennio:film-media-saved",{detail:{id:asset.id,name:asset.name,kind:asset.kind,projectId:asset.projectId}}))).catch(reportMediaError);});
buildUI();
const saved=(()=>{try{return localStorage.getItem(ACTIVE_KEY)}catch(e){return null}})();
setActive(projectById(saved)||null);refreshProjectSelect();refreshAssets();refreshStorageHealth();window.addEventListener("storage",refreshStorageHealth);
if(activeProjectId&&["#ayan","#faajiplace","#film"].includes(location.hash))window.dispatchEvent(new CustomEvent("pennio:workspace-room-open",{detail:{room:location.hash.slice(1)}}));
window.dispatchEvent(new CustomEvent("pennio:workspace-ready",{detail:{projectId:activeProjectId}}));
})();