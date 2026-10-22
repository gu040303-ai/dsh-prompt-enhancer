import { build } from 'esbuild'
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
const require = createRequire(import.meta.url)
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)))
// Only remove this package's generated directory after checking its absolute
// location, so stale declarations never enter a release.
const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const outputRoot = resolve(packageRoot, 'lib')
if (resolve(process.cwd()) !== resolve(packageRoot) || resolve('lib') !== outputRoot) {
  throw new Error('Run the build from the plugin package directory')
}
await rm(outputRoot, { recursive: true, force: true })
await mkdir('lib', { recursive: true })
await build({ entryPoints: ['src/index.ts', 'src/remote.ts'], bundle: true, platform: 'node',
  format: 'esm', target: 'node22', outdir: 'lib', packages: 'external', sourcemap: true })
// Exact rc.2 closure-factory contract, with React and native primitives shared
// from Harness's module table. No second React runtime is bundled.
await build({ entryPoints: ['src/client.ts'], bundle: true, platform: 'browser', format: 'cjs',
  target: 'es2022', outfile: 'lib/client.js', sourcemap: true, jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives', 'zod'],
  banner: { js: `window.__ModuleLoader__.load({id:${JSON.stringify(pkg.name)},factory:(require)=>{var module={exports:{}};var exports=module.exports;` },
  footer: { js: 'return module.exports;}});' },
  define: { 'process.env.NODE_ENV': '"production"' },
})
// Public declarations refer to their sibling .ts paths in source; .js paths
// are used in the shipped declaration tree, matching its actual layout.
for (const project of ['tsconfig.host.json', 'tsconfig.client.json']) {
  execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', project, '--noEmit', 'false',
    '--allowImportingTsExtensions', 'false', '--rewriteRelativeImportExtensions', 'true',
    '--declaration', '--emitDeclarationOnly', '--outDir', 'lib/types'], { stdio: 'inherit' })
}
async function fixDeclarationImports(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) await fixDeclarationImports(file)
    else if (entry.name.endsWith('.d.ts')) {
      const text = await readFile(file, 'utf8')
      await writeFile(file, text.replace(/((?:from\s+|import\s*\()\s*['"])(\.{1,2}\/[^'"]+)\.tsx?(['"])/g, '$1$2.js$3'))
    }
  }
}
await fixDeclarationImports(join(outputRoot, 'types'))
console.log(`Built ${pkg.name} for Harness ${pkg.engines.dsh}`)
