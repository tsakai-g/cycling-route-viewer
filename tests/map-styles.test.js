import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapStyle, MAP_STYLE_IDS } from '../src/map-styles.js';

const mock = {
 tileLayer: (url, options)=>({url, options}),
 layerGroup: layers=>({layers}),
};

test('4 backgrounds and proper tile URLs and attributions',()=>{
 assert.deepEqual(MAP_STYLE_IDS,['osm','gsi-topo','gsi-relief','gsi-shade']);
 const osm=createMapStyle(mock,'osm');
 assert.match(osm.url,/tile.openstreetmap.org/);
 const topo=createMapStyle(mock,'gsi-topo');
 assert.match(topo.url,/gsi.go.jp\/xyz\/std/);
 assert.match(topo.options.attribution,/国土地理院/);
 const relief=createMapStyle(mock,'gsi-relief');
 assert.equal(relief.layers.length,2);
 assert.match(relief.layers[0].url,/\/relief\//);
 assert.match(relief.layers[0].options.attribution,/海上保安庁海洋情報部/);
 const shade=createMapStyle(mock,'gsi-shade');
 assert.match(shade.layers[0].url,/\/hillshademap\//);
});
