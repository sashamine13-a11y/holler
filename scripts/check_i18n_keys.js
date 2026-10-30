#!/usr/bin/env node
/** Verify every t('key') used in src has a translation in all 4 locales. */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const i18nPath = path.join(SRC, 'lib', 'i18n.tsx');
const i18nSrc = fs.readFileSync(i18nPath, 'utf8');

// Extract keys per locale block from the i18n source
function extractKeys(blockName) {
  const idx = i18nSrc.indexOf(`const ${blockName}: Record<string, string> = {`);
  if (idx < 0) throw new Error('block not found: ' + blockName);
  // find matching closing brace at depth: starts after '{'
  let i = i18nSrc.indexOf('{', idx);
  let depth = 0;
  let end = i;
  for (; i < i18nSrc.length; i++) {
    if (i18nSrc[i] === '{') depth++;
    else if (i18nSrc[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const block = i18nSrc.slice(i18nSrc.indexOf('{', idx), end + 1);
  const keys = new Set();
  const re = /'([a-zA-Z0-9_.]+)':/g;
  let m;
  while ((m = re.exec(block))) keys.add(m[1]);
  return keys;
}

const en = extractKeys('en');
const ru = extractKeys('ru');
const es = extractKeys('es');
const de = extractKeys('de');

// Scan components for t('...') and t(`cat.${...}`) style dynamic keys
const used = new Set();
const dynamicPrefixes = new Set();
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(tsx?|ts)$/.test(f)) {
      const src = fs.readFileSync(p, 'utf8');
      let m;
      const re = /\bt\(\s*'([^']+)'/g;
      while ((m = re.exec(src))) used.add(m[1]);
      const re2 = /\bt\(\s*`([^`]+)`/g;
      while ((m = re2.exec(src))) {
        const dyn = m[1].replace(/\$\{[^}]*\}/g, '*');
        dynamicPrefixes.add(dyn);
      }
    }
  }
}
walk(SRC);

// Resolve dynamic prefixes against known en keys (e.g. cat.*)
const dynamicResolved = new Set();
for (const pref of dynamicPrefixes) {
  if (pref.includes('*')) {
    const base = pref.split('*')[0];
    for (const k of en) if (k.startsWith(base)) dynamicResolved.add(k);
  } else {
    dynamicResolved.add(pref);
  }
}

const allUsed = new Set([...used, ...dynamicResolved]);
// keys legitimately referenced dynamically only
const allowedDynamic = ['cat.'];
const missing = [...allUsed].filter(k => !en.has(k) && !allowedDynamic.some(p => k.startsWith(p)));

function diff(a, b, nameA, nameB) {
  const out = [];
  for (const k of a) if (!b.has(k)) out.push(`${k} (in ${nameA}, not ${nameB})`);
  return out;
}

const problems = [
  ...missing.map(k => `USED-BUT-MISSING: ${k}`),
  ...diff(ru, en, 'ru', 'en'),
  ...diff(es, en, 'es', 'en'),
  ...diff(de, en, 'de', 'en'),
  ...diff(en, ru, 'en', 'ru'),
  ...diff(en, es, 'en', 'es'),
  ...diff(en, de, 'en', 'de'),
];

console.log(`en keys: ${en.size}, ru: ${ru.size}, es: ${es.size}, de: ${de.size}`);
console.log(`used keys in code: ${used.size} + dynamic resolved: ${dynamicResolved.size}`);
if (problems.length === 0) {
  console.log('ALL KEYS OK');
} else {
  console.log('PROBLEMS:');
  for (const p of problems) console.log(' -', p);
  process.exitCode = 1;
}
