#!/usr/bin/env node
/**
 * Compare un rapport de référence (Lovable Cloud) avec un rapport cible (kidi+).
 *
 * Usage:
 *   node scripts/compare-backends.mjs docs/backend-baseline.json /tmp/kidi-report.json
 *
 * Strictement en lecture: ne fait que lire deux fichiers JSON.
 */

const [refPath, targetPath] = process.argv.slice(2);
if (!refPath || !targetPath) {
  console.error('Usage: node scripts/compare-backends.mjs <reference.json> <cible.json>');
  process.exit(2);
}

const fs = await import('node:fs');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const ref = read(refPath);
const tgt = read(targetPath);

const byName = (arr) => new Map((arr ?? []).map((r) => [r.name, r]));

let problems = 0;
const section = (label, key) => {
  const a = byName(ref[key]);
  const b = byName(tgt[key]);
  const lines = [];
  for (const [name, r] of a) {
    const t = b.get(name);
    if (!t) {
      lines.push(`  MANQUANT   ${name} (présent dans la référence)`);
      problems++;
    } else if (r.ok && !t.ok) {
      lines.push(`  CASSÉ      ${name} — ${t.detail ?? 'échec'}`);
      problems++;
    }
  }
  for (const [name, t] of b) {
    if (!a.has(name)) lines.push(`  EN PLUS    ${name} (absent de la référence)`);
  }
  console.log(`\n--- ${label} ---`);
  console.log(lines.length ? lines.join('\n') : '  Identique à la référence.');
};

section('Tables', 'tables');
section('Fonctions RPC', 'rpcs');
section('Buckets de stockage', 'buckets');

console.log('\n--- Auth / lecture anonyme ---');
for (const key of ['auth', 'anon']) {
  const r = ref[key];
  const t = tgt[key];
  const status = t?.ok ? 'OK' : `ÉCHEC — ${t?.detail ?? 'inconnu'}`;
  if (r?.ok && !t?.ok) problems++;
  console.log(`  ${key.padEnd(6)} ${status}`);
}

console.log(`\n=== ${problems} régression(s) par rapport à la référence ===`);
process.exit(problems ? 1 : 0);
