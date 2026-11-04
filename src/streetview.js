/** Official Maps URL scheme: no Google Maps JavaScript API key required. */
export function validateCoordinates(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new RangeError('緯度または経度が不正です');
  }
}

export function streetViewUrl(lat, lng) {
  validateCoordinates(lat, lng);
  const url = new URL('https://www.google.com/maps/@');
  url.searchParams.set('api', '1');
  url.searchParams.set('map_action', 'pano');
  url.searchParams.set('viewpoint', `${lat.toFixed(6)},${lng.toFixed(6)}`);
  return url.toString();
}

export function googleMapsPointUrl(lat, lng) {
  validateCoordinates(lat, lng);
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', `${lat.toFixed(6)},${lng.toFixed(6)}`);
  return url.toString();
}
