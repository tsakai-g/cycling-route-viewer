import assert from 'node:assert/strict';
import test from 'node:test';
import { streetViewUrl, googleMapsPointUrl, validateCoordinates } from '../src/streetview.js';

test('Google Maps Street View URL uses official map_action=pano and viewpoint', () => {
  const link = new URL(streetViewUrl(32.744,129.874));
  assert.equal(link.origin,'https://www.google.com');
  assert.equal(link.pathname,'/maps/@');
  assert.equal(link.searchParams.get('api'),'1');
  assert.equal(link.searchParams.get('map_action'),'pano');
  assert.equal(link.searchParams.get('viewpoint'),'32.744000,129.874000');
});

test('fallback opens the selected GPS point on Google Maps', () => {
  const link = new URL(googleMapsPointUrl(32.744,129.874));
  assert.equal(link.pathname,'/maps/search/');
  assert.equal(link.searchParams.get('api'),'1');
  assert.equal(link.searchParams.get('query'),'32.744000,129.874000');
});

test('valid coordinates include zero, poles and the date line', () => {
  for (const [lat,lng] of [[0,0],[90,180],[-90,-180],[35.681236,139.767125]]) {
    assert.doesNotThrow(() => validateCoordinates(lat,lng));
  }
});

test('out-of-range/non-finite coordinates are rejected', () => {
  for (const [lat,lng] of [[91,0],[0,181],[-91,0],[0,-181],[NaN,0],[0,Infinity],[null,0]]) {
    assert.throws(() => streetViewUrl(lat,lng), RangeError);
  }
});
