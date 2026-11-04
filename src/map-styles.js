/** Official GSI tiled maps; no proxy, no tile prefetching. */
const GSI = 'https://cyberjapandata.gsi.go.jp/xyz/';
const GSI_ATTR = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">国土地理院</a>';
const SEA_ATTR = '海域部は海上保安庁海洋情報部の資料を使用して作成';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';

export const MAP_STYLE_IDS = ['osm','gsi-topo','gsi-relief','gsi-shade'];

export function createMapStyle(leaflet, id) {
  const options = { maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin' };
  const tile = (name, maxNativeZoom, extra = {}) => leaflet.tileLayer(`${GSI}${name}/{z}/{x}/{y}.png`, {
    ...options, maxNativeZoom, attribution: GSI_ATTR, ...extra,
  });
  switch(id) {
    case 'gsi-topo':
      return tile('std',18);
    case 'gsi-relief':
      return leaflet.layerGroup([
        tile('relief',15,{minNativeZoom:5,attribution: `${GSI_ATTR} / ${SEA_ATTR}`}),
        tile('pale',18,{opacity:0.30}),
      ]);
    case 'gsi-shade':
      return leaflet.layerGroup([
        tile('hillshademap',16,{minNativeZoom:2}),
        tile('pale',18,{opacity:0.35}),
      ]);
    case 'osm':
    default:
      return leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        ...options, attribution: OSM_ATTR,
      });
  }
}
