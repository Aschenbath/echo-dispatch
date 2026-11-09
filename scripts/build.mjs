import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const files = ['index.html', 'style.css', 'icon.svg', 'src/app.js', 'src/engine.js', 'src/levels.js', 'src/progress.js'];
await mkdir(resolve(root, 'dist/src'), { recursive: true });
for (const file of files) await copyFile(resolve(root, file), resolve(root, 'dist', file));
console.log(`Built ${files.length} static files in dist/ (no runtime dependencies).`);
