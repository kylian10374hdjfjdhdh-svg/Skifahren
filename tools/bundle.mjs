// Baut selbständige HTML-Dateien (für GitHub Pages im Ordner docs/).
// Aufruf: node tools/bundle.mjs            -> docs/index.html (Endlos) und docs/slalom.html
//         node tools/bundle.mjs endlos out.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = {
  endlos: {
    page: 'index.html',
    css: ['src/style.css'],
    entry: 'src/game.js',
    out: 'docs/index.html',
    modules: ['terrain', 'sim', 'audio', 'fx', 'skier-model', 'world', 'game'],
  },
  slalom: {
    page: 'slalom.html',
    css: ['src/style.css', 'src/slalom/slalom.css'],
    entry: 'src/slalom/game.js',
    out: 'docs/slalom.html',
    modules: ['terrain', 'sim', 'audio', 'fx', 'skier-model', 'slalom/course', 'slalom/world', 'slalom/game'],
  },
};

function build(name, outOverride) {
  const t = TARGETS[name];
  let code = t.modules
    .map((n) => readFileSync(resolve(root, 'src', n + '.js'), 'utf8'))
    .map((s) =>
      s
        .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];[ \t]*\r?$/gm, '')
        .replace(/^const THREE = window\.THREE;\s*$/gm, '')
        .replace(/^export (const|function|class|let) /gm, '$1 ')
    )
    .join('\n');
  code = `(function(){\n'use strict';\nconst THREE = window.THREE;\n${code}\n})();`;
  if (code.includes('</script')) throw new Error('</script im Code');
  if (/^\s*(import|export)\s/m.test(code)) throw new Error('import/export im Bundle übrig (' + name + ')');

  let html = readFileSync(resolve(root, t.page), 'utf8');
  const css = t.css.map((f) => readFileSync(resolve(root, f), 'utf8')).join('\n');
  html = html.replace(/<link rel="stylesheet" href="[^"]+">\s*/g, '');
  html = html.replace('</head>', `<style>\n${css}\n</style>\n</head>`);
  html = html.replace(`<script type="module" src="${t.entry}"></script>`, () => `<script>\n${code}\n</script>`);
  if (html.includes('type="module"')) throw new Error('Modul-Script nicht ersetzt (' + name + ')');

  const out = resolve(outOverride || resolve(root, t.out));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log('geschrieben:', out, Math.round(html.length / 1024) + ' KB');
}

const [, , a, b] = process.argv;
if (a && TARGETS[a]) build(a, b);
else if (a) {
  // Abwärtskompatibel: erstes Argument = Ausgabedatei für den Endlos-Modus
  build('endlos', a);
} else {
  build('endlos');
  build('slalom');
}
