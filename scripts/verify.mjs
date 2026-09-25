import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const javascriptFiles = ['server.js', 'app.js', 'pages.js'];
const htmlFiles = ['index.html', 'opportunities.html', 'job-details.html', 'applications.html', 'apply-confirmation.html', 'profile.html', 'network.html', 'messages.html', 'about.html', 'login.html'];
const sourceFiles = [...javascriptFiles, ...htmlFiles];

for (const file of javascriptFiles) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
  inlineScripts.forEach((script, index) => {
    try { new Function(script); }
    catch (error) { throw new Error(`${file} inline script ${index + 1}: ${error.message}`); }
  });
}

const forbidden = [
  /const\s+JOBS\s*=/, /const\s+PEOPLE\s*=/, /const\s+THREADS\s*=/,
  /getAppliedList\(/, /getSavedIds\(/, /nexus_applied/, /nexus_saved/,
  />128</, />34</, /82% complete/, /demo only/i
];
const combined = sourceFiles.map(file => readFileSync(file, 'utf8')).join('\n');
for (const pattern of forbidden) {
  if (pattern.test(combined)) throw new Error(`Static-data audit failed: ${pattern}`);
}

console.log(`Verified ${javascriptFiles.length} JavaScript files and ${htmlFiles.length} HTML pages.`);
console.log('Static-data audit passed.');
