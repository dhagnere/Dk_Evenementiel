// Convertit une maquette .dc.html en page HTML autonome (moteur et logique intégrés).
// Usage : node outils/dc-vers-html.mjs <source.dc.html> <sortie.html> [titre]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [src, dest, title = 'Maquette'] = process.argv.slice(2);
if (!src || !dest) {
  console.error('Usage : node outils/dc-vers-html.mjs <source.dc.html> <sortie.html> [titre]');
  process.exit(1);
}

const html = readFileSync(src, 'utf8');
const runtime = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'dc-runtime.js'), 'utf8');

const pick = (re, label) => {
  const m = re.exec(html);
  if (!m) throw new Error(`${label} introuvable dans ${src}`);
  return m[1];
};
const lang = /<html[^>]*\blang="([^"]+)"/.exec(html)?.[1] || 'fr';
const xdc = pick(/<x-dc>([\s\S]*?)<\/x-dc>/, '<x-dc>');
const helmet = /<helmet>([\s\S]*?)<\/helmet>/.exec(xdc)?.[1] || '';
const body = xdc.replace(/<helmet>[\s\S]*?<\/helmet>/, '');
const scriptTag = pick(/(<script[^>]*data-dc-script[^>]*>[\s\S]*?<\/script>)/, 'script data-dc-script');
const logic = /<script[^>]*>([\s\S]*?)<\/script>/.exec(scriptTag)[1];
const propsDecl = JSON.parse(/data-props='([^']*)'/.exec(scriptTag)?.[1] || '{}');
const props = {};
for (const [k, v] of Object.entries(propsDecl)) if (!k.startsWith('$') && v && 'default' in v) props[k] = v.default;

// Analyse du balisage : le parseur HTML du navigateur déplacerait <sc-for> hors des <table> et <select>.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENT[e.toLowerCase()] ?? m;
});

function parse(text) {
  const root = { t: '#root', a: [], c: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(text))) {
    const top = stack[stack.length - 1];
    if (m[0].startsWith('<!--')) continue;
    if (m[1]) {
      const name = m[1];
      while (stack.length > 1 && stack.pop().t !== name);
    } else if (m[2]) {
      const t = m[2];
      const a = [];
      const ar = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let am;
      while ((am = ar.exec(m[3]))) a.push([am[1], decode(am[2] ?? am[3] ?? am[4] ?? '')]);
      const node = { t, a, c: [] };
      top.c.push(node);
      if (!m[4] && !VOID.has(t.toLowerCase())) stack.push(node);
    } else if (m[5]) {
      top.c.push(decode(m[5]));
    }
  }
  return root.c;
}

// Les blancs entre balises sont réduits à une espace, comme à l'affichage.
function squeeze(nodes) {
  return nodes.map((n) => (typeof n === 'string' ? n.replace(/\s+/g, ' ') : { ...n, c: squeeze(n.c) }));
}

const tree = squeeze(parse(body));
const safeJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

const out = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</title>
${helmet.trim()}
</head>
<body>
<div id="dc-root"></div>
<script>
${runtime.trim()}
</script>
<script>
${logic.trim()}
DCMount(Component, ${safeJson(tree)}, ${safeJson(props)});
</script>
</body>
</html>
`;
writeFileSync(dest, out);
console.log(`${dest} généré (${(out.length / 1024).toFixed(0)} Ko)`);
