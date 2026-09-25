import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const rootFiles = await readdir(root);
const assets = [
  ...rootFiles.filter(file => file.endsWith('.html')),
  'app.js',
  'pages.js',
  'config.js',
  'styles.css'
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(assets.map(file => cp(path.join(root, file), path.join(output, file))));

console.log(`Prepared ${assets.length} frontend files in dist.`);
