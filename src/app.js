import { parseGpx, parseFit, prepareRoute, upgradeRoute } from './parsers.js';
import { buildElevationProfile, formatDistanceElevation } from './elevation.js';
import { createMapStyle, MAP_STYLE_IDS } from './map-styles.js';
import { streetViewUrl, googleMapsPointUrl } from './streetview.js';

const $ = id => document.getElementById(id);
const refs = {
  list: $('ride-list'), search: $('search'), year: $('year-filter'), format: $('format-filter'),
  total: $('stat-total'), shown: $('stat-shown'), km: $('stat-km'), message: $('message'),
  progress: $('import-progress'), detail: $('detail'), file: $('file-input'), folder: $('folder-input'),
  intro: $('intro'), map: $('map'), showAll: $('show-all'), hideAll: $('hide-all'), export: $('export'),
};
const COLORS = ['#e86146', '#3d9e95', '#6379d1', '#af76b6', '#d19b3f', '#4691c8', '#7eaa67', '#bc6588'];
const SETTINGS_KEY = 'route-atlas-v0.3-settings';
function readSettings() {
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch { /* storage may be blocked */ }
  return {
    mapStyle: MAP_STYLE_IDS.includes(raw.mapStyle) ? raw.mapStyle : 'osm',
    precision: raw.precision === 'full' ? 'full' : 'standard',
    lineWidth: Number.isFinite(Number(raw.lineWidth)) ? Math.max(3,Math.min(10,Math.round(Number(raw.lineWidth)*5)/5)) : 6.4,
  };
}
const state = { routes: [], selected: new Set(), active: null, query: '', year: '', format: '', settings: readSettings() };
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY,JSON.stringify(state.settings)); }
  catch { /* localStorage may be disabled; in-memory settings still work */ }
}

let map;
let layerGroup;
let baseLayer = null;
let renderer;
let currentProfile = null;
let streetViewMarker = null;
let database = null;

function status(message, kind = '') {
  refs.message.textContent = message;
  refs.message.dataset.kind = kind;
}
function formatDate(date) {
  if (!date) return '日付不明';
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? '日付不明' : d.toLocaleDateString('ja-JP', {year:'numeric',month:'2-digit',day:'2-digit'});
}
function formatDuration(seconds) {
  if (!seconds) return '記録なし';
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
}
function colorFor(route) {
  const i = state.routes.findIndex(r => r.id === route.id);
  return COLORS[(i < 0 ? 0 : i) % COLORS.length];
}
function filteredRoutes() {
  return state.routes.filter(r => {
    if (state.query && !r.name.toLocaleLowerCase().includes(state.query)) return false;
    if (state.year && !(r.date && new Date(r.date).getFullYear().toString() === state.year)) return false;
    if (state.format && r.source !== state.format) return false;
    return true;
  });
}
function updateGsiCredit() {
  const credit=$('gsi-zoom-credit');
  if (!credit) return;
  const z=map && typeof map.getZoom==='function' ? map.getZoom() : null;
  credit.hidden=state.settings.mapStyle==='osm' || z==null || z<5 || z>8;
}
function switchBaseMap() {
  if (!map || window.location.protocol === 'file:') return;
  if (baseLayer) map.removeLayer(baseLayer);
  baseLayer = createMapStyle(L, state.settings.mapStyle);
  // Insert behind GPS polylines and the Street View marker.
  baseLayer.addTo(map);
  const warning = $('map-coverage');
  warning.hidden = state.settings.mapStyle === 'osm';
  updateGsiCredit();
}
function ensureMap() {
  if (!window.L) {
    refs.map.innerHTML = '<div class="map-failure">地図ライブラリを読み込めませんでした。ネットワーク接続を確認して再読込してください。</div>';
    status('Leafletを読み込めませんでした。ネット接続をご確認ください。', 'error');
    return false;
  }
  map = L.map('map', {preferCanvas:true, zoomControl:false}).setView([32.80,129.92],10);
  L.control.zoom({position:'topright'}).addTo(map);
  if (window.location.protocol === 'file:') {
    const warning = $('protocol-warning');
    if (warning) warning.hidden = false;
  } else switchBaseMap();
  renderer = L.canvas({padding:0.2});
  layerGroup = L.layerGroup().addTo(map);
  map.on('click', event => showStreetViewAt(event.latlng));
  map.on('zoomend',updateGsiCredit);
  return true;
}

/** Creates a local popup; the external URL is used only after the user clicks its link. */
function showStreetViewAt(latlng) {
  if (!map) return;
  const lat = latlng.lat;
  const lng = latlng.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const content = document.createElement('div');
  content.className = 'streetview-popup';
  const heading = document.createElement('strong');
  heading.className = 'streetview-popup-title';
  heading.textContent = 'この地点をストリートビューで確認';
  const coords = document.createElement('div');
  coords.className = 'streetview-popup-coords';
  coords.textContent = `緯度 ${lat.toFixed(6)} / 経度 ${lng.toFixed(6)}`;

  const sv = document.createElement('a');
  sv.className = 'streetview-popup-primary';
  sv.textContent = 'Googleストリートビューで開く ↗';
  sv.href = streetViewUrl(lat, lng);
  sv.target = '_blank';
  sv.rel = 'noopener noreferrer';

  const maps = document.createElement('a');
  maps.className = 'streetview-popup-secondary';
  maps.textContent = 'Googleマップで地点を見る ↗';
  maps.href = googleMapsPointUrl(lat, lng);
  maps.target = '_blank';
  maps.rel = 'noopener noreferrer';

  const note = document.createElement('div');
  note.className = 'streetview-popup-note';
  note.textContent = '撮影画像がない場所では開けない場合があります。Googleにはリンクを押したときだけ座標が送られます。';
  content.append(heading, coords, sv, maps, note);

  if (streetViewMarker) {
    streetViewMarker.setLatLng(latlng);
  } else {
    streetViewMarker = L.circleMarker(latlng, {
      radius: 8, color: '#ffffff', weight: 2.5, fillColor: '#e66a43', fillOpacity: 1,
      bubblingMouseEvents: false,
    }).addTo(map);
    streetViewMarker.on('click', () => streetViewMarker.openPopup());
  }
  streetViewMarker.bindPopup(content, { maxWidth: 295, closeButton: true }).openPopup();
  $('clear-streetview').hidden = false;
}

function clearStreetView() {
  if (streetViewMarker && map) map.removeLayer(streetViewMarker);
  streetViewMarker = null;
  $('clear-streetview').hidden = true;
}
function updateMap() {
  if (!map) return;
  layerGroup.clearLayers();
  const weight = state.settings.lineWidth;
  for (const route of state.routes) {
    if (!state.selected.has(route.id)) continue;
    const color = colorFor(route);
    const isActive = route.id === state.active;
    // The overview always retains 15m accuracy; full mode uses the GPS originals.
    const segments = state.settings.precision === 'full' || isActive ? route.segments : route.overview;
    for (const segment of segments) {
      if (segment.length < 2) continue;
      const line = L.polyline(segment.map(p => [p.lat,p.lon]), {
        renderer, color, weight: isActive ? weight * (10 / 6.4) : weight,
        opacity: isActive ? 0.97 : 0.79,
        lineCap:'round', lineJoin:'round',interactive:true,bubblingMouseEvents:false,
      }).addTo(layerGroup);
      line._routeAtlasActive=isActive;
      line.on('click', event => { focusRoute(route.id); showStreetViewAt(event.latlng); });
      line.bindTooltip(route.name,{sticky:true,direction:'top'});
    }
  }
}
function zoomTo(routes) {
  if (!map || !routes.length) return;
  const bounds = L.latLngBounds([]);
  for (const route of routes) for (const segment of route.overview) {
    for (const p of segment) bounds.extend([p.lat,p.lon]);
  }
  if (bounds.isValid()) map.fitBounds(bounds,{padding:[35,35],maxZoom:14});
}
function focusRoute(id) {
  const route = state.routes.find(r => r.id === id);
  if (!route) return;
  state.active = id;
  state.selected.add(id);
  render();
  zoomTo([route]);
}
function updateYearOptions() {
  const years = [...new Set(state.routes.filter(r=>r.date).map(r=>new Date(r.date).getFullYear()).filter(Number.isFinite))].sort((a,b)=>b-a);
  refs.year.replaceChildren();
  refs.year.add(new Option('すべての年', ''));
  for (const year of years) refs.year.add(new Option(String(year), String(year)));
  if (years.map(String).includes(state.year)) refs.year.value = state.year;
  else { state.year = ''; refs.year.value = ''; }
}
function renderList() {
  refs.list.replaceChildren();
  const routes = filteredRoutes();
  refs.intro.hidden = state.routes.length > 0;
  if (!routes.length && state.routes.length) {
    const none = document.createElement('div');
    none.className='no-results'; none.textContent='条件に合う経路がありません。';
    refs.list.append(none);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const route of routes) {
    const entry = document.createElement('div');
    entry.className = `ride ${route.id === state.active ? 'active' : ''}`;
    const box = document.createElement('input');
    box.type='checkbox'; box.className='ride-checkbox';
    box.checked=state.selected.has(route.id);
    box.setAttribute('aria-label',`${route.name} を表示`);
    box.addEventListener('change',()=>{
      if (box.checked) state.selected.add(route.id);
      else state.selected.delete(route.id);
      if (!box.checked && state.active === route.id) state.active=null;
      render();
    });
    const bar=document.createElement('span'); bar.className='ride-color';
    bar.style.backgroundColor=colorFor(route);
    const main=document.createElement('button'); main.type='button'; main.className='ride-main';
    main.title='地図上のこの経路に移動';
    const name=document.createElement('strong'); name.textContent=route.name;
    const date=document.createElement('small'); date.className='ride-date';
    date.textContent=`${formatDate(route.date)}  ·  ${route.source}`;
    const meta=document.createElement('small'); meta.className='ride-metrics';
    meta.textContent=formatDistanceElevation(route);
    main.append(name,date,meta);
    main.addEventListener('click',()=>focusRoute(route.id));
    const del=document.createElement('button');del.type='button';del.className='ride-delete';
    del.title=`${route.name} を削除`;del.setAttribute('aria-label',`${route.name} を削除`);
    del.textContent='×';
    del.addEventListener('click',()=>deleteRoute(route));
    entry.append(box,bar,main,del);
    fragment.append(entry);
  }
  refs.list.append(fragment);
}
function renderDetail() {
  const route = state.routes.find(r=>r.id === state.active) ||
    (state.selected.size===1 ? state.routes.find(r=>state.selected.has(r.id)) : null);
  if (!route) {
    refs.detail.innerHTML='<span class="detail-empty">一覧の経路名をクリックすると詳細を表示できます。標高プロファイルは1経路だけを表示すると現れます。</span>';
    return;
  }
  refs.detail.replaceChildren();
  const heading=document.createElement('div');heading.className='detail-heading';
  const title=document.createElement('strong');title.textContent=route.name;
  const isolate=document.createElement('button');isolate.type='button';isolate.className='detail-isolate';
  isolate.textContent='この経路のみ';isolate.title='この経路だけを表示して標高プロファイルを確認';
  isolate.addEventListener('click',()=>{
    state.selected=new Set([route.id]);state.active=route.id;
    render();zoomTo([route]);
  });
  heading.append(title,isolate);
  const summary=document.createElement('p');summary.className='detail-summary';
  summary.textContent=formatDistanceElevation(route);
  const specs=document.createElement('div');specs.className='detail-grid';
  const cells=[
    ['走行日',formatDate(route.date)],
    ['経過時間',formatDuration(route.elapsedSeconds)],
    ['GPS点数',route.pointCount.toLocaleString('ja-JP')],
  ];
  if (Number.isFinite(route.minElevation) && Number.isFinite(route.maxElevation)) {
    cells.push(['最低標高',`${route.minElevation} m`],['最高標高',`${route.maxElevation} m`],
      ['累積上昇',Number.isFinite(route.ascentMeters) ? `${route.ascentMeters.toLocaleString('ja-JP')} m` : '算出不可']);
  }
  for (const [label,value] of cells) {
    const cell=document.createElement('div');
    const k=document.createElement('span');k.textContent=label;
    const v=document.createElement('b');v.textContent=value;
    cell.append(k,v);specs.append(cell);
  }
  refs.detail.append(heading,summary,specs);
  if (route.elevationPointCount && route.elevationPointCount < route.pointCount) {
    const note=document.createElement('small'); note.className='detail-caution';
    note.textContent='一部のGPS点で標高が欠損しています。D+は標高のある連続区間のみから算出。';
    refs.detail.append(note);
  }
}
function renderElevation() {
  const panel=$('elevation-panel'),svg=$('elevation-chart');
  if (state.selected.size !== 1) {panel.hidden=true;return;}
  const route=state.routes.find(r=>state.selected.has(r.id));
  if (!route || !route.elevationPointCount || !Number.isFinite(route.minElevation)) {
    panel.hidden=true;return;
  }
  if (!currentProfile || currentProfile.id !== route.id) {
    currentProfile={id:route.id,profile:buildElevationProfile(route.segments)};
  }
  const data=currentProfile.profile;
  if (data.sampleCount < 2) {panel.hidden=true;return;}
  panel.hidden=false;
  $('elevation-route-name').textContent=route.name;
  const W=680,H=175,margin={left:52,right:16,top:15,bottom:29};
  const w=W-margin.left-margin.right,h=H-margin.top-margin.bottom;
  const maxDistance=Math.max(0.01,data.distanceKm);
  const low=data.minElevation,high=data.maxElevation;
  const pad=Math.max(4,(high-low)*0.08);
  const lo=low-pad,hi=high+pad;
  const fx=x=>margin.left+(x/maxDistance)*w;
  const fy=y=>margin.top+(hi-y)/(hi-lo)*h;
  const color=colorFor(route);
  const ticks=[];
  for (let i=0;i<=4;i++) {
    const y=margin.top+i*h/4;
    const value=hi-i*(hi-lo)/4;
    ticks.push(`<line x1="${margin.left}" y1="${y.toFixed(2)}" x2="${W-margin.right}" y2="${y.toFixed(2)}" stroke="#e0eae5" stroke-width="1"/>`);
    ticks.push(`<text x="${margin.left-8}" y="${(y+4).toFixed(2)}" text-anchor="end" fill="#6d847a" font-size="11">${Math.round(value)}</text>`);
  }
  for (let i=0;i<=4;i++) {
    const x=margin.left+i*w/4;
    ticks.push(`<text x="${x.toFixed(2)}" y="${H-7}" text-anchor="middle" fill="#6d847a" font-size="11">${(maxDistance*i/4).toFixed(1)}</text>`);
  }
  const paths=data.paths.filter(path=>path.length>=2).map(path=>{
    const d=path.map((p,i)=>`${i?'L':'M'}${fx(p.km).toFixed(2)},${fy(p.ele).toFixed(2)}`).join(' ');
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round"/>`;
  });
  svg.innerHTML=`<rect x="${margin.left}" y="${margin.top}" width="${w}" height="${h}" fill="#f8fbf9"/>${ticks.join('')}<text x="12" y="12" fill="#54786a" font-size="11">標高 m</text>${paths.join('')}<line id="profile-crosshair" x1="0" y1="${margin.top}" x2="0" y2="${H-margin.bottom}" stroke="#304b43" stroke-width="1" stroke-dasharray="3 3" visibility="hidden"/><circle id="profile-marker" cx="0" cy="0" r="4" fill="${color}" stroke="#ffffff" stroke-width="2" visibility="hidden"/>`;
  $('elevation-hover').textContent='GPSログの標高値から作成（カーソルで詳細）';
  svg._profileData={data,fx,fy,margin,w,h};
}
function handleElevationHover(event) {
  const svg=$('elevation-chart'), meta=svg._profileData;
  if (!meta) return;
  const rect=svg.getBoundingClientRect();
  const localX=(event.clientX-rect.left)/rect.width*680;
  const wantedKm=(Math.min(meta.margin.left+meta.w,Math.max(meta.margin.left,localX))-meta.margin.left)/meta.w*meta.data.distanceKm;
  let closest=null,dist=Infinity;
  for (const path of meta.data.paths) for (const p of path) {
    const d=Math.abs(p.km-wantedKm);
    if (d<dist) {dist=d;closest=p;}
  }
  if (!closest) return;
  const x=meta.fx(closest.km),y=meta.fy(closest.ele);
  const cross=$('profile-crosshair'),marker=$('profile-marker');
  cross.setAttribute('x1',x);cross.setAttribute('x2',x);cross.setAttribute('visibility','visible');
  marker.setAttribute('cx',x);marker.setAttribute('cy',y);marker.setAttribute('visibility','visible');
  $('elevation-hover').textContent=`${closest.km.toFixed(2)} km / 標高 ${Math.round(closest.ele)} m`;
}
function renderStats() {
  refs.total.textContent = state.routes.length.toLocaleString('ja-JP');
  refs.shown.textContent = state.selected.size.toLocaleString('ja-JP');
  const km = state.routes.filter(r => state.selected.has(r.id)).reduce((sum,r)=>sum+r.distanceKm,0);
  refs.km.textContent = km.toLocaleString('ja-JP',{maximumFractionDigits:1});
}
function render() {
  renderStats(); renderList(); renderDetail(); renderElevation(); updateMap();
}

function setupListeners() {
  $('upload-button').addEventListener('click', () => refs.file.click());
  $('folder-button').addEventListener('click', () => refs.folder.click());
  refs.file.addEventListener('change', async () => { await importFiles(refs.file.files); refs.file.value = ''; });
  refs.folder.addEventListener('change', async () => { await importFiles(refs.folder.files); refs.folder.value = ''; });
  refs.search.addEventListener('input', e => { state.query = e.target.value.trim().toLocaleLowerCase(); renderList(); });
  refs.year.addEventListener('change', e => { state.year = e.target.value; renderList(); });
  refs.format.addEventListener('change', e => { state.format = e.target.value; renderList(); });
  refs.showAll.addEventListener('click', () => {
    for (const r of filteredRoutes()) state.selected.add(r.id);
    render(); zoomTo(state.routes.filter(r => state.selected.has(r.id)));
  });
  refs.hideAll.addEventListener('click', () => { for (const r of filteredRoutes()) state.selected.delete(r.id); state.active = null; render(); });
  $('zoom-all').addEventListener('click', () => zoomTo(state.routes.filter(r => state.selected.has(r.id))));
  $('clear-streetview').addEventListener('click', clearStreetView);
  $('clear-button').addEventListener('click', clearRoutes);
  $('map-style').value=state.settings.mapStyle;
  $('route-precision').value=state.settings.precision;
  $('route-width').value=String(state.settings.lineWidth);
  $('route-width-value').textContent=`${state.settings.lineWidth.toFixed(1)}px`;
  $('map-style').addEventListener('change',e=>{
    state.settings.mapStyle=e.target.value;
    saveSettings();switchBaseMap();
  });
  $('route-precision').addEventListener('change',e=>{
    state.settings.precision=e.target.value;saveSettings();updateMap();
  });
  $('route-width').addEventListener('input',e=>{
    state.settings.lineWidth=Number(e.target.value);
    $('route-width-value').textContent=`${state.settings.lineWidth.toFixed(1)}px`;
    saveSettings();
    if (layerGroup) for (const line of layerGroup.getLayers()) {
      line.setStyle({weight:line._routeAtlasActive ? state.settings.lineWidth*(10/6.4) : state.settings.lineWidth});
    }
  });
  $('elevation-chart').addEventListener('mousemove',handleElevationHover);
  $('elevation-chart').addEventListener('mouseleave',()=>{
    $('profile-crosshair')?.setAttribute('visibility','hidden');
    $('profile-marker')?.setAttribute('visibility','hidden');
    $('elevation-hover').textContent='GPSログの標高値から作成（カーソルで詳細）';
  });
  refs.export.addEventListener('click', exportSelected);
  $('help-button').addEventListener('click', () => $('help-dialog').showModal());
  $('close-help').addEventListener('click', () => $('help-dialog').close());
  const drop = $('dropzone');
  for (const evt of ['dragenter','dragover']) drop.addEventListener(evt, e=>{ e.preventDefault(); drop.classList.add('dragging'); });
  for (const evt of ['dragleave','drop']) drop.addEventListener(evt, e=>{ e.preventDefault(); drop.classList.remove('dragging'); });
  drop.addEventListener('drop', e => importFiles(e.dataTransfer.files));
  window.addEventListener('resize', () => map?.invalidateSize());
}

async function openDatabase() {
  if (!('indexedDB' in window)) throw new Error('IndexedDBを利用できません');
  return await new Promise((resolve,reject)=>{
    const req = indexedDB.open('cycling-route-viewer', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('routes', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function transactionPromise(tx) {
  return new Promise((resolve,reject)=>{ tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error); });
}
async function loadSavedRoutes() {
  if (!database) return [];
  const tx = database.transaction('routes', 'readonly');
  const req = tx.objectStore('routes').getAll();
  const results = await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  return results;
}
async function saveRoutes(routes) {
  if (!database || !routes.length) return;
  const tx = database.transaction('routes', 'readwrite');
  for (const r of routes) tx.objectStore('routes').put(r);
  await transactionPromise(tx);
}

async function importFiles(fileList) {
  const files = Array.from(fileList || []).filter(f=>/\.(gpx|fit)$/i.test(f.name));
  if (!files.length) { status('FIT / GPXファイルが選択されていません。', 'error'); return; }
  refs.progress.hidden = false;
  const existing = new Set(state.routes.map(r=>r.id));
  const pending = [];
  const errors = [];
  for (let i=0; i<files.length; i++) {
    const file = files[i];
    refs.progress.value = (i+1)/files.length*100;
    status(`ファイルを解析しています… ${i+1} / ${files.length}`);
    // Give the browser opportunities to repaint for large batches.
    if (i % 8 === 0) await new Promise(resolve=>setTimeout(resolve,0));
    const id = `file:${file.webkitRelativePath || file.name}:${file.size}:${file.lastModified}`;
    if (existing.has(id)) continue;
    try {
      const payload = /\.gpx$/i.test(file.name) ? parseGpx(await file.text(), file.name) : parseFit(await file.arrayBuffer(), file.name);
      const route = prepareRoute({id,...payload});
      pending.push(route);
      existing.add(id);
    } catch (e) { errors.push(`${file.name}: ${e.message || String(e)}`); }
  }
  let saveError = null;
  if (pending.length) {
    state.routes.push(...pending);
    state.routes.sort((a,b)=>new Date(b.date || 0)-new Date(a.date || 0));
    for (const r of pending) state.selected.add(r.id);
    state.active = pending[0].id;
    try { await saveRoutes(pending); }
    catch (e) { saveError = e.message || String(e); }
  }
  refs.progress.hidden = true;
  updateYearOptions(); render();
  if (pending.length) zoomTo(pending.length < 10 ? pending : state.routes.filter(r => state.selected.has(r.id)));
  const message = `${pending.length}件を追加。${files.length - pending.length - errors.length}件を重複として省略。${errors.length}件は読込失敗。`;
  status(`${message}${saveError ? ' 保存失敗: ' + saveError : ''}${errors.length ? ' 例: ' + errors.slice(0,2).join(' / ') : ''}`, (errors.length || saveError) ? 'warning' : 'success');
}

async function deleteRoute(route) {
  if (!window.confirm(`「${route.name}」を削除しますか？\nこのブラウザ内の保存記録も削除します。元のFIT/GPXファイルは変更しません。`)) return;
  if (database) {
    try {
      const tx=database.transaction('routes','readwrite');
      tx.objectStore('routes').delete(route.id);
      await transactionPromise(tx);
    } catch(e) {status(`経路を削除できませんでした: ${e.message}`,'error');return;}
  }
  state.routes=state.routes.filter(r=>r.id!==route.id);
  state.selected.delete(route.id);
  if (state.active===route.id) state.active=null;
  if (currentProfile?.id===route.id) currentProfile=null;
  updateYearOptions();render();
  status(`「${route.name}」を削除しました。元のFIT/GPXファイルは残っています。`,'success');
}

async function clearRoutes() {
  if (!window.confirm('このブラウザに保存したGPSログと現在の一覧を全て削除しますか？\n元のFIT/GPXファイルは削除されません。')) return;
  if (database) {
    try { const tx=database.transaction('routes','readwrite'); tx.objectStore('routes').clear(); await transactionPromise(tx); }
    catch(e) { status(`保存データを削除できませんでした: ${e.message}`,'error'); return; }
  }
  state.routes=[]; state.selected.clear(); state.active=null; currentProfile=null;
  updateYearOptions(); render();
  status('保存された経路を削除しました。元のファイルは変更していません。');
}

function exportSelected() {
  const selected = state.routes.filter(r=>state.selected.has(r.id));
  if (!selected.length) { status('エクスポートする経路を選択してください。','warning'); return; }
  const geojson = {
    type:'FeatureCollection',
    features:selected.map(r=>({type:'Feature', properties:{name:r.name,date:r.date,format:r.source,distance_km:r.distanceKm,ascent_m:r.ascentMeters,min_elevation_m:r.minElevation,max_elevation_m:r.maxElevation},
      geometry:{type:'MultiLineString',coordinates:r.segments.map(seg=>seg.map(p=>[p.lon,p.lat,...(Number.isFinite(p.ele)?[p.ele]:[])]))}})),
  };
  const url=URL.createObjectURL(new Blob([JSON.stringify(geojson)],{type:'application/geo+json'}));
  const a=document.createElement('a'); a.href=url; a.download='cycling-routes.geojson';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  status(`${selected.length}経路をGeoJSONとして出力しました。`,'success');
}

async function init() {
  ensureMap();setupListeners();
  try {
    database=await openDatabase();
    const saved=await loadSavedRoutes();
    const migrated=[];
    for (let i=0;i<saved.length;i++) {
      // Older installations could contain synthetic demo entries: do not load them.
      if (saved[i].isDemo || String(saved[i].id).startsWith('demo-')) continue;
      try {
        const updated=upgradeRoute(saved[i]);
        state.routes.push(updated);
        if (updated!==saved[i]) migrated.push(updated);
      } catch(e) {console.warn('Skipping unreadable saved route:',e);}
      // Avoid freezing the map while migrating hundreds of old tracks.
      if (i%10===0) await new Promise(resolve=>setTimeout(resolve,0));
    }
    if (migrated.length) {
      try {
        for (let i=0;i<migrated.length;i+=15) {
          await saveRoutes(migrated.slice(i,i+15));
          await new Promise(resolve=>setTimeout(resolve,0));
        }
      } catch(e) {
        status(`旧記録の表示用データを再計算しましたが、保存に失敗しました: ${e.message}`,'warning');
      }
    }
  } catch(e) {
    status('ブラウザ保存を利用できません。経路はこのページを閉じると消える場合があります。','warning');
  }
  if (state.routes.length) {
    state.routes.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
    state.selected=new Set(state.routes.map(r=>r.id));
    updateYearOptions();render();zoomTo(state.routes);
    status(`${state.routes.length}件の保存済みログを読み込みました。`,'success');
  } else {
    updateYearOptions();render();
    if (!['warning','error'].includes(refs.message.dataset.kind)) status('経路はまだ登録されていません。FIT / GPXを追加してください。');
  }
}
init();
