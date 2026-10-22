import { build } from 'esbuild'
import { chromium } from '@playwright/test'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const harness = resolve(process.env.HARNESS_SOURCE ?? '../../work/harness-rc2')
const out = resolve(process.env.DSH_ENHANCER_WORK ?? '.browser-smoke')
await mkdir(out, { recursive: true })
const native = join(harness, 'packages/client/ui-primitives/src')
const aliases = {
  '@harness-input-shell': join(harness, 'packages/client/ui-conversation/src/client/input/facade.ts'),
  '@harness-input-css': join(harness, 'packages/client/ui-conversation/src/client/skeleton/InputBar.module.css'),
  '@harness-theme-base': join(harness, 'packages/client/ui-theme/src/styles/base.css'),
  '@harness-theme-tokens': join(harness, 'packages/client/ui-theme/src/styles/design-platform.css'),
}
await access(aliases['@harness-input-shell'])
const nativeProxy = join(out, 'primitives.ts')
await writeFile(nativeProxy, ['Button', 'Toast', 'Tooltip', 'ReferenceIcon', 'Menu'].map(name =>
  `export * from ${JSON.stringify(join(native, `${name}.tsx`).replaceAll('\\', '/'))}`).join('\n'))
aliases['@deepseek-ai/dsh-client-ui-primitives'] = nativeProxy
await build({ entryPoints: ['tests/browser-fixture.tsx'], outfile: join(out, 'fixture.js'), bundle: true,
  platform: 'browser', format: 'iife', target: 'es2022', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'rc2-reference-and-shared-packages', setup(build) {
    build.onResolve({ filter: /^[^./]|^@/ }, args => {
      if (/^(data:|https?:)/.test(args.path)) return { path: args.path, external: true }
      if (args.path in aliases) return { path: aliases[args.path] }
      if (args.path.startsWith('node:')) return
      return { path: require.resolve(args.path) }
    })
  } }] })
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>
body{margin:0;min-height:100vh;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family)}
.fixture-heading{padding:50px 24px 35px;text-align:center;font-size:13px;line-height:2;color:var(--dsw-alias-label-secondary)}
.fixture-heading strong{font-size:25px;color:var(--dsw-alias-label-primary)}
body{--dsh-composer-side-clearance:16px;--dsh-composer-card-max-width:760px;--dsh-composer-text-max-height:336px;--dsw-elevation-soft:0 0 0 1px var(--dsw-alias-border-l2),0 6px 24px #00000008}
[data-editor]{outline:none;min-height:76px;padding:8px 16px;font-size:14px;line-height:24px;white-space:pre-wrap}
.fixture-layout{display:flex;align-items:flex-start;max-width:1200px;margin:auto}.fixture-layout>main{flex:1;min-width:0}
.fixture-panel{width:350px;max-width:100%;height:530px;flex:none;border-left:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);box-sizing:border-box}
.fixture-panel>.dsh-pe-panel{height:490px}
@media(max-width:899px){.fixture-panel{position:fixed;inset:0;width:100%;height:100dvh;z-index:10}.fixture-panel>.dsh-pe-panel{height:calc(100dvh - 36px)}}
</style><div id="app"></div><script src="/fixture.js"></script></html>`
const server = createServer(async (request, response) => {
  const paths = { '/fixture.js': join(out, 'fixture.js'), '/fixture.css': join(out, 'fixture.css'), '/plugin.js': resolve('lib/client.js') }
  try {
    const url = request.url.split('?')[0]
    response.setHeader('Content-Type', url.endsWith('.js') ? 'text/javascript; charset=utf-8' : url.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8')
    response.end(url in paths ? await readFile(paths[url]) : html)
  } catch (error) { response.statusCode = 500; response.end(String(error)) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
const results = []
try {
  browser = await chromium.launch({
    ...(process.env.DSH_TEST_BROWSER_PATH ? { executablePath: process.env.DSH_TEST_BROWSER_PATH }
      : { channel: process.env.DSH_TEST_BROWSER ?? 'chrome' }), headless: true,
  })
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.waitForFunction(() => window.fixture?.ready)
  const button = page.getByRole('button', { name: '增强提示词', exact: true })
  await button.waitFor()
  for (const dark of [false, true]) {
    await page.evaluate(dark => document.body.toggleAttribute('data-ds-dark-theme', dark), dark)
    for (const width of [320, 375, 768, 1200]) {
      await page.setViewportSize({ width, height: 700 })
      const rects = await page.evaluate(() => {
        const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom } }
        return { button: rect('.dsh-pe-button'), send: rect('[aria-label="发送"]'), model: rect('[aria-label="模型"]'),
          voice: rect('[aria-label="语音"]'), card: rect('[data-composer-card]'), scrollWidth: document.documentElement.scrollWidth }
      })
      for (const key of ['button', 'model', 'voice', 'send']) {
        assert.ok(rects[key].right <= width, `${key} overflow at ${width}px`)
        assert.ok(rects[key].x >= 0)
      }
      assert.ok(rects.button.right <= rects.model.x)
      assert.ok(rects.model.right <= rects.voice.x)
      assert.ok(rects.voice.right <= rects.send.x)
      assert.ok(rects.scrollWidth <= width, `horizontal overflow at ${width}px`)
      results.push(`No overlap: ${dark ? 'dark' : 'light'}, ${width}px`)
      if (width === 320) await page.screenshot({ path: join(out, `preview-${dark ? 'dark' : 'light'}-320.png`) })
    }
    await page.screenshot({ path: join(out, `preview-${dark ? 'dark' : 'light'}.png`) })
  }
  const menu = async name => {
    await page.getByRole('button', { name: '优化选项', exact: true }).click()
    await page.getByRole('menuitem', { name, exact: true }).click()
  }
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))
  const editor = page.locator('[data-editor]')
  const original = await page.evaluate(() => window.fixture.text())
  await button.click()
  await page.waitForFunction(original => window.fixture.text() !== original, original)
  assert.equal(await page.locator('.fixture-panel').count(), 0)
  assert.equal(await page.evaluate(() => window.fixture.calls()), 1)
  await page.getByRole('button', { name: '撤销', exact: true }).waitFor()
  results.push('One click applies one complete plain-text result without opening a sidebar')
  await editor.press('Control+z')
  await page.waitForFunction(original => window.fixture.text() === original, original)
  results.push('One-click application is one native Lexical undo transaction')
  await menu('查看本地检查')
  await page.locator('.dsh-pe-check-list').waitFor()
  assert.equal(await page.evaluate(() => window.fixture.calls()), 1)
  assert.equal(await page.locator('.dsh-pe-checks').getAttribute('open'), '')
  results.push('Explicit local checks reveal all five categories without a model call')
  await page.getByRole('button', { name: '关闭侧栏', exact: true }).click()
  await menu('先预览再应用')
  await page.getByRole('button', { name: '应用改动', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.fixture.text()), original)
  assert.equal(await page.getByRole('checkbox').count(), 0)
  await page.getByRole('tab', { name: '逐句对比', exact: true }).click()
  await page.getByRole('checkbox').first().uncheck()
  assert.equal(await page.evaluate(() => window.fixture.text()), original)
  await page.getByRole('checkbox').first().check()
  results.push('Advanced action generates a clean preview immediately; sentence choices never write early')
  for (const dark of [false, true]) {
    await page.evaluate(dark => document.body.toggleAttribute('data-ds-dark-theme', dark), dark)
    await page.setViewportSize({ width: 320, height: 700 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    const footer = await page.locator('.dsh-pe-footer').boundingBox()
    assert.ok(footer.y >= 0 && footer.y + footer.height <= 700)
    await page.screenshot({ path: join(out, `result-${dark ? 'dark' : 'light'}-320.png`) })
    results.push(`Review footer and sentence choices fit ${dark ? 'dark' : 'light'} 320px viewport`)
  }
  await page.getByRole('button', { name: '应用改动', exact: true }).click()
  await page.getByRole('button', { name: '关闭侧栏', exact: true }).click()
  await editor.press('Control+z')
  await page.waitForFunction(original => window.fixture.text() === original, original)
  await menu('按检查结果优化')
  await page.waitForFunction(original => window.fixture.text() !== original, original)
  assert.ok(await page.evaluate(() => window.fixture.request().lint.checks.length === 5))
  results.push('Conditional optimization includes local findings and completes without an extra Apply')
  await editor.press('Control+z')
  await page.waitForFunction(original => window.fixture.text() === original, original)
  await page.evaluate(() => window.fixture.mode('format'))
  await button.click()
  await page.waitForFunction(() => window.fixture.text().startsWith('项目计划'))
  const plain = await page.evaluate(() => window.fixture.text())
  assert.ok(!plain.includes('**') && !plain.includes('# ') && !plain.includes('- '))
  results.push('Markdown headings, bold and bullet markers are removed before editor write-back')
  await editor.press('Control+z')
  await page.waitForFunction(original => window.fixture.text() === original, original)
  await page.evaluate(() => window.fixture.mode('loss'))
  await button.click()
  await page.getByRole('button', { name: '补回细节', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.fixture.text()), original)
  await page.getByRole('button', { name: '补回细节', exact: true }).click()
  await page.getByRole('button', { name: '应用改动', exact: true }).click()
  await page.getByRole('button', { name: '关闭侧栏', exact: true }).click()
  assert.ok((await page.evaluate(() => window.fixture.text())).includes('200'))
  results.push('Detected fact loss falls back to review; restoring details also stays plain text')
  await editor.press('Control+z')
  await page.waitForFunction(original => window.fixture.text() === original, original)
  await page.evaluate(() => window.fixture.mode('hold'))
  await button.click()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.evaluate(() => window.fixture.mode('failure'))
  await button.click()
  await page.getByText('模型鉴权失败，原始输入已保留，请检查 Harness 的模型设置。').first().waitFor()
  assert.equal(await page.evaluate(() => window.fixture.text()), original)
  results.push('Cancellation releases a stuck request; failure feedback keeps the original input')
  await page.evaluate(() => window.fixture.mode('catalog-hold'))
  await button.click()
  await page.getByText('优化超时，原始输入已保留，请稍后重试。').first().waitFor()
  assert.equal(await page.evaluate(() => window.fixture.text()), original)
  results.push('Catalog timeout preserves input and restores the launcher')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => window.fixture.mode('success'))
  await button.click()
  await page.waitForFunction(original => window.fixture.text() !== original, original)
  assert.equal(await page.locator('.dsh-pe-feedback').evaluate(element => getComputedStyle(element).animationName), 'none')
  results.push('Reduced-motion preference disables feedback and text-flash animation')
  assert.equal(await page.evaluate(() => window.fixture.sends()), 0)
  assert.deepEqual(errors, [])
  await page.evaluate(() => window.fixture.dispose())
  assert.equal(await page.locator('style[data-plugin="dsh-prompt-enhancer"]').count(), 0)
  results.push('Disposal removes UI and styles; no accidental send or browser errors')
  await writeFile(join(out, 'results.json'), JSON.stringify({ harness: '0.2.1-rc.2', tests: results }, null, 2))
  console.log(results.join('\n'))
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}

