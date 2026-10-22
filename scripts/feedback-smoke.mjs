import { build } from 'esbuild'
import { chromium } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createServer } from 'node:http'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const out = resolve('.browser-smoke/feedback')
await mkdir(out, { recursive: true })
// Load only the installed native Button region. The package's monolithic entry
// also imports optional syntax highlighters that are absent in a plugin checkout.
const require = createRequire(import.meta.url)
const primitivesPath = require.resolve('@deepseek-ai/dsh-client-ui-primitives')
const primitives = await readFile(primitivesPath, 'utf8')
const button = primitives.match(/const Button = forwardRef\([\s\S]*?\n\}\);/m)?.[0]
assert.ok(button, 'Installed primitives must expose the native Button')
const buttonFile = join(out, 'native-button.mjs')
const buttonCss = join(primitivesPath, '..', 'Button.module.css').replaceAll('\\', '/')
await writeFile(buttonFile, `import {jsx,jsxs} from 'react/jsx-runtime';import {forwardRef} from 'react';import clsx from 'clsx';import css$3 from ${JSON.stringify(buttonCss)};\n${button}\nexport {Button};`)
await build({ entryPoints: ['tests/feedback-browser-fixture.tsx'], outfile: join(out, 'fixture.js'),
  bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', target: 'es2022',
  loader: { '.css': 'local-css' }, define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'installed-native-button', setup(build) {
    build.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({ path: buttonFile }))
  } }] })
const bundle = await readFile('lib/client.js', 'utf8')
const css = bundle.match(/var CSS = `([\s\S]*?)`;\n/)?.[1]
assert.ok(css, 'Build the plugin before running feedback smoke')
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/fixture.css"><style>
:root{--dsw-alias-label-primary:#1a1d21;--dsw-alias-label-secondary:#61666b;--dsw-alias-bg-layer-1:#fff;
--dsw-alias-interactive-bg-hover:rgba(38,49,72,.06);--dsw-alias-border-l1:#00000014;
--dsw-alias-state-business-primary:#4176e6;--dsw-alias-state-success-primary:#1a9c5b;
--dsw-alias-state-error-primary:#d84a4a;--dsw-alias-state-warn-primary:#ad7900}
[data-theme=dark]{--dsw-alias-label-primary:#e7e9ec;--dsw-alias-label-secondary:#a7aeb8;--dsw-alias-bg-layer-1:#1b1e23;
--dsw-alias-interactive-bg-hover:#ffffff12;--dsw-alias-border-l1:#ffffff1f;--dsw-alias-state-business-primary:#7aaaff;
--dsw-alias-state-error-primary:#ff9292;--dsw-alias-state-warn-primary:#edc26a;background:#12151a}
*{box-sizing:border-box}body{margin:0;padding:24px 16px;background:#f4f6f9;font:14px/1.65 "Segoe UI","Microsoft YaHei",sans-serif;color:var(--dsw-alias-label-primary)}
#app{display:flex;gap:24px;align-items:flex-start}main{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
.composer-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:16px;padding:16px;box-shadow:0 4px 16px #00000005}
[data-composer-input]{outline:none;min-height:64px;white-space:pre-wrap;overflow-wrap:anywhere}
.composer-toolbar{display:flex;align-items:center;justify-content:space-between;margin-top:12px;color:var(--dsw-alias-label-secondary);font-size:12px}
.send{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;width:28px;height:28px;margin-left:12px;background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-bg-layer-1);font-size:18px}
aside{width:320px;height:500px;flex:none;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px}
${css}</style><div id="app"></div><script src="/fixture.js"></script></html>`
await writeFile(join(out, 'preview.html'), html)
const server = createServer(async (req, res) => {
  try {
    const file = req.url === '/fixture.js' ? 'fixture.js' : req.url === '/fixture.css' ? 'fixture.css' : 'preview.html'
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8')
    res.end(await readFile(join(out, file)))
  } catch (error) { res.statusCode = 500; res.end(String(error)) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
  const page = await browser.newPage({ viewport: { width: 672, height: 440 }, deviceScaleFactor: 2 })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.waitForFunction(() => window.fixture)
  let cases = 0
  for (const dark of [false, true]) for (const width of [240, 320, 392, 672]) for (const locale of ['zh', 'en']) {
    await page.setViewportSize({ width, height: 480 })
    await page.evaluate(dark => document.body.toggleAttribute('data-theme', dark), false)
    await page.evaluate(dark => { if (dark) document.body.dataset.theme = 'dark' }, dark)
    for (const state of ['busy', 'busy-preview', 'busy-conditioned', 'success', 'preview', 'review', 'timeout', 'failed', 'changed', 'cancelled', 'unchanged']) {
      await page.evaluate(([state, locale]) => window.fixture.show(state, locale), [state, locale])
      await page.locator('.dsh-pe-feedback').waitFor()
      const geometry = await page.evaluate(() => {
        const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y, bottom: r.bottom } }
        return { label: rect('.dsh-pe-feedback-label'), actions: rect('.dsh-pe-feedback-actions'),
          scroll: document.documentElement.scrollWidth, viewport: innerWidth,
          filter: getComputedStyle(document.querySelector('[data-composer-input]')).filter }
      })
      assert.ok(geometry.scroll <= width, `overflow: ${dark}/${width}/${locale}/${state}`)
      assert.ok(geometry.actions.right <= width - 15)
      assert.ok(geometry.actions.x >= 16)
      assert.ok(geometry.label.right <= geometry.actions.x + 1 || geometry.label.bottom <= geometry.actions.y + 1,
        `overlap: ${dark}/${width}/${locale}/${state}`)
      assert.equal(geometry.filter, 'none', 'Editor text must stay crisp throughout write-back')
      cases++
      if (locale === 'zh' && [320, 672].includes(width) && ['busy', 'success', 'review', 'timeout'].includes(state)) {
        await page.locator('main').screenshot({ path: join(out, `${dark ? 'dark' : 'light'}-${width}-${state}.png`), animations: 'disabled' })
      }
    }
  }
  await page.setViewportSize({ width: 960, height: 600 })
  await page.evaluate(() => { delete document.body.dataset.theme; window.fixture.show('success') })
  await page.getByRole('button', { name: '查看改动', exact: true }).click()
  await page.getByRole('button', { name: '关闭结果提示', exact: true }).click()
  assert.equal(await page.locator('.dsh-pe-feedback').count(), 0)
  assert.match(await page.locator('[role=tabpanel]').innerText(), /200 元/)
  await page.screenshot({ path: join(out, 'light-result.png'), animations: 'disabled' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => window.fixture.show('busy'))
  assert.equal(await page.locator('.dsh-pe-feedback').evaluate(el => getComputedStyle(el).animationName), 'none')
  assert.equal(await page.locator('.dsh-pe-spinner').evaluate(el => getComputedStyle(el).animationName), 'none')
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ cases, errors, resultRetainedAfterDismiss: true, reducedMotion: true, output: out }, null, 2))
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
