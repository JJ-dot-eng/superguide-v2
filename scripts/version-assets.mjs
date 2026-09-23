// Adds content-hash cache keys (?v=…) to every local module and stylesheet
// reference under dist/. Source files use plain relative paths; the deploy
// workflow runs this just before publishing, so a URL changes exactly when its
// file or anything it imports changes, and every importer of one file asks for
// the same URL (a module is never loaded twice).
// Usage: node scripts/version-assets.mjs [--dry-run | --verify]
//   --verify fails unless every reference already carries its current key.
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { posix } from 'node:path';

const dist = new URL('../dist/', import.meta.url);
// Static imports/exports, dynamic import() and HTML src/href attributes.
const SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|(?:src|href)=)(['"])(\.{1,2}\/[\w./-]+\.(?:js|css))(?:\?v=[^'"]*)?\2/g;
const digest = text => createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex').slice(0, 12);

const resolveFrom = (file, specifier) => posix.normalize(posix.join(posix.dirname(file), specifier));

export function localReferences(file, text) {
  return [...text.matchAll(SPECIFIER)].map(match => resolveFrom(file, match[3]));
}

/** sources: Map(relative path → text). Returns { files: Map(path → rewritten), versions: Map(path → hash) }. */
export function versionFiles(sources) {
  const versions = new Map();
  const rewritten = new Map();
  const visiting = new Set();
  const rewrite = (file, text) => text.replace(SPECIFIER, (_, prefix, quote, specifier) => {
    const target = resolveFrom(file, specifier);
    if (!sources.has(target)) throw new Error(`${file}: missing local asset ${specifier}`);
    return `${prefix}${quote}${specifier}?v=${version(target)}${quote}`;
  });
  function version(file) {
    if (versions.has(file)) return versions.get(file);
    if (visiting.has(file)) throw new Error(`Circular import through ${file}`);
    visiting.add(file);
    const text = rewrite(file, sources.get(file));
    visiting.delete(file);
    rewritten.set(file, text);
    versions.set(file, digest(text));
    return versions.get(file);
  }
  for (const file of sources.keys()) if (!file.endsWith('.html')) version(file);
  for (const file of sources.keys()) if (file.endsWith('.html')) rewritten.set(file, rewrite(file, sources.get(file)));
  return { files: rewritten, versions };
}

export async function readSources(directory = dist) {
  const entries = await readdir(directory, { recursive: true });
  const names = entries.map(name => name.replaceAll('\\', '/')).filter(name => /\.(?:js|css|html)$/.test(name) && !name.startsWith('assets/'));
  return new Map(await Promise.all(names.map(async name => [name, await readFile(new URL(name, directory), 'utf8')])));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sources = await readSources();
  const { files, versions } = versionFiles(sources);
  const changed = [...files].filter(([name, text]) => text !== sources.get(name));
  if (process.argv.includes('--verify')) {
    if (changed.length) { console.error(`Stale or missing cache keys in: ${changed.map(([name]) => name).join(', ')}`); process.exit(1); }
    console.log(`Verified ${versions.size} content-hashed assets.`);
    process.exit(0);
  }
  const dry = process.argv.includes('--dry-run');
  if (!dry) for (const [name, text] of changed) await writeFile(new URL(name, dist), text);
  console.log(`${dry ? 'Would version' : 'Versioned'} ${versions.size} assets; ${changed.length} files ${dry ? 'would change' : 'updated'}.`);
}
