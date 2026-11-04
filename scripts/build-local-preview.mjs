/** Generate a single-file HTML preview. OpenStreetMap tiles REQUIRE an HTTP
 * Referer, which browsers cannot send from file://. Therefore the file preview
 * shows setup guidance instead of requesting OSM tiles. Use run-local.cmd or
 * `python -m http.server 8000` for a full map. This build is kept as a helpful
 * compatibility fallback; the published index.html stays modular.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = async p => readFile(resolve(root, p), 'utf8');
const [index, css, parsers, streetview, app] = await Promise.all([
  read('index.html'), read('styles.css'), read('src/parsers.js'),
  read('src/streetview.js'), read('src/app.js'),
]);

const scriptRegex = /<script defer src="(https:\/\/unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.js)"([^>]*)><\/script>\s*<script defer type="module" src="src\/app\.js"><\/script>/;
const found = index.match(scriptRegex);
if (!found) throw new Error('index.html Leaflet/module script tags not found');
const leafletScript = `<script src="${found[1]}"${found[2]}></script>`;
const cleaned = [parsers, streetview, app]
  .map(s => s.replace(/^import\s+[^\n;]+;\s*$/gm, '').replace(/^export\s+/gm, ''))
  .join('\n\n');
const safeJs = cleaned.replace(/<\/script/gi, '<\\/script');
const result = index
  .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${css}\n</style>`)
  .replace(scriptRegex, '')
  .replace('</body>', `${leafletScript}\n<script>\n${safeJs}\n</script>\n</body>`);
if (result.includes('src="src/app.js"') || result.includes('href="styles.css"')) {
  throw new Error('Preview still references a module or local stylesheet');
}
const destination = resolve(root, 'local-preview.html');
await writeFile(destination, result, 'utf8');
console.log(`Created ${destination} (${Buffer.byteLength(result)} bytes).`);
