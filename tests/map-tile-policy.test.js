import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('web app uses policy-compliant referrer setting for OSMF tile requests', () => {
  assert.match(read('index.html'), /name="referrer" content="strict-origin-when-cross-origin"/);
  assert.match(read('src/app.js'), /referrerPolicy:\s*'strict-origin-when-cross-origin'/);
});

test('file scheme never initializes OSM tile requests and displays instructions', () => {
  const app = read('src/app.js');
  assert.match(app, /window\.location\.protocol === 'file:'/);
  assert.ok(app.includes("$('protocol-warning')"));
  assert.match(app, /else\s*\{\s*L\.tileLayer\('https:\/\/tile\.openstreetmap\.org/);
  const html = read('local-preview.html');
  assert.match(html, /id="protocol-warning"/);
  assert.match(html, /window\.location\.protocol === 'file:'/);
});

test('Windows launcher starts a local HTTP server only on loopback', () => {
  const bat = read('run-local.cmd');
  assert.match(bat, /http\.server 8000 --bind 127\.0\.0\.1/);
  assert.match(bat, /http:\/\/127\.0\.0\.1:8000\//);
});
