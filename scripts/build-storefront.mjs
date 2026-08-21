import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';
import postcss from 'postcss';
import prefixSelector from 'postcss-prefix-selector';
import sharp from 'sharp';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDirectory = resolve(projectRoot, 'extensions/eric-storefront/assets');
const cssPath = resolve(assetsDirectory, 'eric-storefront.css');
const sourceCssPath = resolve(projectRoot, 'src/styles.css');
const rootSelector = '.eric-shopify-root';
const storefrontMediaPattern = /\.(?:mp4|webp)$/;
const generatedStorefrontMediaPattern = /^eric-.*\.(?:jpe?g|mp4|png|webp)$/;
// Shopify rejects standalone WOFF2 theme-extension assets. Embed the same Latin
// variable-font subsets loaded by the local Vite entry so both surfaces render identically.
const storefrontFontFaces = [
  {
    family: 'Archivo Variable',
    weight: '100 900',
    filename: 'node_modules/@fontsource-variable/archivo/files/archivo-latin-ext-wght-normal.woff2',
    unicodeRange:
      'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  },
  {
    family: 'Archivo Variable',
    weight: '100 900',
    filename: 'node_modules/@fontsource-variable/archivo/files/archivo-latin-wght-normal.woff2',
    unicodeRange:
      'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  },
  {
    family: 'Manrope Variable',
    weight: '200 800',
    filename: 'node_modules/@fontsource-variable/manrope/files/manrope-latin-ext-wght-normal.woff2',
    unicodeRange:
      'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  },
  {
    family: 'Manrope Variable',
    weight: '200 800',
    filename: 'node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2',
    unicodeRange:
      'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  },
];
const allowedThemeAssetExtensions = new Set([
  '.css',
  '.jpg',
  '.jpeg',
  '.js',
  '.json',
  '.png',
  '.svg',
  '.wasm',
]);

await Promise.all(
  (await readdir(assetsDirectory))
    .filter((filename) => generatedStorefrontMediaPattern.test(filename))
    .map((filename) => unlink(resolve(assetsDirectory, filename))),
);

const storefrontMediaPlugin = {
  name: 'storefront-media',
  setup(buildContext) {
    buildContext.onResolve({ filter: storefrontMediaPattern }, (args) => ({
      path: resolve(args.resolveDir, args.path),
      namespace: 'storefront-media',
    }));
    buildContext.onLoad({ filter: /.*/, namespace: 'storefront-media' }, async (args) => {
      if (extname(args.path).toLowerCase() === '.mp4') {
        const video = await readFile(args.path);
        return {
          contents: `export default ${JSON.stringify(`data:video/mp4;base64,${video.toString('base64')}`)};`,
          loader: 'js',
        };
      }

      const outputName = `eric-${basename(args.path, extname(args.path))}.jpg`;
      await sharp(args.path)
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 88, mozjpeg: true })
        .toFile(resolve(assetsDirectory, outputName));
      return {
        contents: `const script = document.currentScript; const base = script instanceof HTMLScriptElement ? script.src : document.baseURI; export default new URL(${JSON.stringify(outputName)}, base).href;`,
        loader: 'js',
      };
    });
  },
};

await build({
  absWorkingDir: projectRoot,
  entryPoints: ['src/storefront-entry.tsx'],
  outfile: resolve(assetsDirectory, 'eric-storefront.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  minify: true,
  legalComments: 'none',
  plugins: [storefrontMediaPlugin],
  loader: {
    '.svg': 'dataurl',
  },
  define: {
    'import.meta.env': JSON.stringify({ VITE_API_MODE: 'storefront' }),
  },
});

const storefrontFontCss = (
  await Promise.all(
    storefrontFontFaces.map(async ({ family, weight, filename, unicodeRange }) => {
      const font = await readFile(resolve(projectRoot, filename));
      return `@font-face{font-family:${JSON.stringify(family)};font-style:normal;font-display:swap;font-weight:${weight};src:url(data:font/woff2;base64,${font.toString('base64')}) format('woff2-variations');unicode-range:${unicodeRange}}`;
    }),
  )
).join('\n');
const sourceCss = `${storefrontFontCss}\n${await readFile(sourceCssPath, 'utf8')}`;
const result = await postcss([
  prefixSelector({
    prefix: rootSelector,
    transform(prefix, selector, prefixedSelector) {
      if (selector.includes(rootSelector)) return selector;
      if (selector === ':root' || selector === 'html' || selector === 'body') return prefix;
      if (selector.startsWith(':root')) return selector.replace(':root', prefix);
      if (selector.startsWith('html ')) return `${prefix} ${selector.slice(5)}`;
      if (selector.startsWith('body ')) return `${prefix} ${selector.slice(5)}`;
      return prefixedSelector;
    },
  }),
]).process(sourceCss, { from: sourceCssPath, to: cssPath });

const minifiedCss = await transform(result.css, { loader: 'css', minify: true });
await writeFile(cssPath, minifiedCss.code);

const invalidThemeAssets = (await readdir(assetsDirectory)).filter(
  (filename) => !allowedThemeAssetExtensions.has(extname(filename).toLowerCase()),
);
if (invalidThemeAssets.length > 0) {
  throw new Error(`Unsupported Shopify theme assets: ${invalidThemeAssets.join(', ')}`);
}
