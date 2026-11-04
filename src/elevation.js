/** Elevation processing for GPX/FIT tracks.
 * Min/max describe recorded (not interpolated) heights. Ascent is an estimate:
 * median-of-five smoothing followed by a 3 m reversal deadband. Breaks in
 * altitude samples or track segments never contribute to cumulative gain.
 */
const ELEVATION_RAD = Math.PI / 180;
const REVERSAL_METERS = 3;

export function segmentDistanceMeters(a, b) {
  const dLat = (b.lat - a.lat) * ELEVATION_RAD;
  const dLon = (b.lon - a.lon) * ELEVATION_RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * ELEVATION_RAD) * Math.cos(b.lat * ELEVATION_RAD) * Math.sin(dLon / 2) ** 2;
  return 12742017.6 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function medianFive(heights) {
  if (heights.length < 5) return heights;
  const out = heights.slice();
  for (let i = 2; i < heights.length - 2; i++) {
    const window = heights.slice(i-2, i+3).sort((a,b)=>a-b);
    out[i] = window[2];
  }
  return out;
}

/** Add meaningful uphill excursions, not every noisy positive GPS fluctuation. */
export function ascentForHeights(heights, threshold = REVERSAL_METERS) {
  if (heights.length < 2) return 0;
  const series = medianFive(heights);
  let base = series[0], extremum = base, direction = 0, gain = 0;
  for (let i=1; i<series.length; i++) {
    const height = series[i];
    if (direction === 0) {
      if (height >= base + threshold) { direction = 1; extremum = height; }
      else if (height <= base - threshold) { direction = -1; extremum = height; }
    } else if (direction === 1) {
      if (height > extremum) extremum = height;
      else if (height <= extremum - threshold) {
        gain += Math.max(0, extremum - base);
        base = extremum;
        extremum = height;
        direction = -1;
      }
    } else {
      if (height < extremum) extremum = height;
      else if (height >= extremum + threshold) {
        base = extremum;
        extremum = height;
        direction = 1;
      }
    }
  }
  if (direction === 1) gain += Math.max(0, extremum - base);
  return gain;
}

export function computeElevationStats(segments) {
  let min = Infinity, max = -Infinity, points = 0, totalPoints = 0;
  let ascent = 0, pairs = 0;
  for (const seg of segments) {
    let contiguous = [];
    const flush = () => {
      if (contiguous.length >= 2) { ascent += ascentForHeights(contiguous); pairs += contiguous.length - 1; }
      contiguous = [];
    };
    for (const p of seg) {
      totalPoints++;
      if (typeof p.ele !== 'number' || !Number.isFinite(p.ele)) { flush(); continue; }
      points++;
      min = Math.min(min, p.ele);
      max = Math.max(max, p.ele);
      contiguous.push(p.ele);
    }
    flush();
  }
  return {
    minElevation: points ? Math.round(min) : null,
    maxElevation: points ? Math.round(max) : null,
    ascentMeters: pairs ? Math.round(ascent) : null,
    elevationPointCount: points,
    elevationTotalPointCount: totalPoints,
  };
}

export function formatDistanceElevation(route) {
  const km = Number.isFinite(route.distanceKm) ? Number(route.distanceKm.toFixed(1)).toLocaleString('ja-JP') : '—';
  const distance = `${km}km`;
  const min = route.minElevation;
  const max = route.maxElevation;
  const ascent = route.ascentMeters;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return `${distance}, 標高データなし`;
  const d = Number.isFinite(ascent) ? `D+${Math.round(ascent).toLocaleString('ja-JP')}` : 'D+—';
  return `${distance}, ${d} (${Math.round(min)}-${Math.round(max)}) m`;
}

/** Collect altitude samples along cumulative horizontal route distance.
 * Missing heights split the polyline; different track segments are not joined.
 */
export function buildElevationProfile(segments, maxPoints = 1100) {
  const paths = [];
  let run = [];
  let cumulative = 0;
  let total = 0;
  let min = Infinity, max = -Infinity;
  const flush = () => {
    if (run.length) paths.push(run);
    run = [];
  };
  for (const segment of segments) {
    flush();
    let prior = null;
    for (const p of segment) {
      if (prior) {
        const d = segmentDistanceMeters(prior,p);
        if (Number.isFinite(d) && d < 25000) cumulative += d / 1000;
      }
      prior = p;
      if (typeof p.ele !== 'number' || !Number.isFinite(p.ele)) { flush(); continue; }
      min = Math.min(min,p.ele);
      max = Math.max(max,p.ele);
      total++;
      run.push({ km: cumulative, ele: p.ele });
    }
  }
  flush();
  // Downsample each path while retaining local minima and maxima in each bucket.
  // This avoids erasing short climbs in long cycling routes.
  const reduced = paths.map(path => {
    if (path.length <= maxPoints || maxPoints < 4) return path;
    const chunks = Math.max(1, Math.floor(maxPoints / 2));
    const result = [path[0]];
    for (let b=0; b<chunks; b++) {
      const start = Math.max(1,Math.floor(b * (path.length - 2) / chunks) + 1);
      const end = Math.min(path.length - 1, Math.floor((b+1)*(path.length - 2) / chunks) + 1);
      if (end <= start) continue;
      let low = start, high = start;
      for (let j=start+1; j<end; j++) {
        if (path[j].ele < path[low].ele) low = j;
        if (path[j].ele > path[high].ele) high = j;
      }
      const indices = [...new Set([low,high])].sort((a,b)=>a-b);
      for (const index of indices) if (result[result.length-1] !== path[index]) result.push(path[index]);
    }
    if (result[result.length-1] !== path[path.length-1]) result.push(path[path.length-1]);
    return result;
  });
  return { paths: reduced, minElevation: total ? min : null, maxElevation: total ? max : null, distanceKm: cumulative, sampleCount: total };
}
