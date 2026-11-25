// The site build: bundles and minifies the script, minifies the stylesheet and the pages, copies the rest into dist/.
import { build, transform } from 'esbuild';
import { minify } from 'html-minifier-terser';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const skip = new Set(['node_modules', 'dist', 'src', 'test', 'scripts', '.git', '.github', 'package.json', 'package-lock.json', 'tsconfig.json', 'eslint.config.js', 'stylelint.config.js', '.htmlvalidate.json', '.gitignore', 'README.md', 'keymap.js', 'menu.js', 'style.css', 'shellhelp.js']);
/** @type {string[]} */
const sizes = [];

/** @param {string} name @param {number} before @param {number} after */
const note = (name, before, after) => sizes.push(`${name.padEnd(16)} ${String(before).padStart(8)} -> ${String(after).padStart(8)} bytes`);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const entry of await readdir(root)) {
  if (skip.has(entry) || entry.startsWith('.')) continue;
  const from = join(root, entry);
  if (entry.endsWith('.html')) {
    const html = await readFile(from, 'utf8');
    const out = await minify(html, { collapseWhitespace: true, conservativeCollapse: true, removeComments: true, minifyCSS: true, minifyJS: true });
    await writeFile(join(dist, entry), out);
    note(entry, html.length, out.length);
  } else {
    await cp(from, join(dist, entry), { recursive: true });
  }
}

const css = await readFile(join(root, 'style.css'), 'utf8');
const minCss = (await transform(css, { loader: 'css', minify: true })).code;
await writeFile(join(dist, 'style.css'), minCss);
note('style.css', css.length, minCss.length);

for (const file of ['menu.js', 'keymap.js', 'shellhelp.js']) {
  const code = await readFile(join(root, file), 'utf8');
  const out = (await transform(code, { minify: true, target: 'es2022' })).code;
  await writeFile(join(dist, file), out);
  note(file, code.length, out.length);
}

// The demo: the sources of src/ as one file, named mock.js as the pages expect.
await build({ entryPoints: [join(root, 'src/entry.js')], bundle: true, minify: true, format: 'iife', target: 'es2022', outfile: join(dist, 'mock.js') });
note('mock.js (bundle)', (await stat(join(root, 'src/mock.js'))).size, (await stat(join(dist, 'mock.js'))).size);
process.stdout.write(`${sizes.join('\n')}\n`);
