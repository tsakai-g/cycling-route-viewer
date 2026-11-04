import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFit, simplify, prepareRoute, haversineMeters } from '../src/parsers.js';

function makeFit(points) {
  const message = [];
  // Definition: global 20 / RECORD, with positionLat (sint32),
  // positionLong (sint32), timestamp (uint32), altitude (uint16).
  message.push(0x40, 0x00, 0x00, 20, 0, 4, 0,4,0x85, 1,4,0x85, 253,4,0x86, 2,2,0x84);
  for (const [lat,lon,timestamp,altitude] of points) {
    const record = new Uint8Array(15);
    const view = new DataView(record.buffer);
    record[0] = 0;
    view.setInt32(1, Math.round(lat / 180 * 2147483648), true);
    view.setInt32(5, Math.round(lon / 180 * 2147483648), true);
    view.setUint32(9, timestamp, true);
    view.setUint16(13, Math.round((altitude + 500) * 5), true);
    message.push(...record);
  }
  const bytes = new Uint8Array(14 + message.length + 2);
  bytes[0] = 14;
  bytes[1] = 0x20;
  bytes[2] = 0;
  bytes[3] = 0;
  new DataView(bytes.buffer).setUint32(4, message.length, true);
  bytes.set([46,70,73,84],8);
  bytes.set(message,14);
  return bytes.buffer;
}

test('decode ordinary FIT latitude, longitude, time and altitude', () => {
  const fit = makeFit([[32.74,129.88,1_000_000_000,100],[32.76,129.90,1_000_000_300,110]]);
  const result = parseFit(fit,'cycle.fit');
  assert.equal(result.source,'FIT');
  assert.equal(result.name,'cycle');
  assert.equal(result.segments[0].length,2);
  assert.ok(Math.abs(result.segments[0][0].lat-32.74)<0.000001);
  assert.ok(Math.abs(result.segments[0][1].lon-129.9)<0.000001);
  assert.equal(result.segments[0][0].ele,100);
  const route = prepareRoute({id:'a',...result});
  assert.ok(route.distanceKm>2);
  assert.equal(route.elapsedSeconds,300);
});

test('bad FIT files are rejected',()=>{
  assert.throws(()=>parseFit(new Uint8Array([1,2]).buffer));
  const buffer=makeFit([[32,130,100,0]]);
  const truncated=buffer.slice(0,buffer.byteLength-5);
  assert.throws(()=>parseFit(truncated));
});

test('geometry utility retains endpoints',()=>{
  const a=[{lat:32,lon:130},{lat:32.0001,lon:130.0001},{lat:32.0002,lon:130.0002}];
  const reduced=simplify(a,30);
  assert.equal(reduced.length,2);
  assert.equal(reduced[0],a[0]);
  assert.equal(reduced[1],a[2]);
  assert.ok(haversineMeters(a[0],a[2])>0);
});

// FIT's compressed record header replaces the 4-byte timestamp payload.
test('decode records with compressed timestamp headers', () => {
  const bytes = [];
  const u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  const i32 = n => u32((n | 0) >>> 0);
  const semi = value => Math.round(value * 2147483648 / 180);
  // Global message 20 (record), fields lat, lon and timestamp.
  bytes.push(0x40,0,0,20,0,3, 0,4,0x85,1,4,0x85,253,4,0x86);
  // Full record at t=1000.
  bytes.push(0x00,...i32(semi(32.74)),...i32(semi(129.88)),...u32(1000));
  // Compressed timestamp t=1005, no timestamp bytes in payload.
  bytes.push(0x80 | (1005 % 32),...i32(semi(32.741)),...i32(semi(129.881)));
  const result = new Uint8Array(14 + bytes.length + 2);
  result[0] = 14; result[1]=0x20;
  new DataView(result.buffer).setUint32(4,bytes.length,true);
  result.set([46,70,73,84],8);
  result.set(bytes,14);
  const fit = parseFit(result.buffer,'compressed.fit');
  assert.equal(fit.segments[0].length,2);
  const start = new Date(fit.segments[0][0].time).getTime();
  const stop = new Date(fit.segments[0][1].time).getTime();
  assert.equal((stop-start)/1000,5);
});
