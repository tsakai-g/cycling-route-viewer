import { parseGpx, parseFit, prepareRoute } from './parsers.js';
import { streetViewUrl, googleMapsPointUrl } from './streetview.js';

const $ = id => document.getElementById(id);
const refs = {
  list: $('ride-list'), search: $('search'), year: $('year-filter'), format: $('format-filter'),
  total: $('stat-total'), shown: $('stat-shown'), km: $('stat-km'), message: $('message'),
  progress: $('import-progress'), detail: $('detail'), file: $('file-input'), folder: $('folder-input'),
  intro: $('intro'), map: $('map'), showAll: $('show-all'), hideAll: $('hide-all'), export: $('export'),
};
const COLORS = ['#e86146', '#3d9e95', '#6379d1', '#af76b6', '#d19b3f', '#4691c8', '#7eaa67', '#bc6588'];
const state = { routes: [], selected: new Set(), active: null, query: '', year: '', format: '' };
let map;
let layerGroup;
let renderer;
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
function ensureMap() {
  if (!window.L) {
    refs.map.innerHTML = '<div class="map-failure">地図ライブラリを読み込めませんでした。ネットワーク接続を確認して再読込してください。</div>';
    status('Leafletを読み込めませんでした。ネット接続をご確認ください。', 'error');
    return false;
  }
  map = L.map('map', { preferCanvas: true, zoomControl: false }).setView([32.80, 129.92], 10);
  L.control.zoom({ position: 'topright' }).addTo(map);
  // The OSMF tile policy requires an HTTP Referer for web pages. Browsers do not
  // send one from file://, so do not make non-compliant requests from local HTML.
  if (window.location.protocol === 'file:') {
    const warning = $('protocol-warning');
    if (warning) warning.hidden = false;
  } else {
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      referrerPolicy: 'strict-origin-when-cross-origin',
      maxZoom: 19,
    }).addTo(map);
  }
  renderer = L.canvas({ padding: 0.2 });
  layerGroup = L.layerGroup().addTo(map);
  map.on('click', event => showStreetViewAt(event.latlng));
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
  for (const route of state.routes) {
    if (!state.selected.has(route.id)) continue;
    const color = colorFor(route);
    for (const segment of (route.id === state.active ? route.segments : route.overview)) {
      if (segment.length < 2) continue;
      const line = L.polyline(segment.map(p => [p.lat, p.lon]), {
        renderer, color, weight: route.id === state.active ? 5 : 3.2,
        opacity: route.id === state.active ? 0.96 : 0.75,
        lineCap:'round', lineJoin:'round', interactive:true, bubblingMouseEvents:false,
      }).addTo(layerGroup);
      line.on('click', event => { focusRoute(route.id); showStreetViewAt(event.latlng); });
      line.bindTooltip(route.name, { sticky: true, direction: 'top' });
    }
  }
}
function zoomTo(routes) {
  if (!map || !routes.length) return;
  const coords = [];
  for (const route of routes) for (const segment of route.overview) {
    for (const p of segment) coords.push([p.lat, p.lon]);
  }
  if (coords.length > 1) map.fitBounds(L.latLngBounds(coords), { padding: [35, 35], maxZoom: 14 });
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
    none.className = 'no-results'; none.textContent = '条件に合う経路がありません。';
    refs.list.appendChild(none);
    return;
  }
  const fragment = document.createDocumentFragment();
  routes.forEach(route => {
    const entry = document.createElement('div');
    entry.className = `ride ${route.id === state.active ? 'active' : ''}`;
    const box = document.createElement('input');
    box.type = 'checkbox'; box.className = 'ride-checkbox';
    box.checked = state.selected.has(route.id);
    box.setAttribute('aria-label', `${route.name} を表示`);
    box.addEventListener('change', () => {
      if (box.checked) state.selected.add(route.id);
      else state.selected.delete(route.id);
      if (!box.checked && state.active === route.id) state.active = null;
      render();
    });
    const bar = document.createElement('span'); bar.className = 'ride-color';
    bar.style.backgroundColor = colorFor(route);
    const main = document.createElement('button');
    main.type = 'button'; main.className = 'ride-main';
    main.title = '地図上のこの経路に移動';
    const name = document.createElement('strong'); name.textContent = route.name;
    const meta = document.createElement('small');
    meta.textContent = `${formatDate(route.date)}   ·   ${route.distanceKm.toFixed(1)} km   ·   ${route.source}`;
    main.append(name, meta);
    main.addEventListener('click', () => focusRoute(route.id));
    entry.append(box, bar, main);
    fragment.append(entry);
  });
  refs.list.appendChild(fragment);
}
function renderDetail() {
  const route = state.routes.find(r => r.id === state.active);
  if (!route) {
    refs.detail.innerHTML = '<span class="detail-empty">一覧の経路名をクリックすると詳細を表示できます。</span>';
    return;
  }
  refs.detail.replaceChildren();
  const title = document.createElement('strong'); title.textContent = route.name;
  const specs = document.createElement('div'); specs.className = 'detail-grid';
  for (const [label, value] of [
    ['走行日', formatDate(route.date)], ['距離', `${route.distanceKm.toFixed(1)} km`],
    ['経過時間', formatDuration(route.elapsedSeconds)], ['GPS点数', route.pointCount.toLocaleString('ja-JP')],
    ['形式', route.source], ['種類', route.isDemo ? '架空のサンプル' : 'ローカルファイル'],
  ]) {
    const cell = document.createElement('div');
    const k = document.createElement('span'); k.textContent = label;
    const v = document.createElement('b'); v.textContent = value;
    cell.append(k,v); specs.append(cell);
  }
  refs.detail.append(title, specs);
}
function renderStats() {
  refs.total.textContent = state.routes.length.toLocaleString('ja-JP');
  refs.shown.textContent = state.selected.size.toLocaleString('ja-JP');
  const km = state.routes.filter(r => state.selected.has(r.id)).reduce((sum,r)=>sum+r.distanceKm,0);
  refs.km.textContent = km.toLocaleString('ja-JP',{maximumFractionDigits:1});
}
function render() {
  renderStats(); renderList(); renderDetail(); updateMap();
  const mark = document.querySelector('.demo-watermark');
  if (mark) mark.hidden = !state.routes.some(r => r.isDemo && state.selected.has(r.id));
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
  $('demo-button').addEventListener('click', loadDemo);
  $('clear-button').addEventListener('click', clearRoutes);
  refs.export.addEventListener('click', exportSelected);
  $('help-button').addEventListener('click', () => $('help-dialog').showModal());
  $('close-help').addEventListener('click', () => $('help-dialog').close());
  const drop = $('dropzone');
  for (const evt of ['dragenter','dragover']) drop.addEventListener(evt, e=>{ e.preventDefault(); drop.classList.add('dragging'); });
  for (const evt of ['dragleave','drop']) drop.addEventListener(evt, e=>{ e.preventDefault(); drop.classList.remove('dragging'); });
  drop.addEventListener('drop', e => importFiles(e.dataTransfer.files));
  window.addEventListener('resize', () => map?.invalidateSize());
}

function sampleSegment(waypoints, index) {
  const points = [];
  for (let leg = 0; leg < waypoints.length - 1; leg++) {
    const [lat1, lon1] = waypoints[leg], [lat2, lon2] = waypoints[leg + 1];
    const steps = 21;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const wiggle = Math.sin(t * Math.PI) * Math.sin(t * 3 * Math.PI + index * 1.9) * 0.0013;
      const date = new Date(Date.UTC(2026, 8, 5 + index, 0, 0, 0) + (leg * steps + i) * 60000);
      points.push({lat:lat1+(lat2-lat1)*t+wiggle,lon:lon1+(lon2-lon1)*t+wiggle,time:date.toISOString()});
    }
  }
  const [lastLat, lastLon] = waypoints[waypoints.length - 1];
  points.push({lat:lastLat,lon:lastLon});
  return points;
}
function demoRoutes() {
  // Synthetic routes for UI demonstration only, not real road data.
  const examples = [
    ['デモ：長崎市内ループ',[[32.744,129.874],[32.765,129.894],[32.790,129.871],[32.777,129.839],[32.749,129.849],[32.744,129.874]]],
    ['デモ：大村湾方面',[[32.744,129.874],[32.833,129.912],[32.911,129.952],[32.941,129.952],[32.911,129.952],[32.833,129.912],[32.744,129.874]]],
    ['デモ：諫早方面',[[32.756,129.878],[32.790,129.959],[32.840,130.014],[32.844,130.054],[32.810,130.005],[32.756,129.878]]],
    ['デモ：西彼杵半島',[[32.753,129.851],[32.793,129.797],[32.858,129.747],[32.925,129.723],[32.889,129.749],[32.813,129.802],[32.753,129.851]]],
    ['デモ：野母崎方面',[[32.744,129.874],[32.697,129.864],[32.641,129.829],[32.591,129.795],[32.622,129.805],[32.697,129.864],[32.744,129.874]]],
    ['デモ：島原半島',[[32.843,130.048],[32.771,130.119],[32.743,130.216],[32.785,130.333],[32.870,130.311],[32.887,130.185],[32.843,130.048]]],
    ['デモ：佐世保方面',[[32.912,129.963],[33.005,129.924],[33.105,129.797],[33.159,129.721],[33.125,129.774],[33.005,129.924],[32.912,129.963]]],
  ];
  return examples.map(([name, points], index) => prepareRoute({
    id:`demo-${index}`, name, source:'DEMO', segments:[sampleSegment(points,index)], isDemo:true,
    date:new Date(Date.UTC(2026,8,5+index)).toISOString(),
  }));
}
function loadDemo() {
  const exists = new Set(state.routes.map(r => r.id));
  const examples = demoRoutes().filter(r=>!exists.has(r.id));
  state.routes.push(...examples);
  for (const r of examples) state.selected.add(r.id);
  if (examples.length) state.active = examples[0].id;
  updateYearOptions(); render();
  zoomTo(state.routes.filter(r => state.selected.has(r.id)));
  status(examples.length ? `${examples.length}件の架空デモ経路を追加しました（保存しません）。` : 'デモ経路は追加済みです。');
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
    // Remove synthetic routes on first real import, avoiding accidental demo mixing.
    const old = state.routes.filter(r=>r.isDemo);
    for (const r of old) state.selected.delete(r.id);
    state.routes = state.routes.filter(r=>!r.isDemo);
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

async function clearRoutes() {
  if (!window.confirm('このブラウザに保存したGPSログと現在の一覧を全て削除しますか？\n元のFIT/GPXファイルは削除されません。')) return;
  if (database) {
    try { const tx=database.transaction('routes','readwrite'); tx.objectStore('routes').clear(); await transactionPromise(tx); }
    catch(e) { status(`保存データを削除できませんでした: ${e.message}`,'error'); return; }
  }
  state.routes=[]; state.selected.clear(); state.active=null;
  updateYearOptions(); render();
  status('保存された経路を削除しました。元のファイルは変更していません。');
}

function exportSelected() {
  const selected = state.routes.filter(r=>state.selected.has(r.id));
  if (!selected.length) { status('エクスポートする経路を選択してください。','warning'); return; }
  const geojson = {
    type:'FeatureCollection',
    features:selected.map(r=>({type:'Feature', properties:{name:r.name,date:r.date,format:r.source,distance_km:r.distanceKm},
      geometry:{type:'MultiLineString',coordinates:r.segments.map(seg=>seg.map(p=>[p.lon,p.lat,...(Number.isFinite(p.ele)?[p.ele]:[])]))}})),
  };
  const url=URL.createObjectURL(new Blob([JSON.stringify(geojson)],{type:'application/geo+json'}));
  const a=document.createElement('a'); a.href=url; a.download='cycling-routes.geojson';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  status(`${selected.length}経路をGeoJSONとして出力しました。`,'success');
}

async function init() {
  ensureMap(); setupListeners();
  try { database = await openDatabase(); state.routes = await loadSavedRoutes(); }
  catch(e) { status('ブラウザ保存を利用できません。経路はこのページを閉じると消える場合があります。','warning'); }
  if (state.routes.length) {
    state.routes.sort((a,b)=>new Date(b.date || 0)-new Date(a.date || 0));
    state.selected = new Set(state.routes.map(r=>r.id));
    updateYearOptions(); render(); zoomTo(state.routes);
    status(`${state.routes.length}件の保存済みログを読み込みました。`,'success');
  } else { loadDemo(); }
}
init();
