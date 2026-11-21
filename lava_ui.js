/* Reference copy of Lava inline scripts. Main program loads embedded JavaScript in lava.html. */

const KEY='lava-prototype-v01';let gameVersions=[];let versionChannel='release';let storeProvider='modrinth';let storeType='mod',storeQuery='',storeVersion='1.21.1',storeSort='downloads',storeEnvironment='all',storePage=0,storeRequest=0;let db;try{db=JSON.parse(localStorage.getItem(KEY))||{servers:[],worlds:[],settings:{name:'Player',ram:'4096',version:'1.21.1'}}}catch{db={servers:[],worlds:[],settings:{name:'Player',ram:'4096',version:'1.21.1'}}};db.servers||=[];db.worlds||=[];db.modpacks||=[];db.installations||=[];db.settings||={};
// Seed Hypixel once per existing browser profile; do not recreate it if removed later.
if(!db.libraryDefaultsV072){
  if(!db.servers.some(s=>String(s.address||'').trim().toLowerCase().replace(/\.$/,'')==='hypixel.net'))db.servers.push({name:'Hypixel',address:'hypixel.net',version:'',builtIn:'hypixel'});
  db.libraryDefaultsV072=true;
  try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){console.warn('Lava could not save initial library entry',e)}
}
// Preserve the identity of the built-in Hypixel entry across updates.
const lavaDefaultHypixel=db.servers.find(e=>String(e.address||'').trim().toLowerCase()==='hypixel.net');
if(lavaDefaultHypixel){lavaDefaultHypixel.name='Hypixel';lavaDefaultHypixel.builtIn='hypixel';}
else db.servers.unshift({name:'Hypixel',address:'hypixel.net',version:'',builtIn:'hypixel'});
try{localStorage.setItem(KEY,JSON.stringify(db))}catch{}
let page='store',selected=null,activeProject=null,projectCache=new Map();const main=document.getElementById('main'),safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));function save(){localStorage.setItem(KEY,JSON.stringify(db))}function button(label,fn,cls='secondary'){return `<button class="${cls}" data-action="${fn}">${label}</button>`}function notice(t){return `<div class="notice">${t}</div>`}function sidebar(){}
let libCategory='all',libSearch='';
function libraryEntries(){return ['world','server','modpack'].flatMap(t=>(db[t+'s']||[]).map((x,i)=>({t,x,i,id:t+i})));}
function orderedLibraryEntries(arr){return [...arr].sort((a,b)=>Number(Boolean(b.x.favorite))-Number(Boolean(a.x.favorite))||a.i-b.i);}
function libraryRecentEntries(entries){return entries.filter(e=>Number(e.x.lastViewed)>0).sort((a,b)=>b.x.lastViewed-a.x.lastViewed).slice(0,6);}
function libraryTime(ms){try{return new Date(ms).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});}catch{return 'Recently opened';}}
function libraryType(t){return {world:'World',server:'Server',modpack:'Modpack'}[t]||t;}
function libraryIcon(t){return {world:'▦',server:'◉',modpack:'⬡',installation:'⛏'}[t]||'◆';}
const serverStatusCache=new Map();
const statusTTL=20000;
const statusRefreshInterval=20000;
function serverKey(address){return encodeURIComponent(String(address||'').trim().toLowerCase());}
function serverIcon(address){const icon=serverStatus(address)?.icon;if(typeof icon==='string'&&icon.length<180000&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(icon))return icon;return 'https://api.mcsrvstat.us/icon/'+encodeURIComponent(String(address||'').trim());}
function serverStatus(address){const item=serverStatusCache.get(serverKey(address));return item?.data||null;}
function serverPlayerData(d){const n=d?.online&&Number.isFinite(d.players?.online)?Math.max(0,Number(d.players.online)):null;const max=d?.online&&Number.isFinite(d.players?.max)&&Number(d.players.max)>0?Number(d.players.max):null;return {label:n===null?'—':n.toLocaleString()+' / '+(max===null?'?':max.toLocaleString()),percent:n!==null&&max!==null?Math.max(0,Math.min(100,n/max*100)):0,known:n!==null&&max!==null};}
function serverPlayerBar(key,d,small=false){const x=serverPlayerData(d);if(small)return `<div class="lib-sidebar-playerbar" aria-hidden="true"><i data-server-sidebar-bar="${key}" style="width:${x.percent}%"></i></div>`;return `<div class="lib-player-track" data-unknown="${!x.known}" role="progressbar" aria-label="Server player capacity" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(x.percent)}" data-server-track="${key}"><div class="lib-player-fill" data-server-playerbar="${key}" style="width:${x.percent}%"></div></div>`;}

function serverOnlineText(d){if(!d)return 'Checking status…';return d.error?'Status unavailable':d.online?'Online · '+(Number.isFinite(d.players?.online)?Number(d.players.online).toLocaleString()+' players':'Players unavailable'):'Offline / unreachable';}
function serverVersionText(d){return d?.online&&d.version?String(d.version):'Not reported';}
function serverVisual(e){const address=e.x.address||'',key=safe(serverKey(address)),d=serverStatus(address);return `<span class="lib-icon-wrap"><span class="lib-icon-fallback">◈</span><img class="lib-server-icon" data-server-icon="${key}" src="${safe(serverIcon(address))}" alt="${safe(e.x.name)} icon" loading="lazy" onerror="this.style.visibility='hidden'" /></span>`}
function libraryRail(entries){const categories=['world','server','modpack'];const railItems=categories.map(t=>{const subset=orderedLibraryEntries(entries.filter(e=>e.t===t&&e.x.name.toLowerCase().includes(libSearch.toLowerCase())));return `<div class="lib-rail-group"><span>${safe(libraryType(t).toUpperCase()+'S')} (${entries.filter(e=>e.t===t).length})</span>${t==='world'?'<button type="button" class="lib-group-add lib-group-folder" data-lib-saves="1" title="Open .minecraft/saves folder" aria-label="Open Minecraft saves folder"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h6l2 2h10v12H3z"/></svg></button>':`<button type="button" class="lib-group-add" data-lib-add="${t}" title="Add ${safe(libraryType(t).toLowerCase())}" aria-label="Add ${safe(libraryType(t).toLowerCase())}">+</button>`}</div>${subset.length?subset.map(e=>{const key=safe(serverKey(e.x.address)),d=serverStatus(e.x.address);const item=e.t==='server'?`<button type="button" class="lib-rail-item lib-rail-item-server ${selected===e.id?'active':''}" data-entry="${e.t}:${e.i}">${serverVisual(e)}<span class="lib-entry-text"><strong>${safe(e.x.name)}</strong><small data-server-sidebar="${key}"><span class="lib-server-dot ${d?.online?'online':d?.error||d?.online===false?'offline':''}"></span>${safe(serverOnlineText(d))}</small>${serverPlayerBar(key,d,true)}</span></button>`:`<button type="button" class="lib-rail-item ${selected===e.id?'active':''}" data-entry="${e.t}:${e.i}"><span class="lib-entry-symbol">${libraryIcon(t)}</span><span class="lib-entry-text"><strong>${safe(e.x.name)}</strong></span></button>`;return `<div class="lib-rail-row">${item}<button class="lib-favorite ${e.x.favorite?'is-favorite':''}" type="button" data-lib-favorite="${e.t}:${e.i}" aria-label="${e.x.favorite?'Remove from':'Add to'} favorites" title="${e.x.favorite?'Unfavorite':'Favorite'}">${e.x.favorite?'★':'☆'}</button></div>`;}).join(''):'<div class="lib-rail-empty">No entries</div>'}`}).join('');return `<aside class="lib-rail"><div class="lib-rail-head"><span>YOUR COLLECTION</span></div><input id="lib-search" class="lib-rail-search" placeholder="Search your library" value="${safe(libSearch)}" autocomplete="off"><button type="button" class="lib-rail-item ${!selected?'active':''}" data-lib-home="1" style="margin-top:9px"><span class="lib-entry-symbol">⌂</span><span class="lib-entry-text"><strong>LIBRARY HOME</strong></span></button>${railItems}</aside>`;}
function libCard(e){const isServer=e.t==='server',d=isServer?serverStatus(e.x.address):null;const art=isServer?`<img class="lib-card-server-icon" data-server-icon="${safe(serverKey(e.x.address))}" src="${safe(serverIcon(e.x.address))}" alt="" onerror="this.style.visibility='hidden'">`:libraryIcon(e.t);return `<button type="button" class="lib-card" data-entry="${e.t}:${e.i}"><div class="lib-card-art ${e.t}">${art}<small>${safe(libraryType(e.t).toUpperCase())}</small></div><div class="lib-card-copy"><strong>${e.x.favorite?'★ ':''}${safe(e.x.name)}</strong><span ${isServer?`data-server-card-status="${safe(serverKey(e.x.address))}"`:``}>${isServer?safe(serverOnlineText(d)):safe(e.t==='modpack'?`${lavaLoaderName(e.x.loader)} · ${e.x.version||'Version not specified'}`:(e.x.version||'Version not specified'))}</span></div></button>`;}
const hypixelOverview=`<p class="lib-server-overview"><strong>Welcome to Hypixel — a world of Minecraft minigames.</strong> Dive into competitive Bed Wars, build your own island in SkyBlock, battle in SkyWars, discover Murder Mystery, and explore many more community favorites. What began as a project making Minecraft adventure maps has grown into a huge network packed with creative games, challenges, quests and events. Whether you're playing with friends or exploring on your own, there's always something new to try.</p><p class="lib-server-secondary">Description written for Lava, based on Hypixel's official game and About pages. <a href="https://hypixel.net/play/" target="_blank" rel="noopener noreferrer" style="color:#8ac8ef">Explore Hypixel ↗</a></p>`;
function serverMetaPanel(e){const x=e.x,key=safe(serverKey(x.address)),d=serverStatus(x.address),p=serverPlayerData(d);return `<div class="lib-server-metrics"><div class="lib-server-metric lib-player-metric"><strong class="lib-player-number" data-server-players="${key}">${safe(p.label)}</strong><span>Players online / max</span>${serverPlayerBar(key,d)}<span class="lib-player-caption">Checks about every 20 seconds · public status services cache results</span></div><div class="lib-server-metric"><strong data-server-version="${key}">${safe(serverVersionText(d))}</strong><span>Server-reported version</span></div><div class="lib-server-metric"><strong data-server-state="${key}">${safe(d?.error?'Unavailable':d?.online?'Online':d?.online===false?'Offline':'Checking…')}</strong><span>Network status</span></div></div>`;}
async function fetchServerStatus(address,force=false){
 const key=serverKey(address),entry=serverStatusCache.get(key);
 if(entry?.pending)return entry.pending;
 if(!force&&entry&&Date.now()-entry.time<statusTTL)return entry.data;
 if(!address)return;
 const promise=(async()=>{
   try{
     const data=await lavaCall('server_status',address);
     serverStatusCache.set(key,{data,time:Date.now()});
     return data;
   }catch(error){
     const data={error:true,online:null,reason:String(error?.message||error)};
     serverStatusCache.set(key,{data,time:Date.now()});
     return data;
   }finally{updateServerStatusUI(address)}
 })();
 serverStatusCache.set(key,{data:entry?.data||null,time:Date.now(),pending:promise});
 return promise;
}
function updateServerStatusUI(address){if(page!=='library')return;const key=serverKey(address),d=serverStatus(address),p=serverPlayerData(d);for(const el of main.querySelectorAll('[data-server-sidebar]'))if(el.dataset.serverSidebar===key){el.textContent='';const dot=document.createElement('span');dot.className='lib-server-dot '+(d?.online?'online':d?.error||d?.online===false?'offline':'');el.append(dot,document.createTextNode(serverOnlineText(d)));}for(const el of main.querySelectorAll('[data-server-players]'))if(el.dataset.serverPlayers===key)el.textContent=p.label;for(const el of main.querySelectorAll('[data-server-playerbar]'))if(el.dataset.serverPlayerbar===key)el.style.width=p.percent+'%';for(const el of main.querySelectorAll('[data-server-sidebar-bar]'))if(el.dataset.serverSidebarBar===key)el.style.width=p.percent+'%';for(const el of main.querySelectorAll('[data-server-track]'))if(el.dataset.serverTrack===key){el.dataset.unknown=String(!p.known);el.setAttribute('aria-valuenow',String(Math.round(p.percent)));}for(const el of main.querySelectorAll('[data-server-version]'))if(el.dataset.serverVersion===key)el.textContent=serverVersionText(d);for(const el of main.querySelectorAll('[data-server-state]'))if(el.dataset.serverState===key)el.textContent=d?.error?'Unavailable':d?.online?'Online':d?.online===false?'Offline':'Checking…';for(const el of main.querySelectorAll('[data-server-card-status]'))if(el.dataset.serverCardStatus===key)el.textContent=serverOnlineText(d);const icon=d?.icon;if(typeof icon==='string'&&icon.length<180000&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(icon)){for(const el of main.querySelectorAll('[data-server-icon]'))if(el.dataset.serverIcon===key){el.src=icon;el.style.visibility='visible'}for(const el of main.querySelectorAll('.lib-card-server-icon'))if(el.dataset.serverIcon===key){el.src=icon;el.style.visibility='visible'}}}
function refreshLibraryStatuses(entries,force=false){if(lavaOffline)return;for(const e of entries)if(e.t==='server')fetchServerStatus(e.x.address,force);}
function renderLibrary(){
const entries=libraryEntries(),shown=entries.filter(e=>(libCategory==='all'||e.t===libCategory)&&[e.x.name,e.x.address||'',e.x.version||''].join(' ').toLowerCase().includes(libSearch.toLowerCase()));
let content='';let active=selected?entries.find(e=>e.id===selected):null;
if(selected&&!active)selected=null;
if(active){const e=active,x=e.x,isServer=e.t==='server',isHypixel=isServer&&['hypixel.net','mc.hypixel.net','play.hypixel.net'].includes(String(x.address||'').trim().toLowerCase());const d=isServer?serverStatus(x.address):null;const key=safe(serverKey(x.address));const bannerImg=(typeof x.banner==='string'&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(x.banner))?x.banner:(x.bannerId?lavaBannerPath(x.bannerId):(isHypixel?lavaBannerPath('hypixel'):lavaBannerDefault(e)));const bannerCSS=(isServer||e.t==='world')?` style="--lava-banner:url('${safe(bannerImg)}')"`:"";const overview=isHypixel?hypixelOverview:isServer?`<p class="lib-server-overview">${safe(x.name)} is saved to your Lava server library. Press <strong>JOIN SERVER</strong> to start Minecraft and connect when authenticated. Live status, the server icon, player count and reported version are loaded automatically when available.</p>${d?.motd?.clean?`<p class="lib-server-secondary">Server message: ${safe(Array.isArray(d.motd.clean)?d.motd.clean.join(' '):d.motd.clean)}</p>`:''}`:e.t==='world'?'Worlds are created in Minecraft. Your imported world can be launched from here using a compatible installed version and your authenticated Minecraft account.':e.t==='modpack'?`<p class="lib-server-overview">${safe(x.name)} is your <b>${safe(lavaLoaderName(x.loader))}</b> Minecraft profile for version <b>${safe(x.version||'Not selected')}</b>.</p><p class="lib-server-secondary">The profile is saved in Lava. Loader installation and launching are planned for the next stage; creating this profile does not install Minecraft or a mod loader.</p>`:'';
content=`<button class="lib-back" data-lib-home="1">← LIBRARY HOME</button><div class="lib-detail-head${bannerCSS?' lava-illustrated-banner':''}"${bannerCSS}><div>${isServer?`<div class="lib-server-profile-heading">${serverVisual(e)}<div>`:''}<div class="lib-eyebrow">LAVA LIBRARY / ${safe(libraryType(e.t).toUpperCase())}</div><h2>${safe(x.name)}</h2><div class="lib-subtitle">${safe(libraryType(e.t))} · ${isServer?`<span data-server-state="${key}">${safe(d?.error?'Unavailable':d?.online?'Online':d?.online===false?'Offline':'Checking…')}</span>`:safe(x.version||'Version not specified')}</div>${isServer?'</div></div>':''}</div></div><div class="lib-detail-toolbar">${isServer?'<button class="green" data-action="primary">▶ JOIN SERVER</button>':e.t==='world'?'<button class="green" data-action="primary">▶ PLAY WORLD</button>':'<button class="green" data-lib-placeholder="play">▶ PLAY MODPACK</button>'}${isServer&&x.builtIn==='hypixel'?'<span class="lava-native-label" title="Built-in Lava server — server details cannot be edited">◆ BUILT-IN SERVER</span>':e.t==='world'?'':'<button class="secondary" data-action="edit">EDIT</button>'}<button class="secondary lib-fav-detail" data-lib-favorite="${e.t}:${e.i}">${x.favorite?'★ FAVORITED':'☆ ADD TO FAVORITES'}</button>${isServer||e.t==='world'?'<button class="secondary" data-lib-banner="upload">▧ CHANGE BANNER</button>':''}${(isServer||e.t==='world')&&(x.banner||x.bannerId)?'<button class="secondary" data-lib-banner="remove">RESTORE RANDOM BANNER</button>':''}${isServer&&x.builtIn==='hypixel'?'':'<button class="secondary" data-action="remove">REMOVE FROM LIBRARY</button>'}${isServer?'<button class="lib-refresh" data-lib-refresh="1">⟳ REFRESH STATUS</button>':''}</div>${isServer?serverMetaPanel(e):''}<div class="lib-detail-info"><section class="lib-info-panel"><h3>OVERVIEW</h3>${overview}</section><section class="lib-info-panel"><h3>DETAILS</h3><div class="lib-info-row"><span>Type</span><strong>${safe(libraryType(e.t))}</strong></div><div class="lib-info-row"><span>${isServer?'Reported Minecraft version':'Minecraft version'}</span><strong ${isServer?`data-server-version="${key}"`:''}>${safe(isServer?serverVersionText(d):x.version||'Not specified')}</strong></div>${e.t==='modpack'?`<div class="lib-info-row"><span>Mod loader</span><strong>${safe(lavaLoaderName(x.loader))}</strong></div>`:''}${isServer?`<div class="lib-info-row"><span>Players</span><strong data-server-players="${key}">${safe(d?.online&&Number.isFinite(d.players?.online)?Number(d.players.online).toLocaleString()+' / '+(d.players.max??'?'):'—')}</strong></div><div class="lib-info-row"><span>Address</span><strong>${safe(x.address)}</strong></div>`:''}<div class="lib-info-row"><span>Source</span><strong>${x.source==='minecraft'?'Imported from .minecraft':'Lava Library entry'}</strong></div><div class="lib-info-row"><span>Last opened in Lava</span><strong>${x.lastViewed? safe(libraryTime(x.lastViewed)): 'Never'}</strong></div>${isServer?'<p class="lib-server-secondary">A server ping reports one version or protocol. It may not list every Minecraft version the server accepts. Status comes from a third-party lookup service and can be delayed.</p>':''}</section></div><div class="notice">Lava can directly launch installed Minecraft versions with a signed-in Minecraft account. Local file discovery alone does not authenticate you for online servers. Your original .minecraft files remain untouched by Lava.</div>`;}
else {content=`<div class="lib-eyebrow">WELCOME TO LAVA</div><h1 class="lib-title">LIBRARY HOME</h1><div class="lib-subtitle">Your Minecraft worlds, servers, and modpack profiles — in one place.</div><div class="lib-feature"><div><div class="lib-eyebrow">YOUR MINECRAFT COLLECTION</div><h2>Everything Minecraft.<br>One library.</h2><p>Organize your worlds and servers, manage modpack profiles, and prepare for launching straight from Lava.</p></div></div>${libraryRecentEntries(entries).length?`<section class="lib-recent-area"><div class="lib-section-head"><h3>RECENTLY OPENED</h3><span class="lib-subtitle">Library activity</span></div><p class="lib-recent-intro">Entries you recently viewed in Lava. Opening Library entries is tracked here. Actual Minecraft playtime tracking is not connected yet.</p><div class="lib-recent-cards">${libraryRecentEntries(entries).map(e=>`<button type="button" class="lib-recent-card" data-entry="${e.t}:${e.i}"><span class="lib-recent-symbol">${libraryIcon(e.t)}</span><span><strong>${e.x.favorite?'★ ':''}${safe(e.x.name)}</strong><small>${safe(libraryType(e.t))} · ${safe(libraryTime(e.x.lastViewed))}</small></span></button>`).join('')}</div></section>`:`<section class="lib-recent-area"><div class="lib-section-head"><h3>RECENTLY OPENED</h3></div><p class="lib-recent-intro">Open a world or server profile to see it here. Actual Minecraft playtime tracking is not connected yet.</p></section>`}<div class="lib-section-head"><h3>YOUR COLLECTION <span style="color:#8badc4">(${entries.length})</span></h3><span class="lib-subtitle">Local entries</span></div><div class="lib-filter-tabs">${[['all','All'],['world','Worlds'],['server','Servers'],['modpack','Modpacks']].map(([val,label])=>`<button data-lib-filter="${val}" class="${libCategory===val?'active':''}">${label}</button>`).join('')}</div><div class="lib-cards">${shown.length?orderedLibraryEntries(shown).map(libCard).join(''):'<div class="lib-empty">No matching entries yet. Use the folder button beside Worlds to open your saves, or the <b>+</b> buttons beside Servers and Modpacks.</div>'}</div>`;}
main.innerHTML=`<div class="lava-library">${libraryRail(entries)}<div class="lib-content">${content}</div></div>`;
refreshLibraryStatuses(entries);
}
function lavaLoaderName(loader){return ({vanilla:'Vanilla',fabric:'Fabric',neoforge:'NeoForge'})[String(loader||'').toLowerCase()]||'Not specified'}
async function lavaOpenSavesFolder(){
 try{const r=await lavaCall('open_saves_folder');if(!r.ok)throw Error(r.error);lavaMessage('Opened Minecraft saves folder');}
 catch(e){lavaInfoDialog('Minecraft saves folder',e.message,'LAVA / WORLDS');}
}
let lavaModpackEditIndex=null;
function openLavaModpackDialog(index=null){
 const old=index===null?null:db.modpacks[index];if(index!==null&&!old)return;
 lavaModpackEditIndex=index;
 const overlay=document.getElementById('lava-modpack-overlay');
 document.getElementById('lava-modpack-title').textContent=index===null?'Create modpack profile':'Edit modpack profile';
 document.getElementById('lava-modpack-submit').textContent=index===null?'CREATE PROFILE':'SAVE PROFILE';
 document.getElementById('lava-modpack-name').value=old?.name||'';
 document.getElementById('lava-modpack-version').value=old?.version||'1.21.1';
 document.querySelectorAll('input[name="lava-loader"]').forEach(r=>{r.checked=r.value===(old?.loader||'vanilla')});
 document.getElementById('lava-modpack-error').textContent='';
 overlay.hidden=false;document.getElementById('lava-modpack-name').focus();
}
function closeLavaModpackDialog(){document.getElementById('lava-modpack-overlay').hidden=true;lavaModpackEditIndex=null;}
document.getElementById('lava-modpack-form').addEventListener('submit',event=>{
 event.preventDefault();
 const name=document.getElementById('lava-modpack-name').value.trim();
 const version=document.getElementById('lava-modpack-version').value.trim();
 const loader=document.querySelector('input[name="lava-loader"]:checked')?.value||'vanilla';
 const error=document.getElementById('lava-modpack-error');
 if(!name){error.textContent='Enter a profile name.';return;}
 if(!/^[a-zA-Z0-9._-]{2,50}$/.test(version)){error.textContent='Enter a valid Minecraft version, e.g. 1.21.1 or 26.3.';return;}
 const entry={name,version,loader};
 if(lavaModpackEditIndex!==null){const previous=db.modpacks[lavaModpackEditIndex];Object.assign(entry,{favorite:!!previous.favorite,lastViewed:previous.lastViewed||0});db.modpacks[lavaModpackEditIndex]=entry}
 else db.modpacks.push(entry);
 try{save()}catch(e){error.textContent='Could not save this profile. Check available storage.';return;}
 const idx=lavaModpackEditIndex===null?db.modpacks.length-1:lavaModpackEditIndex;
 closeLavaModpackDialog();selected='modpack'+idx;page='library';render();
});
document.getElementById('lava-modpack-overlay').addEventListener('click',e=>{if(e.target.id==='lava-modpack-overlay'||e.target.closest('[data-modpack-cancel]'))closeLavaModpackDialog()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.getElementById('lava-modpack-overlay').hidden)closeLavaModpackDialog()});
document.addEventListener('click',e=>{if(e.target.closest('[data-lib-saves]')){e.preventDefault();lavaOpenSavesFolder()}});
function libraryAdd(type){if(type==='world'){lavaOpenSavesFolder();return;}if(type==='server'){openLavaServerDialog();return;}if(type==='modpack'){openLavaModpackDialog();return;}}
function render(){if(page==='friends'){document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));renderLavaFriends();return;}if(page==='library'){document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));renderLibrary();return;}if(page==='store'&&activeProject){renderProject();return;}document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));sidebar();if(selected){let type=selected.startsWith('world')?'world':'server',i=Number(selected.slice(type.length)),x=db[type+'s'][i];if(!x){selected=null;return render()}main.innerHTML=`<div class="muted">LIBRARY　/　${type.toUpperCase()}S</div><div class="hero"><div><h2>${safe(x.name)}</h2><p>${type==='server'?safe(x.address):'Minecraft world'} • ${safe(x.version||'Version not specified')}</p><div class="actions">${button(type==='server'?'COPY SERVER ADDRESS':'OPEN MINECRAFT FOLDER','primary','green')}${button('EDIT','edit')}${button('REMOVE','remove')}</div></div></div><h3 class="section">Details</h3><div class="panel">${type==='server'?'Address: '+safe(x.address):'World entry: '+safe(x.name)}<br><br>Version: ${safe(x.version||'Not specified')}</div>${notice('Use the PLAY button to launch vanilla Minecraft. Direct-to-server launching will be added later.')}`;return}switch(page){case 'library':main.innerHTML=`<h1 class="heading">LIBRARY HOME</h1><div class="muted">Your Minecraft worlds, servers and installations in one place.</div><div class="hero"><div><h2>Welcome to Lava.</h2><p>A Steam-inspired home for your Minecraft experience.</p><div class="actions">${button('ADD SERVER','addserver','green')}${button('ADD WORLD','addworld','blue')}</div></div></div><h3 class="section">Your collection</h3><div class="cards">${[...db.worlds.map((x,i)=>({x,i,t:'world'})),...db.servers.map((x,i)=>({x,i,t:'server'}))].map(o=>`<div class="card" data-entry="${o.t}:${o.i}"><div class="art">${o.t==='world'?'▦':'◉'}</div><div class="cardbody"><div class="cardtitle">${safe(o.x.name)}</div><div class="muted">${o.t==='world'?'World':'Server'} · ${safe(o.x.version||'Any version')}</div></div></div>`).join('')||'<div class="panel">Your library is empty. Add a world or server to get started.</div>'}</div>`;break;case 'store':main.innerHTML=`<div class="store-shell"><div class="store-nav"><span class="store-home">YOUR STORE</span><button class="store-tab ${storeType==='mod'?'on':''}" data-type="mod">MODS</button><button class="store-tab ${storeType==='modpack'?'on':''}" data-type="modpack">MODPACKS</button><button class="store-tab ${storeType==='shader'?'on':''}" data-type="shader">SHADERS</button><button class="store-tab ${storeType==='resourcepack'?'on':''}" data-type="resourcepack">RESOURCE PACKS</button><span class="store-spacer"></span><div class="store-providers" aria-label="Mod platforms"><button type="button" class="provider-tab ${storeProvider==='modrinth'?'provider-active':''}" data-provider="modrinth" aria-pressed="${storeProvider==='modrinth'}"><img src="https://cdn.jsdelivr.net/npm/simple-icons@v15/icons/modrinth.svg" alt="" onerror="this.style.display='none'">Modrinth</button><button type="button" class="provider-tab ${storeProvider==='curseforge'?'provider-active':''}" data-provider="curseforge" aria-pressed="${storeProvider==='curseforge'}"><img src="https://cdn.jsdelivr.net/npm/simple-icons@v15/icons/curseforge.svg" alt="" onerror="this.style.display='none'">CurseForge</button></div><input id="modsearch" class="store-search" placeholder="Search the store" value="${safe(storeQuery)}"><div class="version-picker"><button id="version-toggle" class="store-select version-toggle" aria-expanded="false" aria-haspopup="true" type="button">${safe(storeVersion||'Select version')} <span>▾</span></button><div id="version-popover" class="version-popover" hidden><div class="version-channels"><button type="button" data-channel="release" class="${versionChannel==='release'?'chosen':''}">Releases</button><button type="button" data-channel="snapshot" class="${versionChannel==='snapshot'?'chosen':''}">Snapshots</button></div><div id="version-list" class="version-list">${versionButtons()}</div></div></div><button class="store-go" data-action="searchmods">⌕</button></div><div class="version-hint">Open the Minecraft version menu and choose Releases (including Alpha and Beta) or Snapshots. Versions load from Modrinth. Selecting a version filters compatible projects; it does not install or launch Minecraft.</div><div class="store-hero"><div class="eyebrow">LAVA DISCOVERY QUEUE</div><h1>Find your next<br><strong>Minecraft upgrade.</strong></h1><p>Explore community creations from Modrinth, including compatibility filters for historical Minecraft versions. Browse versions from early Alpha and Beta to modern releases.</p><button class="blue" data-action="searchmods">EXPLORE STORE</button><div class="store-hero-art">♨</div></div><div class="store-feature"><div><div class="eyebrow">DISCOVER & EXPLORE</div><h2>${storeQuery?'SEARCH RESULTS':'MOST DOWNLOADED '+storeType.toUpperCase()+'S'}</h2><div class="muted" id="store-caption">${storeProvider==='modrinth'?'Live results from Modrinth':'CurseForge browsing'} · Minecraft ${safe(storeVersion)}</div></div><div class="sortline"><div class="store-filter-wrap"><button type="button" class="store-select store-filter-toggle" id="store-filter-toggle" aria-haspopup="true" aria-expanded="false">Sort by: ${safe(({downloads:'Most downloaded',relevance:'Relevance',updated:'Recently updated',newest:'Newest'})[storeSort])}<span class="store-filter-caret">▾</span>${storeEnvironment!=='all'?'<span class="store-filter-indicator">1</span>':''}</button><div class="store-filter-popover" id="store-filter-popover" hidden><div class="store-filter-heading">SORT RESULTS</div>${[['downloads','Most downloaded'],['relevance','Relevance'],['updated','Recently updated'],['newest','Newest']].map(([value,label])=>`<label class="store-filter-choice"><input type="radio" name="store-sort" value="${value}" ${storeSort===value?'checked':''}><span>${label}</span></label>`).join('')}<div class="store-filter-divider"></div><div class="store-filter-heading">ENVIRONMENT</div>${[['all','All environments'],['client','Client-compatible'],['server','Server-compatible']].map(([value,label])=>`<label class="store-filter-choice"><input type="radio" name="store-environment" value="${value}" ${storeEnvironment===value?'checked':''}><span>${label}</span></label>`).join('')}<p class="store-filter-note">Compatibility uses Modrinth's client and server support information. Optional support is included.</p></div></div></div></div><div id="modresults" class="mod-grid"><div class="loading">Connecting to Modrinth… <span style="opacity:.72">(up to 12 seconds)</span></div></div><div class="pagination"><button class="secondary" data-action="prevmods" ${storePage===0?'disabled':''}>← Previous</button><span id="pageinfo">Page ${storePage+1}</span><button class="secondary" data-action="nextmods">Next →</button></div><div class="api-note">Modrinth project metadata provided by <a href="https://modrinth.com" target="_blank" rel="noopener noreferrer">Modrinth</a>. Older Alpha/Beta releases may have no compatible projects. Select a project card to view its details inside Lava. The Store currently supports mod browsing and file downloads. One-click installation is coming later; launch installed profiles from your Library.</div></div>`;loadMods();break;case 'community':main.innerHTML=`<h1 class="heading">COMMUNITY</h1><div class="muted">Your Minecraft community hub.</div><div class="panel"><h2>Coming later</h2><p>Shared screenshots, collections, and server activity are in development.</p>${button('BROWSE COMMUNITY MODS','modrinth','blue')}</div>`;break;case 'downloads':main.innerHTML=`<h1 class="heading">DOWNLOADS</h1><div class="panel"><h2>No active downloads</h2><p class="muted">Download management is not implemented yet.</p></div>`;break;case 'settings':main.innerHTML=`<h1 class="heading">SETTINGS</h1><div class="muted">Local launcher preferences</div><div class="panel"><div class="field"><label>Display name</label><input id="name" value="${safe(db.settings.name||'Player')}"></div><div class="field"><label>Preferred Minecraft version</label><input id="version" value="${safe(db.settings.version||'1.21.1')}"></div><div class="field"><label>Preferred memory allocation (MB)</label><input id="ram" type="number" min="1024" step="512" value="${safe(db.settings.ram||'4096')}"></div>${button('SAVE SETTINGS','savesettings','green')}</div>${notice('Preferences are managed through your player menu after Microsoft sign-in.')}`;break}}

function versionButtons(){
 const list=gameVersions.length?gameVersions:[{version:'1.21.11',version_type:'release'},{version:'1.21.1',version_type:'release'},{version:'1.20.1',version_type:'release'}];
 const matching=list.filter(v=>versionChannel==='snapshot'?v.version_type==='snapshot':['release','alpha','beta'].includes(v.version_type));
 if(!matching.length)return `<div class="version-empty">${gameVersions.length?'No versions found':'Loading versions…'}</div>`;
 return matching.map(v=>`<button type="button" class="version-choice ${v.version===storeVersion?'chosen':''}" data-version="${safe(v.version)}">${safe(v.version)}${v.version_type==='alpha'?' · Alpha':v.version_type==='beta'?' · Beta':''}</button>`).join('');
}
function updateVersionPicker(){const list=document.getElementById('version-list');if(list)list.innerHTML=versionButtons();document.querySelectorAll('[data-channel]').forEach(b=>b.classList.toggle('chosen',b.dataset.channel===versionChannel));const t=document.getElementById('version-toggle');if(t)t.innerHTML=`${safe(storeVersion||'Select version')} <span>▾</span>`;}
function versionOptions(){
 const list=gameVersions.length?gameVersions:[{version:'26.3',version_type:'release'},{version:'1.21.11',version_type:'release'},{version:'1.21.1',version_type:'release'},{version:'1.20.1',version_type:'release'},{version:'1.12.2',version_type:'release'},{version:'1.8.9',version_type:'release'}];
 const matching=list.filter(v=>versionChannel==='snapshot'?v.version_type==='snapshot':['release','alpha','beta'].includes(v.version_type));
 if(!matching.length)return `<option value="">${versionChannel==='snapshot'?'Loading snapshots…':'No versions available'}</option>`;
 return matching.map(v=>`<option value="${safe(v.version)}" ${v.version===storeVersion?'selected':''}>${safe(v.version)}${v.version_type==='alpha'?' (Alpha)':v.version_type==='beta'?' (Beta)':''}</option>`).join('');
}
async function lavaFetch(url, options={}, ms=12000){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),ms);
 try{return await fetch(url,{...options,signal:controller.signal});}
 catch(err){if(err.name==='AbortError')throw new Error('Connection timed out. Modrinth may be unreachable.');throw err;}
 finally{clearTimeout(timeout);}
}
async function loadGameVersions(){
 try{
  const r=await lavaFetch('https://api.modrinth.com/v2/tag/game_version',{headers:{Accept:'application/json'}});
  if(!r.ok)throw Error('HTTP '+r.status);
  const data=await r.json();
  gameVersions=data.filter(v=>v&&v.version&&['release','snapshot','alpha','beta'].includes(v.version_type));
  if(!gameVersions.some(v=>v.version===storeVersion))gameVersions.unshift({version:storeVersion,version_type:'release'});
  if(page==='store')updateVersionPicker();
 }catch(e){console.warn('Modrinth version list unavailable',e);if(page==='store')updateVersionPicker()}
}
async function loadMods(){const id=++storeRequest,box=document.getElementById('modresults');if(!box)return;if(storeProvider==='curseforge'){const caption=document.getElementById('store-caption');if(caption)caption.textContent='CurseForge · Not connected';box.innerHTML=`<div class="loading curseforge-panel"><img src="https://cdn.jsdelivr.net/npm/simple-icons@v15/icons/curseforge.svg" alt="" width="42" height="42"><h2>CurseForge is not connected</h2><p>Lava isn’t connected to CurseForge’s mod and content libraries yet.</p></div>`;const next=document.querySelector('[data-action="nextmods"]');if(next)next.disabled=true;const prev=document.querySelector('[data-action="prevmods"]');if(prev)prev.disabled=true;const info=document.getElementById('pageinfo');if(info)info.textContent='Not connected';return;}if(lavaOffline){box.innerHTML='<div class="loading">Lava is in offline mode. Use LAVA ▾ → Go Online to browse Modrinth.</div>';return;}if(!storeVersion){box.innerHTML='<div class="loading">Loading Minecraft versions from Modrinth…</div>';return;}const facetGroups=[[`project_type:${storeType}`],[`versions:${storeVersion}`]];if(storeEnvironment==='client')facetGroups.push(['client_side:required','client_side:optional']);else if(storeEnvironment==='server')facetGroups.push(['server_side:required','server_side:optional']);const facets=JSON.stringify(facetGroups);const params=new URLSearchParams({query:storeQuery,facets,index:storeSort,limit:'20',offset:String(storePage*20)});try{const response=await lavaFetch('https://api.modrinth.com/v2/search?'+params.toString(),{headers:{Accept:'application/json'}},12000);if(!response.ok)throw new Error('Modrinth returned HTTP '+response.status);const data=await response.json();if(id!==storeRequest||page!=='store')return;const hits=data.hits||[];const caption=document.getElementById('store-caption');if(caption)caption.textContent=`${Number(data.total_hits||0).toLocaleString()} projects · Minecraft ${storeVersion} · ${storeEnvironment==='all'?'All environments':storeEnvironment==='client'?'Client-compatible':'Server-compatible'} · Live from Modrinth`;box.innerHTML=hits.length?hits.map(m=>{const slug=encodeURIComponent(m.slug||m.project_id);const url=`https://modrinth.com/${storeType}/${slug}`;return `<button type="button" class="mod-card" data-project="${safe(m.project_id)}" aria-label="View ${safe(m.title)} details"><div class="mod-image">${m.icon_url?`<img src="${safe(m.icon_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'♨'}</div><div class="mod-info"><div class="mod-title">${safe(m.title)}</div><div class="mod-description">${safe(m.description||'No description available.')}</div><div class="mod-meta"><span>⬇ ${compact(m.downloads)} downloads</span><span>★ ${compact(m.follows)} followers</span></div><div class="mod-author">by ${safe(m.author||'Community')} <span>View details →</span></div></div></button>`}).join(''):'<div class="loading">No matching projects found. Try another version or search term.</div>';document.getElementById('pageinfo').textContent=`Page ${storePage+1} of ${Math.max(1,Math.ceil((data.total_hits||0)/20))}`;document.querySelector('[data-action="nextmods"]').disabled=(storePage+1)*20>=data.total_hits;}catch(err){if(id!==storeRequest||!box.isConnected)return;console.warn('Lava Modrinth request failed:',err);box.innerHTML=`<div class="loading"><h3>Could not connect to Modrinth</h3><p>${safe(err.message)}</p><p>Check your internet connection. The Modrinth service may be unavailable or blocked by a network restriction.</p><button class="blue" data-action="searchmods">Retry</button> <a href="https://modrinth.com/mods" target="_blank" rel="noopener noreferrer">Open Modrinth ↗</a></div>`;}}
let lavaOffline=false;

function projectText(raw){
 // Render a small, safe subset of Markdown without injecting arbitrary HTML.
 const escaped=safe(raw||'No description provided.');
 const lines=escaped.split(/\r?\n/);let inCode=false;
 return lines.map(line=>{
 if(line.trim().startsWith('```')){inCode=!inCode;return inCode?'<pre>':'</pre>';}
 if(inCode)return line+'\n';
 let t=line.replace(/!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)/g,(_,alt,url)=>`<img src="${url}" alt="${alt}" loading="lazy">`)
 .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g,(_,label,url)=>`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`)
 .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');
 const heading=t.match(/^(#{1,3})\s+(.+)$/);if(heading)return `<h${heading[1].length}>${heading[2]}</h${heading[1].length}>`;
 if(/^[-*]\s+/.test(t))return `<p>• ${t.replace(/^[-*]\s+/,'')}</p>`;
 return t.trim()?`<p>${t}</p>`:'';
 }).join('');
}
async function renderProject(){
 const id=activeProject,request=++storeRequest;
 document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page==='store'));
 main.innerHTML=`<div class="project-shell"><div class="project-pathbar"><button class="project-back" data-action="backstore" title="Back to Store"><span class="path-arrow">←</span><span class="path-root">Lava</span><span class="path-sep">\</span><span class="path-label">Store</span><span class="path-sep">\</span><span class="path-label">Loading project…</span></button></div><div class="project-panel">Loading project details from Modrinth…</div></div>`;
 try{
 let data=projectCache.get(id);
 if(!data){const r=await lavaFetch('https://api.modrinth.com/v2/project/'+encodeURIComponent(id));if(!r.ok)throw Error('Project details unavailable (HTTP '+r.status+')');data=await r.json();projectCache.set(id,data)}
 const vr=await lavaFetch('https://api.modrinth.com/v2/project/'+encodeURIComponent(id)+'/version');const versions=vr.ok?await vr.json():[];
 if(request!==storeRequest||activeProject!==id||page!=='store')return;
 const type=data.project_type||'mod',link='https://modrinth.com/'+encodeURIComponent(type)+'/'+encodeURIComponent(data.slug||id);
 const images=(data.gallery||[]).filter(g=>/^https:\/\//.test(g.url||'')).slice(0,12);
 const heroImage=images.find(g=>g.featured)?.url||images[0]?.url||data.icon_url||'';
 const gallery=images.length?`<section class="project-panel" id="project-gallery"><h2>Media & screenshots</h2><img id="project-featured-image" class="project-gallery-feature" src="${safe(heroImage)}" alt="${safe(images[0]?.title||'Project screenshot')}"><div class="project-gallery-thumbs">${images.map((g,i)=>`<button type="button" class="${g.url===heroImage?'active':''}" data-gallery-src="${safe(g.url)}" data-gallery-alt="${safe(g.title||'Project screenshot')}" data-gallery-caption="${safe(g.description||g.title||'') }" aria-label="View screenshot ${i+1}"><img loading="lazy" src="${safe(g.url)}" alt=""></button>`).join('')}</div><div class="project-gallery-caption" id="project-gallery-caption">${safe(images.find(g=>g.url===heroImage)?.description||images.find(g=>g.url===heroImage)?.title||'Screenshots from Modrinth')}</div></section>`:'';
 const matching=versions.filter(v=>(v.game_versions||[]).includes(storeVersion));
 const shown=(matching.length?matching:versions).slice(0,12);
 const fileFor=v=>v.files?.find(f=>f.primary)||v.files?.[0];
 const displayLabel=value=>{const text=String(value??'').trim();if(!text)return 'Not specified';const known={neoforge:'NeoForge',fabric:'Fabric',forge:'Forge',quilt:'Quilt',liteloader:'LiteLoader',rift:'Rift',bukkit:'Bukkit',spigot:'Spigot',paper:'Paper',purpur:'Purpur'};return known[text.toLowerCase()]||text.replace(/(^|[\s_-])([a-z])/g,(_,sep,c)=> (sep==='_'||sep==='-'?' ':sep)+c.toUpperCase());};const projectTypePath=type=>({mod:'Mods',modpack:'Modpacks',shader:'Shaders',resourcepack:'Resource Packs'})[String(type||'').toLowerCase()]||displayLabel(type);
 const verhtml=shown.map(v=>`<div class="project-version"><div><strong>${safe(v.version_number||v.name)}</strong><div class="project-version-sub">${safe(v.name||'')} · ${safe((v.loaders||[]).join(' / ')||'No loader specified')} · ${safe(displayLabel(v.version_type||'release'))}</div></div>${fileFor(v)?`<a href="${safe(fileFor(v).url)}" target="_blank" rel="noopener noreferrer" download>⬇ Download</a>`:'<span class="muted">No file available</span>'}</div>`).join('');
 const newestDownload=shown.find(v=>fileFor(v));
 const downloadURL=newestDownload?fileFor(newestDownload).url:'';
 const chips=(arr,format=true)=>(arr||[]).length?(arr||[]).map(x=>`<span class="project-chip">${safe(format?displayLabel(x):x)}</span>`).join(''):'<span class="project-side-note">Not specified</span>';
 const fact=(label,value,format=false)=>`<div class="project-fact"><span>${label}</span><strong>${safe(format?displayLabel(value):value||'Not specified')}</strong></div>`;
 main.innerHTML=`<div class="project-shell">
 <div class="project-pathbar"><button class="project-back" data-action="backstore" title="Back to Store"><span class="path-arrow">←</span><span class="path-root">Lava</span><span class="path-sep">\</span><span class="path-label">Store</span><span class="path-sep">\</span><span class="path-label">${safe(projectTypePath(type))}</span><span class="path-sep">\</span><span class="path-label">Modrinth</span><span class="path-sep">\</span><span class="path-leaf">${safe(data.title)}</span></button></div>
 <div class="project-hero"><div class="project-hero-bg" style="background-image:url('${safe(heroImage).replace(/'/g,'%27')}')"></div><div class="project-hero-content"><img class="project-hero-icon" src="${safe(data.icon_url||'')}" alt=""><div><div class="eyebrow">LAVA STORE <span style="color:#89bc99">●</span> MODRINTH PROJECT</div><h1>${safe(data.title)}</h1><div class="project-tagline">${safe(data.description||'Community project for Minecraft.')}</div><div class="project-hero-stats"><div class="project-stat"><strong>${compact(data.downloads)}</strong> DOWNLOADS</div><div class="project-stat"><strong>${compact(data.followers)}</strong> FOLLOWERS</div><div class="project-stat"><strong>${safe(displayLabel(data.status||'Listed'))}</strong> STATUS</div></div></div></div></div>
 <div class="project-toolbar">${downloadURL?`<a class="project-install" href="${safe(downloadURL)}" target="_blank" rel="noopener noreferrer" download>⬇ DOWNLOAD FILE</a>`:'<span class="project-no-install">No downloadable files available</span>'}<span class="project-side-note">For Minecraft ${safe(storeVersion)}${matching.length?' · Compatible version found':' · Check compatibility'}</span><a class="project-external" href="${safe(link)}" target="_blank" rel="noopener noreferrer">View on Modrinth ↗</a></div>
 <div class="project-layout"><div class="project-primary"><nav class="project-jump"><a href="#project-overview">OVERVIEW</a>${images.length?'<a href="#project-gallery">SCREENSHOTS</a>':''}<a href="#project-versions">VERSIONS</a></nav>
 ${gallery}<section class="project-panel" id="project-overview"><h2>About this project</h2><div class="project-description">${projectText(data.body)}</div></section>
 <section class="project-panel" id="project-versions"><h2>Available downloads</h2><div class="project-side-note">${matching.length?`Showing versions compatible with Minecraft ${safe(storeVersion)}.`:`No versions found specifically for Minecraft ${safe(storeVersion)}; showing other releases. Check compatibility before downloading.`} Files are supplied by Modrinth.</div>${verhtml||'<p class="muted">No versions available.</p>'}</section></div>
 <aside><section class="project-panel"><div class="project-side-title">PROJECT INFORMATION</div>${fact('Project type',type,true)}${fact('Client support',data.client_side,true)}${fact('Server support',data.server_side,true)}${fact('License',data.license?.name||data.license?.id)}${fact('Published',(data.published||'').slice(0,10))}${fact('Last updated',(data.updated||'').slice(0,10))}</section>
 <section class="project-panel"><div class="project-side-title">MOD LOADERS</div><div class="project-chipset">${chips(data.loaders)}</div><div class="project-side-title" style="margin-top:23px">CATEGORIES</div><div class="project-chipset">${chips(data.categories)}</div></section>
 <section class="project-panel"><div class="project-side-title">MINECRAFT VERSIONS</div><div class="project-chipset">${chips((data.game_versions||[]).slice(-16),false)}</div>${(data.game_versions||[]).length>16?`<p class="project-side-note">And ${(data.game_versions||[]).length-16} more supported versions.</p>`:''}</section>
 <div class="notice">Modrinth provides these downloads. Automatic mod installation is not connected yet.</div></aside></div></div>`;

 }catch(err){if(request!==storeRequest||activeProject!==id)return;main.innerHTML=`<div class="project-shell"><div class="project-pathbar"><button class="project-back" data-action="backstore" title="Back to Store"><span class="path-arrow">←</span><span class="path-root">Lava</span><span class="path-sep">\</span><span class="path-label">Store</span><span class="path-sep">\</span><span class="path-label">Project error</span></button></div><div class="project-panel"><h2>Could not load project</h2><p>${safe(err.message)}</p><button class="blue" data-action="retryproject">Retry</button></div></div>`;}
}
function closeLavaMenu(){document.getElementById('lava-menu').classList.add('hidden');document.getElementById('lava-menu-button').setAttribute('aria-expanded','false')}
function lavaMenuAction(action){closeLavaMenu();switch(action){
case 'settings':lavaOpenAppearance();break;
case 'offline':lavaOffline=!lavaOffline;document.getElementById('offline-menu-item').textContent=lavaOffline?'Go Online...':'Go Offline...';document.getElementById('status').textContent=lavaOffline?'Offline mode (Store requires internet)':'Ready　　⬇ Downloads: 0';if(page==='store')render();break;
case 'account':lavaMenuAccount();break;
case 'signout':lavaSignOutMenu();break;
case 'updates':lavaCheckForUpdates();break;
case 'savebackup':lavaSaveBackup();break;
case 'restorebackup':lavaRestoreBackup();break;
case 'reset':lavaFactoryReset();break;
case 'exit':lavaExit();break;
}}
document.getElementById('lava-menu-button').addEventListener('click',e=>{e.stopPropagation();const m=document.getElementById('lava-menu');const open=m.classList.toggle('hidden')===false;document.getElementById('lava-menu-button').setAttribute('aria-expanded',String(open))});
document.addEventListener('click',e=>{const item=e.target.closest('[data-menu-action]');if(item){lavaMenuAction(item.dataset.menuAction);return}if(!e.target.closest('.brand-wrap'))closeLavaMenu()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeLavaMenu()});
function compact(n){return new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(Number(n||0))}
let lavaServerEditIndex=null;
function openLavaServerDialog(index=null){
 const editing=index!==null,old=editing?db.servers[index]:null;
 if(editing&&(!old||old.builtIn==='hypixel'))return;
 lavaServerEditIndex=editing?index:null;
 const overlay=document.getElementById('lava-server-overlay');
 document.getElementById('lava-server-title').textContent=editing?'Edit server':'Add a server';
 document.getElementById('lava-server-submit').textContent=editing?'SAVE CHANGES':'ADD SERVER';
 document.getElementById('lava-server-name').value=old?.name||'';
 document.getElementById('lava-server-ip').value=old?.address||'';
 document.getElementById('lava-server-error').textContent='';
 overlay.hidden=false;document.getElementById('lava-server-name').focus();
}
function closeLavaServerDialog(){document.getElementById('lava-server-overlay').hidden=true;lavaServerEditIndex=null;}
document.getElementById('lava-server-form').addEventListener('submit',event=>{
 event.preventDefault();
 const name=document.getElementById('lava-server-name').value.trim();
 const address=document.getElementById('lava-server-ip').value.trim();
 const error=document.getElementById('lava-server-error');
 if(!name){error.textContent='Please enter a server name.';document.getElementById('lava-server-name').focus();return;}
 if(!address||/\s/.test(address)||/[<>'"\\/]/.test(address)){error.textContent='Enter a valid server address, such as hypixel.net or play.example.com:25565.';document.getElementById('lava-server-ip').focus();return;}
 if(lavaServerEditIndex!==null){const old=db.servers[lavaServerEditIndex];if(!old||old.builtIn==='hypixel'){closeLavaServerDialog();return;}db.servers[lavaServerEditIndex]={...old,name,address};}
 else{db.servers.push({name,address,version:''});}
 try{save();}catch{error.textContent='Lava could not save this server. Check application storage.';return;}
 const newIndex=lavaServerEditIndex===null?db.servers.length-1:lavaServerEditIndex;
 closeLavaServerDialog();selected='server'+newIndex;page='library';render();
});
document.getElementById('lava-server-overlay').addEventListener('click',event=>{if(event.target.id==='lava-server-overlay'||event.target.closest('[data-server-cancel]'))closeLavaServerDialog();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.getElementById('lava-server-overlay').hidden){event.preventDefault();closeLavaServerDialog();}});
function promptEntry(type,index=null){let old=index===null?{}:db[type+'s'][index],name=prompt(`Enter ${type} name:`,old.name||'');if(!name||!name.trim())return;let address=type==='server'?prompt('Server address (example: play.example.com):',old.address||''):null;if(type==='server'&&(!address||!address.trim()))return;let version=prompt('Minecraft version (optional):',old.version||db.settings.version||'')||'';let entry={name:name.trim(),version:version.trim()};if(type==='server')entry.address=address.trim();if(index===null)db[type+'s'].push(entry);else db[type+'s'][index]=entry;save();render()}function act(a){if(a==='backstore'){activeProject=null;render();return;}if(a==='retryproject'){renderProject();return;}if(a==='addserver')openLavaServerDialog();if(a==='addworld')lavaOpenSavesFolder();if(a==='searchmods'){storeQuery=document.getElementById('modsearch')?.value.trim()||'';storePage=0;render()}if(a==='nextmods'){storePage++;render()}if(a==='prevmods'){storePage=Math.max(0,storePage-1);render()}if(a==='modrinth')window.open('https://modrinth.com','_blank','noopener');if(a==='savesettings'){db.settings={name:document.getElementById('name').value,version:document.getElementById('version').value,ram:document.getElementById('ram').value};save();alert('Settings saved locally.')}if(selected){let t=['world','server','modpack'].find(t=>selected.startsWith(t))||'server',i=Number(selected.slice(t.length)),x=db[t+'s'][i];if(a==='edit'){if(t==='server'){if(x?.builtIn==='hypixel')return;openLavaServerDialog(i);}else if(t==='modpack')openLavaModpackDialog(i);else if(t==='world')lavaOpenSavesFolder();}if(a==='remove'&&x?.builtIn==='hypixel')return;if(a==='remove'&&confirm(`Remove ${x.name} from Lava? (This does not delete any Minecraft files.)`)){db[t+'s'].splice(i,1);selected=null;save();render()}if(a==='primary'){lavaOpenLaunchTarget(t,i);return;}}}document.addEventListener('click',e=>{const thumb=e.target.closest('[data-gallery-src]');if(!thumb)return;const img=document.getElementById('project-featured-image');if(!img)return;img.src=thumb.dataset.gallerySrc;img.alt=thumb.dataset.galleryAlt||'Project screenshot';const cap=document.getElementById('project-gallery-caption');if(cap)cap.textContent=thumb.dataset.galleryCaption||'Screenshots from Modrinth';document.querySelectorAll('.project-gallery-thumbs button').forEach(b=>b.classList.toggle('active',b===thumb));});

// Favorites and custom server artwork apply only to Library entries, never the Store.
function changeLibraryFavorite(code){const id=String(code||'').replace(':','');const entry=libraryEntries().find(e=>e.id===id);if(!entry)return;entry.x.favorite=!entry.x.favorite;try{save();}catch(err){entry.x.favorite=!entry.x.favorite;alert('Lava could not save the favorite in local storage.');return;}render();}
function uploadLibraryBanner(){const active=libraryEntries().find(e=>e.id===selected);if(!active||!['server','world'].includes(active.t))return;const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.style.display='none';document.body.appendChild(input);input.addEventListener('change',async()=>{const file=input.files?.[0];input.remove();if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){alert('Choose a PNG, JPEG, or WebP image.');return;}if(file.size>12*1024*1024){alert('Choose an image under 12 MB. Lava will resize it automatically.');return;}try{const url=URL.createObjectURL(file);const img=new Image();try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});}finally{URL.revokeObjectURL(url)}const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=420;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas not supported');const sourceAspect=img.naturalWidth/img.naturalHeight,targetAspect=canvas.width/canvas.height;let sw,sh,sx,sy;if(sourceAspect>targetAspect){sh=img.naturalHeight;sw=sh*targetAspect;sx=(img.naturalWidth-sw)/2;sy=0;}else{sw=img.naturalWidth;sh=sw/targetAspect;sx=0;sy=(img.naturalHeight-sh)/2;}ctx.drawImage(img,sx,sy,sw,sh,0,0,canvas.width,canvas.height);const result=canvas.toDataURL('image/jpeg',.75);const prior=active.x.banner;active.x.banner=result;try{save();}catch(err){active.x.banner=prior;alert('Lava could not save the banner. Try a smaller image or remove an older custom banner.');return;}render();}catch(err){console.error(err);alert('That image could not be used as a banner. Please try another image.');}});input.addEventListener('cancel',()=>input.remove());input.click();}
document.addEventListener('click',e=>{const fav=e.target.closest('[data-lib-favorite]');if(fav){e.preventDefault();e.stopPropagation();changeLibraryFavorite(fav.dataset.libFavorite);return;}const banner=e.target.closest('[data-lib-banner]');if(banner){e.preventDefault();if(banner.dataset.libBanner==='upload')uploadLibraryBanner();else{const active=libraryEntries().find(o=>o.id===selected);if(active&&['server','world'].includes(active.t)&&confirm('Restore the automatic banner?')){delete active.x.banner;delete active.x.bannerId;save();render();}}return;}});
document.addEventListener('click',e=>{if(e.target.closest('[data-lib-refresh]')){const active=libraryEntries().find(x=>x.id===selected);if(active?.t==='server'){serverStatusCache.delete(serverKey(active.x.address));fetchServerStatus(active.x.address,true);}return;}});
document.addEventListener('click',e=>{let filter=e.target.closest('[data-lib-filter]');if(filter){libCategory=filter.dataset.libFilter;render();return;}let add=e.target.closest('[data-lib-add]');if(add){libraryAdd(add.dataset.libAdd);return;}if(e.target.closest('[data-lib-home]')){selected=null;render();return;}if(e.target.closest('[data-lib-placeholder]')){const item=libraryEntries().find(x=>x.id===selected);if(item)lavaOpenLaunchTarget(item.t,item.i);return;}});
document.addEventListener('input',e=>{if(e.target.id==='lib-search'){libSearch=e.target.value;let pos=e.target.selectionStart;renderLibrary();let box=document.getElementById('lib-search');box?.focus();try{box?.setSelectionRange(pos,pos)}catch{}}});
document.addEventListener('click',e=>{let project=e.target.closest('[data-project]');if(project){activeProject=project.dataset.project;renderProject();return;}let provider=e.target.closest('[data-provider]');if(provider){activeProject=null;storeProvider=provider.dataset.provider;storePage=0;render();return;}let nav=e.target.closest('[data-page]');if(nav){page=nav.dataset.page;activeProject=null;selected=null;render();return}let entry=e.target.closest('[data-entry]');if(entry){selected=entry.dataset.entry.replace(':','');page='library';const opened=libraryEntries().find(o=>o.id===selected);if(opened){opened.x.lastViewed=Date.now();try{save()}catch(err){console.warn('Unable to record recent Library view',err)}}render();return}let url=e.target.closest('[data-url]');if(url){window.open(url.dataset.url,'_blank','noopener');return}let a=e.target.closest('[data-action]');if(a)act(a.dataset.action);if(e.target.closest('#addserver'))openLavaServerDialog();if(e.target.closest('#addworld'))lavaOpenSavesFolder()});document.addEventListener('change',e=>{if(e.target.id==='versionchannel'){versionChannel=e.target.value;const matching=gameVersions.filter(v=>versionChannel==='snapshot'?v.version_type==='snapshot':['release','alpha','beta'].includes(v.version_type));storeVersion=matching[0]?.version|| (versionChannel==='snapshot'?'':'1.21.1');storePage=0;render();if(!gameVersions.length)loadGameVersions()}if(e.target.id==='mcversion'){if(!e.target.value)return;storeVersion=e.target.value;storePage=0;render()}if(e.target.name==='store-sort'){storeSort=e.target.value;storePage=0;render();reopenStoreFilters()}if(e.target.name==='store-environment'){storeEnvironment=e.target.value;storePage=0;render();reopenStoreFilters()}});document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='modsearch'){storeQuery=e.target.value.trim();storePage=0;render()}});document.addEventListener('click',e=>{
 const toggle=e.target.closest('#version-toggle'),channel=e.target.closest('[data-channel]'),version=e.target.closest('[data-version]');
 const pop=document.getElementById('version-popover'),btn=document.getElementById('version-toggle');
 if(toggle&&pop){pop.hidden=!pop.hidden;btn.setAttribute('aria-expanded',String(!pop.hidden));return;}
 if(channel){versionChannel=channel.dataset.channel;const matching=gameVersions.filter(v=>versionChannel==='snapshot'?v.version_type==='snapshot':['release','alpha','beta'].includes(v.version_type));storeVersion=matching[0]?.version||'';storePage=0;render();const p=document.getElementById('version-popover'),b=document.getElementById('version-toggle');if(p&&b){p.hidden=false;b.setAttribute('aria-expanded','true')}return;}
 if(version){storeVersion=version.dataset.version;storePage=0;render();return;}
 if(pop&&!e.target.closest('.version-picker')){pop.hidden=true;btn?.setAttribute('aria-expanded','false');}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const p=document.getElementById('version-popover');if(p){p.hidden=true;document.getElementById('version-toggle')?.setAttribute('aria-expanded','false')}}});
function reopenStoreFilters(){const pop=document.getElementById('store-filter-popover'),toggle=document.getElementById('store-filter-toggle');if(pop&&toggle){pop.hidden=false;toggle.setAttribute('aria-expanded','true')}}
document.addEventListener('click',e=>{const toggle=e.target.closest('#store-filter-toggle'),pop=document.getElementById('store-filter-popover'),button=document.getElementById('store-filter-toggle');if(toggle&&pop){pop.hidden=!pop.hidden;button.setAttribute('aria-expanded',String(!pop.hidden));return;}if(pop&&!e.target.closest('.store-filter-wrap')){pop.hidden=true;button?.setAttribute('aria-expanded','false')}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const pop=document.getElementById('store-filter-popover');if(pop){pop.hidden=true;document.getElementById('store-filter-toggle')?.setAttribute('aria-expanded','false')}}});
document.addEventListener('click',e=>{let t=e.target.closest('[data-type]');if(t){activeProject=null;storeType=t.dataset.type;storeQuery='';storePage=0;render()}});// Poll only when the Library is visible; don't send background requests from other tabs.
setInterval(()=>{if(page!=='library'||lavaOffline||document.hidden)return;const entries=libraryEntries().filter(e=>e.t==='server');for(const e of entries)fetchServerStatus(e.x.address,true);},statusRefreshInterval);
render();loadGameVersions();



/* Lava v0.9.2 — desktop appearance, native backups, local Library profiles */
let lavaState={account:null,settings:{theme:'ocean',ram_mb:4096,gradient_start:'#22384b',gradient_end:'#101e2b'},system:{max_alloc_mb:8192,ram_gb:16},steve_head:'',oauth_available:false,version:'0.10.0'};
const lavaPresets={ocean:['#22384b','#101e2b'],ember:['#573c34','#201e2a'],violet:['#3d3156','#161b31'],forest:['#244b43','#152831']};
const lavaEl=id=>document.getElementById(id);
const lavaEscape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lavaCall=async(method,...args)=>{if(!window.pywebview?.api?.[method])throw Error('Lava desktop connection unavailable. Start the installed Lava application.');return await window.pywebview.api[method](...args)};
const lavaMessage=(text,bad=false)=>{const e=lavaEl('status');if(e){e.textContent=String(text);e.style.color=bad?'#ffaaa1':'';e.title=String(text)}};
let lavaModal=null,lavaPanel='game',lavaLoginPending=false,lavaSelectedVersion='1.21.1';
function lavaCloseModal(){lavaEl('lava-layer')?.classList.remove('open');lavaModal=null;}
function lavaModalOpen(title,kicker,body,wide=false){
 const layer=lavaEl('lava-layer');layer.classList.add('open');lavaModal=title;
 lavaEl('lava-modal').classList.toggle('wide',!!wide);
 lavaEl('lava-modal').innerHTML=`<div class="lava-modal-head"><div><div class="kicker">${lavaEscape(kicker)}</div><h2>${lavaEscape(title)}</h2></div><button class="lava-close" id="lava-close" aria-label="Close">×</button></div>${body}`;
 lavaEl('lava-close').onclick=lavaCloseModal;
}
function lavaPortrait(){return lavaState.account?.head||lavaState.steve_head||''}
function lavaRefreshProfileButton(){
 const h=lavaEl('lava-player-head'); if(h&&lavaPortrait())h.src=lavaPortrait();
 if(lavaEl('lava-player-name'))lavaEl('lava-player-name').textContent=lavaState.account?.name||(localStorage.getItem('lava-connected-installation')==='yes'?'Using Installed Minecraft':'Not logged in');
 if(lavaEl('lava-player-sub'))lavaEl('lava-player-sub').textContent=lavaState.account?'MICROSOFT · JAVA EDITION':(localStorage.getItem('lava-connected-installation')==='yes'?'LOCAL FILES CONNECTED':'NOT CONNECTED');
 lavaEl('lava-player-button')?.classList.toggle('connected',!!lavaState.account);
 if(page==='friends')render();
}
function lavaApplyAppearance(override){
 const s=override||lavaState.settings,base=lavaPresets[s.theme]||[s.gradient_start,s.gradient_end];
 const a=s.theme==='custom'?(s.gradient_start||base[0]):base[0];
 const b=s.theme==='custom'?(s.gradient_end||base[1]):base[1];
 document.documentElement.style.setProperty('--lava-ui-a',a);
 document.documentElement.style.setProperty('--lava-ui-b',b);
 document.documentElement.style.setProperty('--lava-accent',s.theme==='ember'?'#e9a17d':s.theme==='violet'?'#b4a0ec':s.theme==='forest'?'#83c2a1':'#79b9dd');
 document.documentElement.dataset.lavaTheme=s.theme;
}
function lavaOpenLogin(){
 const ready=lavaState.oauth_available;
 lavaLoginPending=false;
 lavaModalOpen('Connect your Minecraft account','LAVA / MICROSOFT LOGIN',`<div class="lava-modal-body">
 <div class="lava-login-icon">▣</div><p class="lava-desc">Sign in with the Microsoft account that owns <strong>Minecraft: Java Edition</strong>. Lava opens Microsoft's official login page. Your password is never entered into Lava.</p>
 <div class="lava-hint" id="lava-login-instructions">${ready?'Your session will be stored securely in Windows Credential Manager.':'Microsoft authentication is not configured for this build. Lava needs an approved Microsoft application registration before account sign-in can work. The developer can add its application ID to <b>lava_config.json</b>.'}</div>
 <div class="lava-actions lava-login-actions"><button class="green" id="lava-login-start" ${ready?'':'disabled'}>SIGN IN WITH MICROSOFT</button><button class="ghost" id="lava-login-local">USE INSTALLED MINECRAFT</button></div>
 <details class="lava-registration"><summary>Set up Lava's Microsoft application registration</summary><p class="lava-desc">Create a public desktop application registration in Microsoft Entra. An application ID alone is not sufficient: Minecraft Services must also authorize it. You must complete registration and any approval process with an eligible developer account.</p><label class="lava-control-label" for="lava-client-id">APPLICATION (CLIENT) ID · PUBLIC GUID ONLY</label><input id="lava-client-id" class="lava-control" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocomplete="off" spellcheck="false"><div class="lava-actions"><button class="ghost" id="lava-ms-guide">OFFICIAL REGISTRATION GUIDE</button><button class="green" id="lava-save-client-id">SAVE APP ID</button></div><p class="lava-alert-message" id="lava-client-id-msg"></p></details>
 <div id="lava-login-finish" hidden><label class="lava-control-label" for="lava-callback">RETURN URL FROM MICROSOFT</label><input id="lava-callback" class="lava-control" placeholder="Paste the final Microsoft redirect URL" spellcheck="false" autocomplete="off"><p class="lava-desc" style="margin-top:9px">Copy the entire URL from the final redirect page. Keep it private; it contains a temporary authorization code.</p><div class="lava-actions"><button class="green" id="lava-complete">FINISH SIGN-IN</button></div></div>
 <p class="lava-alert-message" id="lava-login-msg"></p></div>`);
 const feedback=(msg,bad=false)=>{const e=lavaEl('lava-login-msg');e.textContent=msg;e.classList.toggle('bad',bad)};
 lavaEl('lava-login-start').onclick=async()=>{try{const r=await lavaCall('begin_login');if(!r.ok)throw Error(r.error);lavaLoginPending=true;lavaEl('lava-login-finish').hidden=false;lavaEl('lava-login-instructions').textContent=r.message;feedback('Complete sign-in in the Microsoft window, then paste the final URL below.');}catch(e){feedback(e.message,true)}};
 const finish=async()=>{try{feedback('Authenticating with Minecraft Services…');const r=await lavaCall('complete_login',lavaEl('lava-callback').value);if(!r.ok)throw Error(r.error);lavaState.account=r.account;lavaRefreshProfileButton();lavaCloseModal();lavaMessage('Signed in as '+r.account.name);lavaOpenPlayer();}catch(e){feedback(e.message,true)}};
 lavaEl('lava-complete').onclick=finish;
 lavaEl('lava-login-local').onclick=lavaOpenLocalChoice;
 lavaEl('lava-ms-guide').onclick=async()=>{try{await lavaCall('open_registration_guide')}catch(e){feedback(e.message,true)}};
 lavaEl('lava-save-client-id').onclick=async()=>{const el=lavaEl('lava-client-id-msg');try{const r=await lavaCall('save_microsoft_client_id',lavaEl('lava-client-id').value.trim());if(!r.ok)throw Error(r.error);lavaState.oauth_available=r.oauth_available;lavaEl('lava-login-start').disabled=!r.oauth_available;lavaEl('lava-login-instructions').textContent=r.message;el.textContent=r.message;}catch(e){el.textContent=e.message;el.classList.add('bad')}};
}
function lavaOpenPlayer(panel='game'){
 if(!lavaState.account){lavaOpenLogin();return;}
 lavaPanel=panel;
 const p=lavaState.account,accountName=lavaEscape(p.name),uuid=lavaEscape(p.uuid||'');
 const labels=`<div class="lava-sections"><button class="lava-section-tab ${panel==='game'?'active':''}" data-lava-panel="game">GAME SETTINGS</button><button class="lava-section-tab ${panel==='performance'?'active':''}" data-lava-panel="performance">PERFORMANCE</button></div>`;
 lavaModalOpen('Player settings','LAVA / ACCOUNT',`${labels}<div class="lava-modal-body"><div class="lava-split-profile"><img src="${lavaPortrait()}" alt="Minecraft skin head"><div><strong>${accountName}</strong><span>AUTHENTICATED JAVA EDITION ACCOUNT</span><span>${uuid}</span></div></div><div id="lava-player-content"></div></div>`,true);
 lavaEl('lava-modal').querySelectorAll('[data-lava-panel]').forEach(el=>el.onclick=()=>lavaOpenPlayer(el.dataset.lavaPanel));
 if(panel==='game')lavaGameSettings(); else lavaPerformanceSettings();
}
function lavaGameSettings(){
 const ram=lavaState.settings.ram_mb||4096,max=lavaState.system.max_alloc_mb||8192;
 lavaEl('lava-player-content').innerHTML=`<div class="lava-metric-header"><h3>Maximum Minecraft memory</h3><strong id="lava-ram-value">${(ram/1024).toFixed(1)} GB</strong></div>
 <input class="lava-ram-slider" id="lava-ram" type="range" min="1024" max="${max}" value="${ram}" step="512" aria-label="Maximum Minecraft RAM in megabytes"><div class="lava-slider-labels"><span>1 GB</span><span>${(max/1024).toFixed(1)} GB recommended maximum</span></div>
 <div class="lava-hint">Your PC has <b>${lavaState.system.ram_gb} GB</b> of RAM. Lava limits the slider to about 75% of installed memory to leave room for Windows and other apps. This setting applies to Minecraft launched through Lava.</div>
 <label class="lava-control-label" for="lava-mc-version">MINECRAFT VERSION · VANILLA</label><select id="lava-mc-version" class="lava-control"><option value="${lavaEscape(lavaSelectedVersion)}">${lavaEscape(lavaSelectedVersion)}</option></select>
 <div class="lava-actions"><button class="ghost" id="lava-versions">LOAD VERSIONS</button><button class="green" id="lava-play-now">▶ INSTALL / PLAY</button></div><p id="lava-player-msg" class="lava-alert-message">Choose a version and press Play. Files will be installed in Lava's own game directory.</p>
 <div class="lava-divider"></div><div class="lava-actions"><button class="ghost" id="lava-signout">SIGN OUT</button></div>`;
 const slider=lavaEl('lava-ram');slider.oninput=()=>lavaEl('lava-ram-value').textContent=(Number(slider.value)/1024).toFixed(1)+' GB';
 slider.onchange=async()=>{try{const r=await lavaCall('save_memory',Number(slider.value));if(!r.ok)throw Error(r.error);lavaState.settings.ram_mb=r.ram_mb;lavaMessage(`RAM allocation: ${(r.ram_mb/1024).toFixed(1)} GB`);}catch(e){lavaEl('lava-player-msg').textContent=e.message}};
 lavaEl('lava-versions').onclick=async()=>{const btn=lavaEl('lava-versions');btn.disabled=true;lavaEl('lava-player-msg').textContent='Loading the official Minecraft version manifest…';try{const r=await lavaCall('list_versions');if(!r.ok)throw Error(r.error);const list=lavaEl('lava-mc-version');list.innerHTML=r.versions.map(v=>`<option value="${lavaEscape(v.id)}">${lavaEscape(v.id)} · ${lavaEscape(v.type)}</option>`).join('');if(r.versions.some(v=>v.id===lavaSelectedVersion))list.value=lavaSelectedVersion;lavaEl('lava-player-msg').textContent=r.versions.length+' official versions available (including releases, snapshots and historical versions).';}catch(e){lavaEl('lava-player-msg').textContent=e.message}finally{btn.disabled=false}};
 lavaEl('lava-mc-version').onchange=e=>lavaSelectedVersion=e.target.value;
 lavaEl('lava-play-now').onclick=async()=>{const select=lavaEl('lava-mc-version');lavaSelectedVersion=select.value;const el=lavaEl('lava-player-msg');el.textContent=`Preparing Minecraft ${lavaSelectedVersion}…`;try{const r=await lavaCall('launch',lavaSelectedVersion);if(!r.ok)throw Error(r.error);el.textContent=r.message;lavaMessage(r.message)}catch(e){el.textContent=e.message;el.classList.add('bad')}};
 lavaEl('lava-signout').onclick=async()=>{try{const r=await lavaCall('sign_out');if(!r.ok)throw Error(r.error);lavaState.account=null;lavaCloseModal();lavaRefreshProfileButton();lavaMessage('Signed out of Minecraft');}catch(e){lavaMessage(e.message,true)}};
}
function lavaSpecRow(label,value){return `<div class="lava-spec-row"><small>${lavaEscape(label)}</small><strong>${lavaEscape(value)}</strong></div>`}
function lavaPerformanceSettings(){
 const i=lavaState.system;
 lavaEl('lava-player-content').innerHTML=`<p class="lava-desc">Your detected hardware compared with the current <strong>Minecraft: Java Edition</strong> minimum requirements published by Mojang in July 2026. Compatibility cannot be fully confirmed from hardware names alone.</p>
 <div class="lava-specs"><div class="lava-spec-panel"><h3>YOUR COMPUTER</h3>${lavaSpecRow('PROCESSOR',i.cpu)}${lavaSpecRow('CPU CORES / THREADS',i.cores+' cores · '+i.threads+' threads')}${lavaSpecRow('MEMORY',i.ram_gb+' GB installed')}${lavaSpecRow('GRAPHICS',i.gpu)}${lavaSpecRow('OPERATING SYSTEM',i.os)}</div>
 <div class="lava-spec-panel"><h3>OFFICIAL JAVA MINIMUM</h3>${lavaSpecRow('PROCESSOR',i.minecraft_minimum.cpu)}${lavaSpecRow('SYSTEM RAM',i.minecraft_minimum.ram)}${lavaSpecRow('GRAPHICS',i.minecraft_minimum.gpu)}${lavaSpecRow('OPERATING SYSTEM',i.minecraft_minimum.os)}${lavaSpecRow('RECOMMENDED MEMORY',i.minecraft_minimum.recommended_ram)}</div></div>
 <div class="lava-hint">Lava cannot currently verify Vulkan 1.3 support or dedicated GPU VRAM. A modded setup may need more memory and a stronger GPU than the vanilla requirements.</div>
 <div class="lava-actions"><button class="ghost" id="lava-refresh-hardware">REFRESH INFORMATION</button></div>`;
 lavaEl('lava-refresh-hardware').onclick=async()=>{try{const r=await lavaCall('info');lavaState.system=r.system;lavaPerformanceSettings()}catch(e){lavaMessage(e.message,true)}};
}
function lavaOpenAppearance(){
 const s=lavaState.settings;
 lavaModalOpen('Lava appearance','LAVA / LAUNCHER SETTINGS',`<div class="lava-modal-body"><p class="lava-desc">Choose a complete palette for the Store, Library, header, and panels, or make your own gradient.</p>
 <label class="lava-control-label">COLOR PRESET</label><div class="lava-theme-presets">${Object.entries(lavaPresets).map(([name,[a,b]])=>`<button type="button" class="lava-theme ${s.theme===name?'active':''}" data-theme-preset="${name}"><span class="lava-theme-preview" style="background:linear-gradient(135deg,${a},${b})"></span><span class="lava-theme-name">${name[0].toUpperCase()+name.slice(1)}</span></button>`).join('')}</div>
 <div class="lava-color-row"><label>GRADIENT START<input type="color" id="lava-color-a" value="${lavaEscape(s.gradient_start)}"></label><label>GRADIENT END<input type="color" id="lava-color-b" value="${lavaEscape(s.gradient_end)}"></label></div>
 <p class="lava-desc" style="margin-top:12px">Preset buttons apply instantly and save automatically. Custom color changes preview immediately; press Save to keep them.</p>
 <div class="lava-actions lava-appearance-actions"><button class="ghost" id="lava-open-files">OPEN LAVA FILES</button><button class="ghost" id="lava-default-appearance">RESTORE DEFAULTS</button><button class="green" id="lava-save-appearance">SAVE APPEARANCE</button></div><p class="lava-alert-message" id="lava-appearance-msg"></p></div>`);
 const buttons=()=>lavaEl('lava-modal')?.querySelectorAll('[data-theme-preset]')||[];
 let theme=s.theme;
 const feedback=(m,bad=false)=>{const el=lavaEl('lava-appearance-msg');if(el){el.textContent=m;el.classList.toggle('bad',bad)}};
 const mark=()=>buttons().forEach(el=>el.classList.toggle('active',el.dataset.themePreset===theme));
 const preview=()=>lavaApplyAppearance({theme,gradient_start:lavaEl('lava-color-a').value,gradient_end:lavaEl('lava-color-b').value});
 buttons().forEach(el=>el.onclick=async()=>{
   theme=el.dataset.themePreset;const v=lavaPresets[theme];lavaEl('lava-color-a').value=v[0];lavaEl('lava-color-b').value=v[1];mark();preview();
   try{const r=await lavaCall('save_appearance',theme,v[0],v[1]);if(!r.ok)throw Error(r.error);lavaState.settings=r.settings;feedback(`${theme[0].toUpperCase()+theme.slice(1)} theme applied and saved.`);lavaMessage('Lava appearance saved');}catch(e){feedback(e.message,true)}
 });
 for(const id of ['lava-color-a','lava-color-b'])lavaEl(id).oninput=()=>{theme='custom';mark();preview();feedback('Custom colors previewed. Save to keep these colors.')};
 lavaEl('lava-save-appearance').onclick=async()=>{try{const r=await lavaCall('save_appearance',theme,lavaEl('lava-color-a').value,lavaEl('lava-color-b').value);if(!r.ok)throw Error(r.error);lavaState.settings=r.settings;lavaApplyAppearance();feedback('Appearance saved.');lavaMessage('Lava appearance saved')}catch(e){feedback(e.message,true)}};
 lavaEl('lava-default-appearance').onclick=async()=>{try{const r=await lavaCall('restore_default_appearance');if(!r.ok)throw Error(r.error);lavaState.settings=r.settings;theme='ocean';lavaEl('lava-color-a').value=r.settings.gradient_start;lavaEl('lava-color-b').value=r.settings.gradient_end;mark();lavaApplyAppearance();feedback('Restored Lava’s default Ocean appearance.');lavaMessage('Appearance restored to defaults.')}catch(e){feedback(e.message,true)}};
 lavaEl('lava-open-files').onclick=async()=>{try{const r=await lavaCall('open_lava_files');if(!r.ok)throw Error(r.error);feedback('Opened '+r.path)}catch(e){feedback(e.message,true)}};
}
function lavaInfoDialog(title,message,kicker='LAVA / INFORMATION'){
 lavaModalOpen(title,kicker,`<div class="lava-modal-body"><p class="lava-desc" id="lava-info-text">${lavaEscape(message)}</p><div class="lava-actions"><button class="green" id="lava-info-ok">OK</button></div></div>`);
 lavaEl('lava-info-ok').onclick=lavaCloseModal;
}
async function lavaCheckForUpdates(){
 lavaInfoDialog('Checking for Lava updates…','Contacting the configured release feed.','LAVA / UPDATES');
 try{const r=await lavaCall('check_updates');lavaEl('lava-info-text').textContent=r.message||r.error||'Unable to check updates.';if(r.update_available&&r.release_url){const btn=document.createElement('button');btn.className='lava-button';btn.textContent='OPEN RELEASE PAGE';lavaEl('lava-info-ok').before(btn);btn.onclick=async()=>{try{await lavaCall('open_release',r.release_url)}catch(e){lavaMessage(e.message,true)}}}}catch(e){lavaEl('lava-info-text').textContent=e.message;}
}
function lavaPlay(){lavaOpenLocalChoice()}
function lavaOpenLocalChoice(){lavaModalOpen('Play Minecraft','LAVA / PLAY',`<div class="lava-modal-body"><p class="lava-desc">Choose how you want to start Minecraft. Microsoft sign-in in Lava requires an approved application registration; your existing official Minecraft Launcher can use its own account session.</p><div class="lava-play-choices"><button class="lava-choice" id="lava-choice-ms"><b>Sign in to Lava</b><span>Microsoft authentication and Lava-managed installs</span></button><button class="lava-choice" id="lava-choice-local"><b>Use installed Minecraft</b><span>Open the official launcher and existing .minecraft files</span></button></div></div>`);lavaEl('lava-choice-ms').onclick=lavaOpenLogin;lavaEl('lava-choice-local').onclick=lavaOpenLocalMinecraft;}
function renderLavaFriends(){
 const signed=!!lavaState.account;const who=signed?lavaEscape(lavaState.account.name):'Minecraft player';
 main.innerHTML=`<div class="lava-friends-shell"><div class="eyebrow">LAVA SOCIAL</div><h1 class="lava-friends-title">FRIENDS</h1><div class="muted">A shared place to chat and play Minecraft with other Lava users.</div>
 <div class="lava-friends-head"><div><div class="eyebrow">${signed?'SIGNED IN':'ACCOUNT REQUIRED'}</div><h2 style="font-size:27px;margin:12px 0 6px">${signed?'Hello, '+who+'.':'Play together, all in Lava.'}</h2><p>${signed?'Your Microsoft account is connected. The Lava friends network is not online yet; friend requests and messages will become available when Lava has a secure hosted service.':'Sign in with Microsoft to connect your Java Edition identity. Friends and chat require a separate Lava service and will not be enabled until that service is ready.'}</p>${!signed?'<button class="lava-btn-soft" id="lava-friends-login">SIGN IN WITH MICROSOFT</button>':'<span class="lava-friends-pill">FRIENDS SERVICE NOT CONNECTED</span>'}</div><img class="lava-player-head" style="width:78px;height:78px" alt="Minecraft skin" src="${lavaPortrait()}"></div>
 <div class="lava-friends-tiles"><section class="lava-friends-tile"><h3>◉ Friends & requests</h3><p>Add and accept Lava user requests once the friends service is connected. Usernames alone are not proof of account ownership.</p><div class="lava-hint">No verified Lava contacts available yet.</div><button class="lava-btn-soft lava-disabled" disabled>ADD A FRIEND</button></section>
 <section class="lava-friends-tile"><h3>▣ Messages</h3><p>Private conversations between Lava users will require authenticated messaging, moderation/reporting controls, and a secure server.</p><div class="lava-hint">Messaging is currently unavailable.</div><button class="lava-btn-soft lava-disabled" disabled>NEW MESSAGE</button></section></div></div>`;
 const login=lavaEl('lava-friends-login');if(login)login.onclick=lavaOpenLogin;
}
function lavaMenuAccount(){lavaState.account?lavaOpenPlayer():lavaOpenLogin()}
async function lavaSignOutMenu(){if(!lavaState.account){lavaOpenLogin();return;}try{const r=await lavaCall('sign_out');if(!r.ok)throw Error(r.error);lavaState.account=null;lavaRefreshProfileButton();lavaMessage('Signed out.');}catch(e){lavaMessage(e.message,true)}}
async function lavaRestoreSession(){try{const r=await lavaCall('restore_login');if(r.ok){lavaState.account=r.account;lavaRefreshProfileButton();lavaMessage('Welcome back, '+r.account.name)}}catch(e){console.warn('Session restore failed:',e.message)}}
async function lavaInit(){
 try{const r=await lavaCall('info');lavaState={...lavaState,...r};lavaRefreshProfileButton();lavaApplyAppearance();if(r.oauth_available)lavaRestoreSession();else lavaMessage('Lava ready · Microsoft sign-in requires an approved app registration');}
 catch(e){lavaMessage('Native launcher error: '+e.message,true)}
}
window.lavaDesktopStatus=msg=>{lavaMessage(msg, String(msg).toLowerCase().includes('failed'));const el=lavaEl('lava-player-msg');if(el)el.textContent=msg};
window.addEventListener('pywebviewready',lavaInit);
document.addEventListener('DOMContentLoaded',()=>{
 lavaEl('lava-player-button')?.addEventListener('click',lavaMenuAccount);
 lavaEl('lava-play-button')?.addEventListener('click',lavaPlay);
 lavaEl('lava-layer')?.addEventListener('click',e=>{if(e.target===e.currentTarget)lavaCloseModal()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')lavaCloseModal()});
});


// Desktop backup: shareable settings and Library metadata; never account refresh tokens.
async function lavaSaveBackup(){
 try{
  const prefs={storeVersion,versionChannel,storeProvider,storeType,storeSort,storeEnvironment};
  const r=await lavaCall('save_lava_backup',db,prefs);
  if(r.cancelled)return;
  if(!r.ok)throw Error(r.error||'Could not save backup');
  lavaInfoDialog('Lava backup saved',`Saved ${r.entries} Library entries, banners, favorites, appearance colors, RAM settings and Store preferences to:\n${r.path}\n\nMinecraft worlds, mod files, Microsoft credentials and account tokens are not included.`,'LAVA / BACKUPS');
 }catch(e){lavaInfoDialog('Backup failed',e.message,'LAVA / BACKUPS')}
}
async function lavaRestoreBackup(){
 try{
  const r=await lavaCall('restore_lava_backup');
  if(r.cancelled)return;
  if(!r.ok)throw Error(r.error||'Could not read backup');
  lavaModalOpen('Restore Lava backup?','LAVA / BACKUPS',`<div class="lava-modal-body"><p class="lava-desc">Restore <b>${r.entries}</b> Library entries and your saved appearance, RAM settings, banners, and Store filters?</p><p class="lava-hint">This will <b>replace</b> your current Lava Library and settings. It won't change your Minecraft worlds, mod files, Microsoft account, or Minecraft login session.</p><div class="lava-actions"><button class="ghost" id="lava-restore-cancel">CANCEL</button><button class="green" id="lava-restore-apply">RESTORE BACKUP</button></div><p class="lava-alert-message" id="lava-restore-message"></p></div>`);
  lavaEl('lava-restore-cancel').onclick=lavaCloseModal;
  lavaEl('lava-restore-apply').onclick=async()=>{
   const message=lavaEl('lava-restore-message');
   const prior=JSON.parse(JSON.stringify(db));const oldSettings={...lavaState.settings};
   try{
    const result=await lavaCall('apply_backup_settings',r.launcher_settings);
    if(!result.ok)throw Error(result.error||'Failed to apply launcher settings');
    localStorage.setItem(KEY,JSON.stringify(r.library));
    db=r.library;lavaState.settings=result.settings;lavaApplyAppearance();
    const p=r.store_preferences||{};
    if(['release','snapshot'].includes(p.versionChannel))versionChannel=p.versionChannel;
    if(typeof p.storeVersion==='string'&&p.storeVersion.length<70)storeVersion=p.storeVersion;
    if(['modrinth','curseforge'].includes(p.storeProvider))storeProvider=p.storeProvider;
    if(['mod','modpack','shader','resourcepack'].includes(p.storeType))storeType=p.storeType;
    if(['downloads','relevance','updated','newest'].includes(p.storeSort))storeSort=p.storeSort;
    if(['all','client','server'].includes(p.storeEnvironment))storeEnvironment=p.storeEnvironment;
    selected=null;libCategory='all';libSearch='';lavaCloseModal();page='library';render();lavaMessage('Lava backup restored');
   }catch(e){
    try{localStorage.setItem(KEY,JSON.stringify(prior))}catch{}
    try{await lavaCall('apply_backup_settings',oldSettings)}catch{}
    message.textContent='Restore failed: '+e.message;message.classList.add('bad');
   }
  };
 }catch(e){lavaInfoDialog('Restore failed',e.message,'LAVA / BACKUPS')}
}
async function lavaExit(){try{await lavaCall("exit_app")}catch(e){lavaMessage(e.message,true)}}

