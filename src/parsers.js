/**
 * Cycling Route Viewer - parsers and geometry utilities.
 * GPX parsing uses the browser's DOMParser. FIT decoding supports standard
 * FIT record messages (global message 20) containing position_lat/long.
 * This intentionally does not implement the entire Garmin FIT profile.
 */

export const METERS_PER_DEGREE = 111320;
const FIT_EPOCH_MS = 631065600000;
const RAD = Math.PI / 180;

export function haversineMeters(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function lengthKm(segments) {
  let meters = 0;
  for (const seg of segments) {
    for (let i = 1; i < seg.length; i++) {
      const step = haversineMeters(seg[i - 1], seg[i]);
      // Exclude implausible GPS jumps caused by reception loss.
      if (step < 25000) meters += step;
    }
  }
  return meters / 1000;
}

export function simplify(segment, toleranceMeters = 40) {
  if (segment.length <= 2) return segment;
  const meanLat = segment.reduce((acc, p) => acc + p.lat, 0) / segment.length;
  const cosine = Math.cos(meanLat * RAD);
  const sqTol = toleranceMeters ** 2;
  const keep = new Uint8Array(segment.length);
  keep[0] = 1;
  keep[segment.length - 1] = 1;
  const stack = [[0, segment.length - 1]];
  const xy = p => [p.lon * METERS_PER_DEGREE * cosine, p.lat * METERS_PER_DEGREE];
  while (stack.length) {
    const [start, end] = stack.pop();
    const [x1, y1] = xy(segment[start]);
    const [x2, y2] = xy(segment[end]);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const d2 = dx * dx + dy * dy;
    let best = -1;
    let bestSq = sqTol;
    for (let i = start + 1; i < end; i++) {
      const [x, y] = xy(segment[i]);
      const t = d2 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / d2)) : 0;
      const distanceSq = (x - (x1 + t * dx)) ** 2 + (y - (y1 + t * dy)) ** 2;
      if (distanceSq > bestSq) { bestSq = distanceSq; best = i; }
    }
    if (best > -1) {
      keep[best] = 1;
      stack.push([start, best], [best, end]);
    }
  }
  return segment.filter((_, i) => keep[i]);
}

export function prepareRoute({ id, name, source, segments, date, isDemo = false }) {
  const cleaned = segments.map(seg => seg.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180))
    .filter(seg => seg.length >= 2);
  if (!cleaned.length) throw new Error('有効なGPS座標が見つかりません');
  const first = cleaned[0][0];
  const lastSeg = cleaned[cleaned.length - 1];
  const last = lastSeg[lastSeg.length - 1];
  const firstTime = first.time || null;
  const lastTime = last.time || null;
  const seconds = firstTime && lastTime ? (new Date(lastTime) - new Date(firstTime)) / 1000 : null;
  return {
    id, name, source, isDemo, date: date || firstTime || null,
    distanceKm: Math.round(lengthKm(cleaned) * 10) / 10,
    elapsedSeconds: seconds > 0 && seconds < 60 * 60 * 24 * 14 ? Math.round(seconds) : null,
    pointCount: cleaned.reduce((sum, seg) => sum + seg.length, 0),
    segments: cleaned,
    overview: cleaned.map(seg => simplify(seg, 60)),
  };
}

function gpxChildren(el, localName) {
  return Array.from(el.childNodes || []).filter(n => n.nodeType === 1 && n.localName === localName);
}
function gpxChildText(el, localName) {
  const n = gpxChildren(el, localName)[0];
  return n ? n.textContent.trim() : '';
}
function parsePoints(elements) {
  return elements.map(el => {
    const latText = el.getAttribute('lat');
    const lonText = el.getAttribute('lon');
    const lat = latText === null || latText.trim() === '' ? NaN : Number(latText);
    const lon = lonText === null || lonText.trim() === '' ? NaN : Number(lonText);
    const ele = gpxChildText(el, 'ele');
    const time = gpxChildText(el, 'time');
    return { lat, lon, ...(ele && Number.isFinite(Number(ele)) ? { ele: Number(ele) } : {}), ...(time && !Number.isNaN(Date.parse(time)) ? { time } : {}) };
  }).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

export function parseGpx(text, filename = 'activity.gpx') {
  if (typeof DOMParser === 'undefined') throw new Error('GPXの解析にはブラウザが必要です');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('GPXのXML形式が不正です');
  const root = doc.documentElement;
  if (!root || root.localName !== 'gpx') throw new Error('GPXファイルではありません');
  const tracks = Array.from(doc.getElementsByTagNameNS('*', 'trk'));
  let segments = [];
  let name = filename.replace(/\.gpx$/i, '');
  if (tracks.length) {
    const trackName = gpxChildText(tracks[0], 'name');
    if (trackName) name = trackName;
    for (const trk of tracks) {
      for (const seg of Array.from(trk.getElementsByTagNameNS('*', 'trkseg'))) {
        segments.push(parsePoints(Array.from(seg.getElementsByTagNameNS('*', 'trkpt'))));
      }
    }
  } else {
    const routes = Array.from(doc.getElementsByTagNameNS('*', 'rte'));
    if (routes.length) {
      const routeName = gpxChildText(routes[0], 'name');
      if (routeName) name = routeName;
      segments = routes.map(rte => parsePoints(Array.from(rte.getElementsByTagNameNS('*', 'rtept'))));
    } else {
      const waypoints = Array.from(doc.getElementsByTagNameNS('*', 'wpt'));
      if (waypoints.length > 1) segments = [parsePoints(waypoints)];
    }
  }
  const metadata = Array.from(doc.getElementsByTagNameNS('*', 'metadata'))[0];
  const date = metadata ? gpxChildText(metadata, 'time') : '';
  return { name, source: 'GPX', segments, date: date || null };
}

function byteWidth(baseType) {
  switch (baseType & 0x1f) {
    case 3: case 4: case 11: return 2;
    case 5: case 6: case 8: case 12: return 4;
    case 9: case 14: case 15: case 16: return 8;
    default: return 1;
  }
}

function readFitValue(view, at, size, type, little) {
  if (size < byteWidth(type)) return null;
  const b = type & 0x1f;
  let value;
  switch (b) {
    case 0: case 2: case 10: case 13: value = view.getUint8(at); break;
    case 1: value = view.getInt8(at); break;
    case 3: value = view.getInt16(at, little); break;
    case 4: case 11: value = view.getUint16(at, little); break;
    case 5: value = view.getInt32(at, little); break;
    case 6: case 12: value = view.getUint32(at, little); break;
    case 8: value = view.getFloat32(at, little); break;
    case 9: value = view.getFloat64(at, little); break;
    default: return null;
  }
  if ((b === 5 && value === 0x7fffffff) || (b === 6 && value === 0xffffffff) ||
      (b === 4 && value === 0xffff) || (b === 3 && value === 0x7fff) ||
      (b === 2 && value === 0xff) || (b === 1 && value === 0x7f)) return null;
  return Number.isFinite(value) ? value : null;
}

/** Decode common FIT tracks, including compressed-timestamp record headers. */
export function parseFit(arrayBuffer, filename = 'activity.fit') {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 14 || String.fromCharCode(...bytes.slice(8, 12)) !== '.FIT') {
    throw new Error('FITヘッダーが不正です');
  }
  const headerSize = bytes[0];
  if (headerSize !== 12 && headerSize !== 14) throw new Error('対応していないFITヘッダーです');
  const dataLength = view.getUint32(4, true);
  const end = headerSize + dataLength;
  if (end > bytes.length - 2) throw new Error('FITのデータ長が不正です');
  const defs = new Map();
  const points = [];
  let createdAt = null;
  let lastTimestamp = null;
  let pos = headerSize;
  while (pos < end) {
    const header = bytes[pos++];
    const compressed = (header & 0x80) !== 0;
    const definition = !compressed && (header & 0x40) !== 0;
    const local = compressed ? (header >> 5) & 0x03 : header & 0x0f;
    if (definition) {
      const hasDeveloperFields = (header & 0x20) !== 0;
      if (pos + 5 > end) throw new Error('FITの定義が途中で切れています');
      pos += 1; // reserved
      const little = bytes[pos++] === 0;
      const global = view.getUint16(pos, little); pos += 2;
      const numFields = bytes[pos++];
      if (pos + numFields * 3 > end) throw new Error('FITのフィールド定義が不正です');
      const fields = [];
      for (let j = 0; j < numFields; j++) {
        fields.push({ number: bytes[pos], size: bytes[pos + 1], type: bytes[pos + 2] });
        pos += 3;
      }
      const developerFields = [];
      if (hasDeveloperFields) {
        if (pos >= end) throw new Error('FITの開発者定義が不正です');
        const numDev = bytes[pos++];
        if (pos + numDev * 3 > end) throw new Error('FITの開発者フィールドが不正です');
        for (let j = 0; j < numDev; j++) {
          developerFields.push({ size: bytes[pos + 1] });
          pos += 3;
        }
      }
      defs.set(local, { global, little, fields, developerFields });
      continue;
    }
    const def = defs.get(local);
    if (!def) throw new Error('FITのメッセージ定義がありません');
    const values = {};
    for (const field of def.fields) {
      // A compressed-timestamp record does not carry timestamp field 253
      // in the payload, even if the active message definition lists it.
      if (compressed && field.number === 253) continue;
      if (pos + field.size > end) throw new Error('FITのレコードが途中で切れています');
      if ((def.global === 20 && [0, 1, 2, 78].includes(field.number)) ||
          field.number === 253 || (def.global === 0 && field.number === 4)) {
        values[field.number] = readFitValue(view, pos, field.size, field.type, def.little);
      }
      pos += field.size;
    }
    for (const dev of def.developerFields) {
      if (pos + dev.size > end) throw new Error('FITの開発者レコードが途中で切れています');
      pos += dev.size;
    }
    // Compressed timestamp headers store five low bits of the next timestamp.
    // The previous complete timestamp provides the higher bits.
    if (compressed && lastTimestamp != null && values[253] == null) {
      const offset = header & 0x1f;
      let timestamp = (lastTimestamp - lastTimestamp % 32) + offset;
      if (timestamp < lastTimestamp) timestamp += 32;
      values[253] = timestamp;
    }
    if (values[253] != null) lastTimestamp = values[253];
    if (def.global === 0 && values[4] != null) {
      createdAt = new Date(FIT_EPOCH_MS + values[4] * 1000).toISOString();
    }
    if (def.global === 20 && values[0] != null && values[1] != null) {
      const lat = values[0] * 180 / 2147483648;
      const lon = values[1] * 180 / 2147483648;
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        const point = { lat, lon };
        const altitude = values[78] ?? values[2];
        if (altitude != null) point.ele = altitude / 5 - 500;
        if (values[253] != null) point.time = new Date(FIT_EPOCH_MS + values[253] * 1000).toISOString();
        points.push(point);
      }
    }
  }
  return { name: filename.replace(/\.fit$/i, ''), source: 'FIT', segments: [points], date: points[0]?.time || createdAt };
}
