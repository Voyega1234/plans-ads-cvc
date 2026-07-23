// Preflight: catches the exact bug class that broke the AI pages —
// a bare package specifier that resolves locally (hoisted transitively into
// node_modules) but is NOT declared in package.json, so Vercel's clean install
// never fetches it and the import throws MODULE_NOT_FOUND at runtime.
//
// Usage:  node scripts/preflight-deps.js     (exit 1 = do not deploy)
//
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const declared = new Set([
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  ...Object.keys(pkg.optionalDependencies || {}),
]);

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(e.name)) files.push(p);
  }
})(path.join(ROOT, 'src'));

// Matching must distinguish a REAL import from example code quoted inside a string
// (the setup-guide pages embed snippets like `... import { X } from "@next/third-parties/google"`
// inside Thai instruction strings). A real static import/re-export always starts its
// own line — either with the `import`/`export` keyword, or with the `}` that closes a
// multi-line specifier list. Dynamic import()/require() are matched anywhere.
// Three real shapes: `import|export … from 'x'`, side-effect `import 'x'`, and the
// `} from 'x'` line that closes a multi-line specifier list. Requiring `from` (or a
// bare side-effect import) is what keeps `export const dynamic = "force-dynamic"`
// and string-union type aliases out of the results.
const STATIC = /^\s*(?:import|export)\b[^'"]*\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|^\s*\}\s*from\s*['"]([^'"]+)['"]/;
const DYNAMIC = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]/g;
const builtin = new Set(require('module').builtinModules);
const used = new Map(); // pkgName -> Set(files)

function collect(spec, f) {
  if (!spec) return;
  if (spec.startsWith('.') || spec.startsWith('@/') || spec.startsWith('/')) return;
  const clean = spec.replace(/^node:/, '');
  if (builtin.has(clean) || builtin.has(clean.split('/')[0])) return;
  // package name = first segment, or first two for @scope/name
  const parts = clean.split('/');
  const name = clean.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  // Real npm package names never contain whitespace or exotic characters.
  if (!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)) return;
  if (!used.has(name)) used.set(name, new Set());
  used.get(name).add(path.relative(ROOT, f));
}

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const line of src.split('\n')) {
    const s = line.match(STATIC);
    if (s) collect(s[1] || s[2] || s[3], f);
  }
  let d;
  while ((d = DYNAMIC.exec(src))) collect(d[1], f);
}

const missing = [];
const phantom = []; // declared? no. resolves? yes -> the dangerous case
for (const [name, where] of [...used].sort()) {
  if (declared.has(name)) continue;
  const onDisk = fs.existsSync(path.join(ROOT, 'node_modules', name));
  (onDisk ? phantom : missing).push([name, [...where]]);
}

console.log('files scanned:', files.length);
console.log('external packages imported:', used.size);
console.log('');
if (phantom.length) {
  console.log('!! PHANTOM DEPS (resolve locally, NOT in package.json -> will break on Vercel):');
  for (const [n, w] of phantom) console.log('   -', n, '<-', w.slice(0, 4).join(', '));
} else {
  console.log('OK: no phantom deps (every imported package is declared in package.json)');
}
if (missing.length) {
  console.log('!! UNRESOLVABLE IMPORTS (not declared, not on disk):');
  for (const [n, w] of missing) console.log('   -', n, '<-', w.slice(0, 4).join(', '));
} else {
  console.log('OK: every imported package resolves on disk');
}

if (phantom.length || missing.length) {
  console.log('\nFAIL — fix the above before deploying (these break on a clean Vercel install).');
  process.exit(1);
}
console.log('\nPASS — dependency graph is safe to deploy.');
