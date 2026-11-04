import test from 'node:test';
import assert from 'node:assert/strict';
import { computeElevationStats, ascentForHeights, buildElevationProfile, formatDistanceElevation } from '../src/elevation.js';
import { prepareRoute, simplify, upgradeRoute } from '../src/parsers.js';

const seq = heights => heights.map((ele,i)=>({lat:32.7+i*0.0001,lon:129.8,ele}));

test('D+ sums independent climbs and ignores descents',()=>{
  const stats=computeElevationStats([seq([100,110,120,130,140,150,160,160,160,150,140,130,120,110,100,100,100,110,120,130,140])]);
  assert.equal(stats.minElevation,100);
  assert.equal(stats.maxElevation,160);
  assert.equal(stats.ascentMeters,100);
});

test('D+ robust to an isolated altitude spike and small noisy changes',()=>{
  const noisy=Array.from({length:21},(_,i)=>100+(i%2 ? 1 : -1));
  noisy[10]=140;
  assert.ok(ascentForHeights(noisy)<=3);
});

test('elevation zeros are valid, missing samples split climbs, no bridge across tracks',()=>{
  const stats=computeElevationStats([
    seq([0,10,20,{bad:true}]).map(p=>({...p,ele:typeof p.ele==='number'?p.ele:undefined})),
    seq([100,110,120]),
    seq([10,20,30])
  ]);
  assert.equal(stats.minElevation,0);
  assert.equal(stats.maxElevation,120);
  assert.equal(stats.ascentMeters,60);
  assert.equal(stats.elevationPointCount,9);
});

test('format route uses D+ notation and omits unknown heights',()=>{
  assert.equal(formatDistanceElevation({distanceKm:41,minElevation:3,maxElevation:420,ascentMeters:793}),
    '41km, D+793 (3-420) m');
  assert.equal(formatDistanceElevation({distanceKm:32.4,minElevation:null,maxElevation:null,ascentMeters:null}),
    '32.4km, 標高データなし');
});

test('v0.2 persisted route upgrades to 15m overview and adds altitude without losing originals',()=>{
  const segments=[Array.from({length:40},(_,i)=>({lat:32.7+i*0.0001,lon:129.8+Math.sin(i/3)*0.0002,ele:100+i}))];
  const v02={id:'a',name:'old',source:'GPX',distanceKm:2,pointCount:40,segments,overview:segments.map(s=>simplify(s,60))};
  const v03=upgradeRoute(v02);
  assert.equal(v03.schemaVersion,3);
  assert.equal(v03.overviewToleranceMeters,15);
  assert.strictEqual(v03.segments,v02.segments);
  assert.ok(v03.overview[0].length>=v02.overview[0].length);
  assert.equal(v03.minElevation,100);
  assert.equal(v03.maxElevation,139);
  assert.equal(v03.ascentMeters,39);
  assert.strictEqual(upgradeRoute(v03),v03);
});

test('profile x is monotonically cumulative and absent elevation splits plot',()=>{
  const input=[seq([2,3,4]),[{lat:32.9,lon:129.9,ele:10},{lat:32.9001,lon:129.9},{lat:32.9002,lon:129.9,ele:12}]];
  const profile=buildElevationProfile(input);
  assert.equal(profile.paths.length,3);
  assert.ok(profile.distanceKm>0);
  for(const path of profile.paths) for(let i=1;i<path.length;i++) assert.ok(path[i].km>=path[i-1].km);
});

test('large profile retains global peaks with approximately bounded sample count',()=>{
  const data=seq(Array.from({length:4000},(_,i)=>100+i/100+(i===2111?300:0)));
  const out=buildElevationProfile([data],500);
  assert.ok(out.paths[0].length<600);
  assert.ok(out.paths[0].some(p=>p.ele>400));
});
