// Baut eine einzelne, selbständige HTML-Datei (für GitHub Pages: docs/index.html).
// Aufruf: node tools/bundle.mjs [ausgabe.html]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || resolve(root, 'docs/index.html'));
const order = ['terrain', 'sim', 'audio', 'fx', 'skier-model', 'world', 'game'];

let code = order
  .map((n) => readFileSync(resolve(root, 'src', n + '.js'), 'utf8'))
  .map((s) =>
    s
      .replace(/^import .*;\s*$/gm, '')
      .replace(/^const THREE = window\.THREE;\s*$/gm, '')
      .replace(/^export (const|function|class|let) /gm, '$1 ')
  )
  .join('\n');
code = `(function(){\n'use strict';\nconst THREE = window.THREE;\n${code}\n})();`;
if (code.includes('</script')) throw new Error('</script im Code');

let html = readFileSync(resolve(root, 'index.html'), 'utf8');
const css = readFileSync(resolve(root, 'src/style.css'), 'utf8');
html = html
  .replace('<link rel="stylesheet" href="src/style.css">', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="src/game.js"></script>', `<script>\n${code}\n</script>`);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log('geschrieben:', out, Math.round(html.length / 1024) + ' KB');
