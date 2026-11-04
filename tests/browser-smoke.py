"""Offline UI smoke test with an in-browser Leaflet shim.
Run from a local HTTP server: python tests/browser-smoke.py.
The real Leaflet library and map tile delivery cannot be verified in this network-isolated test environment.
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
import os
import shutil
import json
import re

ROOT = Path(__file__).resolve().parents[1]

STUB = r'''
(() => {
  class Layer {
    constructor() { this.listeners = {}; }
    addTo(target) { if (target.addLayer) target.addLayer(this); return this; }
    on(event, fn) {this.listeners[event]=fn; return this;}
    bindTooltip(text) {this.tooltip=text;return this;}
    bindPopup(node) {this.popup=node;return this;}
    setStyle(o) {this.options={...(this.options||{}),...o};return this;}
    openPopup() {
      document.getElementById('fake-popup')?.remove();
      const el=document.createElement('div');el.id='fake-popup';el.style.display='none';
      el.append(this.popup);document.body.append(el);return this;
    }
    setLatLng(latlng) {this.latlng=latlng;return this;}
  }
  const L={};
  L.map = () => {
    const m={layers:[],events:{},setView(){return this},addLayer(l){this.layers.push(l);return this},removeLayer(l){this.layers=this.layers.filter(x=>x!==l);return this},on(event,cb){this.events[event]=cb;return this},fitBounds(){return this},invalidateSize(){return this},fireClick(lat,lng){this.events.click?.({latlng:{lat,lng}})}};
    window._testMap=m; return m;
  };
  L.control={zoom:()=>({addTo:()=>{}})};
  L.canvas=()=>({});
  L.layerGroup=(layers=[])=>{
    const l=new Layer();l.layers=[...layers];l.clearLayers=()=>{l.layers=[];};l.addLayer=x=>{l.layers.push(x);};l.getLayers=()=>l.layers;l.addTo=target=>{target.addLayer(l);return l;};return l;
  };
  L.tileLayer=(url,options)=>{const l=new Layer();l.url=url;l.options=options;return l;};
  L.polyline=(pts,options)=>{const l=new Layer();l.points=pts;l.options=options;return l;};
  L.circleMarker=(point,options)=>{const l=new Layer();l.latlng=point;l.options=options;return l;};
  L.latLngBounds=()=>({count:0,extend(){this.count++;return this},isValid(){return this.count>0}});
  window.L=L;
})();
'''

GPX = '''<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Route Atlas test" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>標高テスト経路</name><trkseg>
<trkpt lat="32.74000" lon="129.87000"><ele>3</ele><time>2026-10-01T10:00:00Z</time></trkpt>
<trkpt lat="32.74100" lon="129.87100"><ele>25</ele><time>2026-10-01T10:01:00Z</time></trkpt>
<trkpt lat="32.74200" lon="129.87200"><ele>80</ele><time>2026-10-01T10:02:00Z</time></trkpt>
<trkpt lat="32.74300" lon="129.87250"><ele>120</ele><time>2026-10-01T10:03:00Z</time></trkpt>
<trkpt lat="32.74400" lon="129.87300"><ele>160</ele><time>2026-10-01T10:04:00Z</time></trkpt>
<trkpt lat="32.74500" lon="129.87400"><ele>200</ele><time>2026-10-01T10:05:00Z</time></trkpt>
<trkpt lat="32.74600" lon="129.87500"><ele>220</ele><time>2026-10-01T10:06:00Z</time></trkpt>
<trkpt lat="32.74700" lon="129.87550"><ele>180</ele><time>2026-10-01T10:07:00Z</time></trkpt>
<trkpt lat="32.74800" lon="129.87600"><ele>100</ele><time>2026-10-01T10:08:00Z</time></trkpt>
<trkpt lat="32.74900" lon="129.87650"><ele>70</ele><time>2026-10-01T10:09:00Z</time></trkpt>
</trkseg></trk></gpx>'''
GPX2=GPX.replace('標高テスト経路','テスト経路2').replace('32.74000','32.84000').replace('32.74100','32.84100')

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium') or None,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1450,'height':900},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda err: errors.append(str(err)))
    html=(ROOT / 'local-preview.html').read_text()
    # The secure browser here disallows all navigation; insert HTML directly.
    html=re.sub(r'<script src="https://unpkg.com/leaflet@1\.9\.4/dist/leaflet\.js"[^>]*></script>', '',html)
    html=re.sub(r'<link rel="stylesheet" href="https://unpkg.com/leaflet@1\.9\.4/dist/leaflet\.css"[^>]*>', '',html)
    html=html.replace('</head>',f'<script>{STUB}</script></head>')
    page.set_content(html,wait_until='domcontentloaded',timeout=10000)
    page.wait_for_timeout(250)
    assert page.locator('#stat-total').inner_text()=='0', 'Expected no demo rides'
    assert page.locator('.ride').count()==0
    assert page.locator('#elevation-panel').is_hidden()
    assert page.locator('#route-width-value').inner_text()=='6.4px'
    page.locator('#map-style').select_option('gsi-relief')
    assert page.locator('#map-coverage').is_visible()
    page.locator('#route-precision').select_option('full')
    page.locator('#route-width').evaluate("e => { e.value='7'; e.dispatchEvent(new Event('input',{bubbles:true})); }")
    page.locator('#file-input').set_input_files({'name':'sample.gpx','mimeType':'application/gpx+xml','buffer':GPX.encode()})
    page.wait_for_function("document.querySelector('#stat-total').textContent === '1'",timeout=5000)
    assert page.locator('.ride').count()==1
    assert 'D+' in page.locator('.ride-metrics').inner_text()
    assert '(3-220) m' in page.locator('.ride-metrics').inner_text()
    assert page.locator('#elevation-panel').is_visible(), 'Single route profile should show'
    assert page.locator('#elevation-chart path').count()>0
    page.screenshot(path=str(ROOT / 'tests' / 'v03-ui.png'),full_page=True)
    page.locator('#file-input').set_input_files({'name':'sample2.gpx','mimeType':'application/gpx+xml','buffer':GPX2.encode()})
    page.wait_for_function("document.querySelector('#stat-total').textContent === '2'")
    assert page.locator('#elevation-panel').is_hidden(), 'Two selected routes should hide profile'
    page.locator('.ride-main').first.click()
    page.locator('.detail-isolate').click()
    assert page.locator('#elevation-panel').is_visible(), 'Isolate route shows profile'
    page.evaluate("window._testMap.fireClick(32.73,129.88)")
    assert 'map_action=pano' in page.locator('#fake-popup a').first.get_attribute('href')
    assert 'viewpoint=' in page.locator('#fake-popup a').first.get_attribute('href')
    assert not errors, errors
    page.on('dialog',lambda d:d.accept())
    page.locator('.ride-delete').first.click()
    page.wait_for_function("document.querySelector('#stat-total').textContent === '1'")
    assert page.locator('.ride').count()==1
    assert not errors, errors
    print(json.dumps({'browser':'Chromium Playwright + Leaflet shim + inline HTML',
                      'routes_after_import':2,'routes_after_delete':1,
                      'profile':'pass','map_style':'pass','streetview':'pass',
                      'page_errors':errors},ensure_ascii=False))
    browser.close()
