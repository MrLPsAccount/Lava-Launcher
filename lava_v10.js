/* Lava Desktop v0.10 — local import, banners, screenshots and authenticated direct launching. */
const lavaBannerCatalog = [
 'Rainy Jungle','Emerald Wetlands','Winter Campfire','Trial Chamber',
 'The Crimson Trail','Mountain Sunrise','Crystal Explorer','Forest Adventure',
 'Twilight Wilderness','Sunlit Birch Forest','Skybound Valley','Golden Marsh',
 'Rosewood Village','Lush Caverns','Coral Sanctuary','Deep Blue Reef'
].map((name,i)=>({id:String(i+1).padStart(2,'0'),name,path:`assets/banners/${String(i+1).padStart(2,'0')}.jpg`}));
let lavaLocalVersions = [];
let lavaShotList = [];
let lavaShotDate = '';
let lavaShotSearch = '';
let lavaShotPending = false;

function lavaBannerPath(id){
 if(id==='hypixel')return 'assets/banners/hypixel.jpg';
 return lavaBannerCatalog.find(x=>x.id===String(id))?.path || 'assets/banners/01.jpg';
}
function lavaBannerDefault(entry){
 const value=String(entry.x.address||entry.x.folder||entry.x.name||'Minecraft');
 let hash=0;for(const letter of value)hash=(Math.imul(hash,31)+letter.charCodeAt(0))>>>0;
 return lavaBannerCatalog[hash%lavaBannerCatalog.length].path;
}

async function lavaImportInstalled(){
 const r=await lavaCall('discover_installed');
 if(!r.ok)throw Error(r.error||'No local Minecraft installation was found.');
 lavaLocalVersions=r.versions||[];
 // Keep user-managed entries and preserve favorites/banners on repeated imports.
 for(const [collection,ident] of [['servers','address'],['worlds','folder'],['modpacks','profileId']]){
   const existing=db[collection]||[];
   const user=existing.filter(x=>x.source!=='minecraft');
   const previous=new Map(existing.filter(x=>x.source==='minecraft').map(x=>[String(x[ident]||x.name).toLowerCase(),x]));
   for(const item of (r[collection]||[])){
     const key=String(item[ident]||item.name).toLowerCase();
     if(collection==='servers'&&user.some(x=>String(x.address||'').toLowerCase()===key))continue;
     const old=previous.get(key)||{};
     user.push({...item,favorite:!!old.favorite,lastViewed:old.lastViewed||0,
               ...(old.banner?{banner:old.banner}:{}),...(old.bannerId?{bannerId:old.bannerId}:{})});
   }
   db[collection]=user;
 }
 db.installedMinecraftConnected=true;
 save();
 localStorage.setItem('lava-connected-installation','yes');
 lavaRefreshProfileButton();
 selected=null;page='library';libCategory='all';render();
 return r;
}

function lavaOpenLocalChoice(){
 lavaModalOpen('Connect Minecraft','LAVA / ACCOUNT & LOCAL FILES',`<div class="lava-modal-body">
 <p class="lava-desc">Discover worlds, server addresses, installation profiles, versions and screenshots from your existing .minecraft folder. Your files won't be moved or changed by importing them.</p>
 <div class="lava-play-choices"><button class="lava-choice" id="lava-connect-local"><b>USE INSTALLED MINECRAFT</b><span>Scan .minecraft and add your existing content to Lava</span></button>
 <button class="lava-choice" id="lava-connect-ms"><b>SIGN IN WITH MICROSOFT</b><span>Required for authenticated multiplayer and real Minecraft sessions</span></button></div>
 <div class="lava-hint">Local file discovery does not grant an authenticated Minecraft account. Multiplayer Join requires Microsoft sign-in through Lava.</div>
 <p class="lava-alert-message" id="lava-import-message"></p></div>`);
 lavaEl('lava-connect-ms').onclick=lavaOpenLogin;
 lavaEl('lava-connect-local').onclick=async()=>{
   const label=lavaEl('lava-import-message');const btn=lavaEl('lava-connect-local');btn.disabled=true;
   label.textContent='Scanning installed Minecraft files…';
   try{const r=await lavaImportInstalled();lavaCloseModal();lavaMessage(`Imported ${r.worlds.length} worlds, ${r.servers.length} servers and ${r.modpacks.length} launcher profiles.`);}
   catch(err){label.textContent=err.message;label.classList.add('bad');btn.disabled=false;}
 };
}
function lavaOpenLoginTop(){lavaOpenLocalChoice();}

async function lavaOpenLaunchTarget(type,index){
 const entry=(db[type+'s']||[])[index];if(!entry)return;
 let r;
 try{r=await lavaCall('discover_installed');if(!r.ok)throw Error(r.error);}
 catch(err){lavaInfoDialog('Minecraft not found',err.message,'LAVA / LAUNCH');return;}
 const versions=r.versions||[];
 if(!versions.length){lavaInfoDialog('No installed versions','No playable version was found in your .minecraft/versions folder. Install Minecraft from an authorized account first.','LAVA / LAUNCH');return;}
 const suggested=entry.version&&versions.includes(entry.version)?entry.version:
   entry.t==='modpack'&&versions.includes(entry.version)?entry.version:
   versions.find(v=>/^(?:\d+\.\d+(?:\.\d+)?|26\.\d+)$/.test(v))||versions[0];
 lavaModalOpen(type==='server'?'Join '+entry.name:type==='world'?'Play '+entry.name:'Launch '+entry.name,'LAVA / START GAME',
 `<div class="lava-modal-body"><p class="lava-desc">${type==='server'?'Start Minecraft and automatically connect to '+lavaEscape(entry.address):
 type==='world'?'Start Minecraft with the selected local world':'Launch your selected installation profile'}.</p>
 <label class="lava-control-label" for="lava-launch-version">INSTALLED MINECRAFT VERSION</label>
 <select class="lava-control" id="lava-launch-version">${versions.map(v=>`<option value="${lavaEscape(v)}" ${v===suggested?'selected':''}>${lavaEscape(v)}</option>`).join('')}</select>
 <div class="lava-hint">${lavaState.account?'Signed in as '+lavaEscape(lavaState.account.name):'Microsoft sign-in required. Imported local files are not a multiplayer identity.'} Only installed versions are shown. Modded profiles must already have their loader files installed.</div>
 <div class="lava-actions"><button class="ghost" id="lava-launch-cancel">CANCEL</button><button class="green" id="lava-launch-go">▶ ${type==='server'?'JOIN':'PLAY'}</button></div>
 <p class="lava-alert-message" id="lava-launch-msg"></p></div>`);
 lavaEl('lava-launch-cancel').onclick=lavaCloseModal;
 lavaEl('lava-launch-go').onclick=async()=>{
   const label=lavaEl('lava-launch-msg');
   if(!lavaState.account){label.textContent='Please sign in with Microsoft first. This server/game cannot use an unauthenticated account.';label.classList.add('bad');return;}
   label.textContent='Preparing the game…';
   try{
     const result=await lavaCall('launch_target',lavaEl('lava-launch-version').value,
       type==='server'?entry.address:'',type==='world'?(entry.folder||''):'',type==='modpack'?entry.name:'');
     if(!result.ok)throw Error(result.error);
     lavaCloseModal();lavaProgressShow(result.message,5);
   }catch(err){label.textContent=err.message;label.classList.add('bad');}
 };
}

function lavaOpenBannerChoice(){
 const active=libraryEntries().find(e=>e.id===selected);
 if(!active||!['server','world'].includes(active.t))return;
 lavaModalOpen('Choose a banner','LAVA / BANNER APPEARANCE',`<div class="lava-modal-body">
 <p class="lava-desc">Use your own image or browse the built-in Lava banner library.</p>
 <div class="lava-play-choices"><button class="lava-choice" id="lava-banner-upload"><b>UPLOAD FILE</b><span>Use a PNG, JPEG or WebP picture from your computer</span></button>
 <button class="lava-choice" id="lava-banner-browse"><b>BROWSE LAVA BANNER LIBRARY</b><span>Choose from 16 included Minecraft landscapes</span></button></div></div>`);
 lavaEl('lava-banner-upload').onclick=()=>{lavaCloseModal();uploadLibraryBanner();};
 lavaEl('lava-banner-browse').onclick=lavaOpenBannerLibrary;
}
function lavaOpenBannerLibrary(){
 const active=libraryEntries().find(e=>e.id===selected);if(!active)return;
 lavaModalOpen('Lava banner library','LAVA / CUSTOMIZATION',`<div class="lava-modal-body">
 <p class="lava-desc">Select an illustration. Lava automatically applies a subtle foggy gradient for readability.</p>
 <div class="lava-banner-grid">${lavaBannerCatalog.map(b=>`<button class="lava-banner-tile" data-lava-banner-id="${b.id}"><img src="${b.path}" alt="${lavaEscape(b.name)}"><span>${lavaEscape(b.name)}</span></button>`).join('')}</div>
 <div class="lava-actions"><button class="ghost" id="lava-banner-random">RESTORE AUTOMATIC BANNER</button></div></div>`,true);
 lavaEl('lava-modal').querySelectorAll('[data-lava-banner-id]').forEach(b=>b.onclick=()=>{
   delete active.x.banner;active.x.bannerId=b.dataset.lavaBannerId;save();lavaCloseModal();render();
 });
 lavaEl('lava-banner-random').onclick=()=>{delete active.x.banner;delete active.x.bannerId;save();lavaCloseModal();render()};
}

const lavaRenderOriginal=render;
render=function(){
 if(page==='screenshots'){document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page==='screenshots'));lavaRenderScreenshots();return;}
 return lavaRenderOriginal();
};

function lavaRenderScreenshots(){
 main.innerHTML=`<div class="lava-shots"><div class="lib-eyebrow">YOUR MINECRAFT GALLERY</div><h1 class="lib-title">SCREENSHOTS</h1>
 <p class="lib-subtitle">Images found in your installed Minecraft screenshots folder. Rename, copy and turn them into banners.</p>
 <div class="lava-shots-toolbar"><div class="lava-shots-search"><span>⌕</span><input id="lava-shots-search" placeholder="Search filename or date" value="${safe(lavaShotSearch)}"></div>
 <label>FILTER BY DATE <input id="lava-shots-date" type="date" value="${safe(lavaShotDate)}"></label>
 <button class="secondary" id="lava-shots-clear">CLEAR FILTERS</button><button class="blue" id="lava-shots-refresh">⟳ REFRESH</button></div>
 <div id="lava-shots-results" class="lava-shot-grid"></div></div>`;
 lavaEl('lava-shots-search').oninput=e=>{lavaShotSearch=e.target.value;lavaPaintShots();};
 lavaEl('lava-shots-date').onchange=e=>{lavaShotDate=e.target.value;lavaPaintShots();};
 lavaEl('lava-shots-clear').onclick=()=>{lavaShotDate='';lavaShotSearch='';lavaRenderScreenshots()};
 lavaEl('lava-shots-refresh').onclick=()=>lavaLoadShots();
 lavaPaintShots();
 if(!lavaShotPending&&localStorage.getItem('lava-connected-installation')==='yes')lavaLoadShots();
}
async function lavaLoadShots(){
 if(lavaShotPending)return;
 lavaShotPending=true;
 const el=lavaEl('lava-shots-results');if(el)el.innerHTML='<div class="lava-shots-empty">Loading Minecraft screenshots…</div>';
 try{const r=await lavaCall('list_local_screenshots');if(!r.ok)throw Error(r.error);lavaShotList=r.items||[];}
 catch(err){lavaShotList=[];lavaMessage(err.message,true);}
 finally{lavaShotPending=false;if(page==='screenshots')lavaPaintShots();}
}
function lavaPaintShots(){
 const el=lavaEl('lava-shots-results');if(!el)return;
 if(localStorage.getItem('lava-connected-installation')!=='yes'){
   el.innerHTML='<div class="lava-shots-empty"><h3>No Minecraft installation connected</h3><p>Click LOGIN → USE INSTALLED MINECRAFT to import your screenshots.</p><button class="green" id="lava-shots-import">CONNECT INSTALLED MINECRAFT</button></div>';
   lavaEl('lava-shots-import').onclick=lavaOpenLocalChoice;return;
 }
 const filtered=lavaShotList.filter(s=>(!lavaShotDate||s.modified.startsWith(lavaShotDate))&&
  (!lavaShotSearch||[s.name,s.modified].join(' ').toLowerCase().includes(lavaShotSearch.toLowerCase())));
 el.innerHTML=filtered.length?filtered.map(s=>`<article class="lava-shot-card"><button class="lava-shot-image" data-shot-preview="${safe(s.name)}" title="Open screenshot">
 <img loading="lazy" src="${s.thumbnail}" alt="${safe(s.name)}"></button><div class="lava-shot-info"><strong title="${safe(s.name)}">${safe(s.name)}</strong>
 <small>${safe(s.modified.replace('T',' '))}</small><div class="lava-shot-actions"><button data-shot-preview="${safe(s.name)}">VIEW</button><button data-shot-rename="${safe(s.name)}">RENAME</button><button data-shot-copy="${safe(s.name)}">COPY</button><button data-shot-banner="${safe(s.name)}">USE AS BANNER</button></div></div></article>`).join(''):
 `<div class="lava-shots-empty"><h3>No screenshots found</h3><p>${lavaShotList.length?'No images match your filters.':'Screenshots captured in Minecraft appear here. Use F2 in-game to take one.'}</p></div>`;
}
function lavaShotRename(name){
 lavaModalOpen('Rename screenshot','LAVA / SCREENSHOTS',`<div class="lava-modal-body"><label class="lava-control-label">FILENAME</label><input id="lava-shot-new-name" class="lava-control" value="${safe(name.replace(/\.png$/i,''))}" maxlength="130"><p class="lava-hint">This renames the actual PNG file in .minecraft/screenshots. Other screenshots remain unchanged.</p><div class="lava-actions"><button class="green" id="lava-shot-save">RENAME FILE</button></div><p class="lava-alert-message" id="lava-shot-msg"></p></div>`);
 lavaEl('lava-shot-save').onclick=async()=>{
   try{const r=await lavaCall('rename_screenshot',name,lavaEl('lava-shot-new-name').value);if(!r.ok)throw Error(r.error);lavaCloseModal();await lavaLoadShots();lavaMessage('Screenshot renamed.');}
   catch(err){lavaEl('lava-shot-msg').textContent=err.message;}
 };
}
async function lavaShotPreview(name){
 lavaModalOpen('Screenshot preview','LAVA / MINECRAFT GALLERY','<div class="lava-modal-body">Loading image…</div>',true);
 try{const r=await lavaCall('screenshot_full',name);if(!r.ok)throw Error(r.error);
   lavaEl('lava-modal').querySelector('.lava-modal-body').innerHTML=`<img class="lava-full-shot" src="${r.image}" alt="${safe(name)}"><p class="lava-desc">${safe(name)}</p>`;
 }catch(err){lavaInfoDialog('Screenshot error',err.message);}
}
function lavaShotPickBanner(name){
 const entries=libraryEntries().filter(e=>['world','server'].includes(e.t));
 lavaModalOpen('Use as banner','LAVA / SCREENSHOTS',`<div class="lava-modal-body"><p class="lava-desc">Choose a world or server profile to receive this screenshot as its banner.</p>
 <div class="lava-banner-choices">${entries.map(e=>`<button data-shot-target="${e.t}:${e.i}">${libraryIcon(e.t)} ${safe(e.x.name)} <small>${libraryType(e.t)}</small></button>`).join('')||'<p>No worlds or servers in your Library yet.</p>'}</div><p class="lava-alert-message" id="lava-shot-msg"></p></div>`);
 lavaEl('lava-modal').querySelectorAll('[data-shot-target]').forEach(el=>el.onclick=async()=>{
   try{const r=await lavaCall('screenshot_banner',name);if(!r.ok)throw Error(r.error);
     const [type,index]=el.dataset.shotTarget.split(':');const x=db[type+'s'][Number(index)];if(!x)throw Error('Entry no longer exists');
     x.banner=r.banner;delete x.bannerId;save();lavaCloseModal();lavaMessage('Banner applied to '+x.name);
   }catch(err){lavaEl('lava-shot-msg').textContent=err.message;}
 });
}

function lavaProgressShow(message,percent){
 const bar=lavaEl('lava-progress');const fill=lavaEl('lava-progress-fill');const msg=lavaEl('lava-progress-label');
 if(!bar||!fill)return;
 bar.hidden=false;bar.classList.toggle('error',percent<0);
 fill.style.width=`${percent<0?100:Math.max(3,Math.min(100,Number(percent)||0))}%`;
 msg.textContent=message||'Preparing Minecraft…';
 if(percent===100)setTimeout(()=>{bar.hidden=true},7000);
}
window.lavaLaunchStatus=data=>{lavaProgressShow(data.message,data.progress);lavaMessage(data.message,data.progress<0)};

function lavaFactoryReset(){
 lavaModalOpen('Reset all Lava data?','LAVA / DANGER ZONE',`<div class="lava-modal-body">
 <p class="lava-desc"><strong>This permanently clears all data managed by Lava:</strong> imported Library entries, your saved servers and modpack profiles, favorites, banners, appearance and RAM preferences, the Lava-managed game directory, cached Lava credentials, and Lava's local webview storage.</p>
 <div class="lava-hint">Your actual .minecraft worlds, screenshots, servers.dat and official Minecraft installations are NOT deleted or modified. Externally exported .lava.json backup files also remain wherever you saved them.</div>
 <label class="lava-control-label" for="lava-reset-word">TYPE RESET TO CONFIRM</label><input id="lava-reset-word" class="lava-control" autocomplete="off" placeholder="RESET">
 <div class="lava-actions"><button class="ghost" id="lava-reset-cancel">CANCEL</button><button class="lava-danger-button" id="lava-reset-confirm" disabled>DELETE ALL LAVA DATA</button></div>
 <p id="lava-reset-feedback" class="lava-alert-message"></p></div>`);
 lavaEl('lava-reset-cancel').onclick=lavaCloseModal;
 lavaEl('lava-reset-word').oninput=e=>lavaEl('lava-reset-confirm').disabled=e.target.value!=='RESET';
 lavaEl('lava-reset-confirm').onclick=async()=>{
   const feedback=lavaEl('lava-reset-feedback');
   feedback.textContent='Resetting Lava data…';
   try{
     const r=await lavaCall('request_factory_reset');if(!r.ok)throw Error(r.error);
     localStorage.removeItem(KEY);localStorage.removeItem('lava-connected-installation');
     feedback.textContent='Lava will close. Restart it for the fresh setup.';
   }catch(err){feedback.textContent=err.message;}
 };
}

// Route selected actions before the old document listeners run.
document.addEventListener('click',e=>{
 const banner=e.target.closest('[data-lib-banner="upload"]');
 if(banner){e.preventDefault();e.stopImmediatePropagation();lavaOpenBannerChoice();return;}
 const shot=e.target.closest('[data-shot-preview],[data-shot-rename],[data-shot-copy],[data-shot-banner]');
 if(!shot)return;
 e.preventDefault();e.stopImmediatePropagation();
 if(shot.dataset.shotPreview)lavaShotPreview(shot.dataset.shotPreview);
 if(shot.dataset.shotRename)lavaShotRename(shot.dataset.shotRename);
 if(shot.dataset.shotCopy)lavaCall('screenshot_clipboard',shot.dataset.shotCopy).then(r=>lavaMessage(r.ok?'Screenshot copied to clipboard':r.error,!r.ok));
 if(shot.dataset.shotBanner)lavaShotPickBanner(shot.dataset.shotBanner);
},true);

// Update the visual account mode after normal initialization.
window.addEventListener('pywebviewready',()=>{
 lavaRefreshProfileButton();
}, {once:true});
