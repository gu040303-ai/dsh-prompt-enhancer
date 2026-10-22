/* Visual harness for the dsh-prompt-enhancer motion layer.

   Extracts the plugin CSS from the built bundle (lib/client.js), drops it on a
   mock composer + sidebar panel, then pauses every CSS animation and seeks to
   exact times so each state can be inspected as a still.

   Why seek instead of waiting: CDP screenshots do not line up with compositor
   frames, so a 40ms drift already misses the breathing peak and the 28ms
   cascade. Pausing document.getAnimations() and setting currentTime gives
   deterministic frames.

   Usage: node scripts/motion-preview/preview.cjs  (build first)
   Env:   CHROME_PATH=<chrome.exe>  PLAYWRIGHT_PATH=<dir containing playwright>
*/
const fs = require('fs')
const path = require('path')

const REPO = path.resolve(__dirname, '..', '..')
const OUT = path.join(__dirname, 'shots')
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_PATH, 'playwright', path.join(REPO, 'node_modules', 'playwright')].filter(Boolean)
  for (const candidate of candidates) {
    try { return require(candidate) } catch { /* try next */ }
  }
  console.error('playwright not found. Install it or set PLAYWRIGHT_PATH to a directory that contains it.')
  process.exit(1)
}

const { chromium } = loadPlaywright()
fs.mkdirSync(OUT, { recursive: true })

const bundle = fs.readFileSync(path.join(REPO, 'lib', 'client.js'), 'utf8')
const cssMatch = bundle.match(/var CSS = `([\s\S]*?)`;\n/)
if (!cssMatch) {
  console.error('could not find the CSS template in lib/client.js; build the package first')
  process.exit(1)
}
const css = cssMatch[1]

const WAND = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.65"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 20 12-12-3-3L1 17l3 3Zm6-12 3 3M18 2v4m-2-2h4M21 11v4m-2-2h4"/></svg>`
const CHEVRON = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m3 4.5 3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`

const RESULT = `请在 200 元预算内制定项目计划。逐步列出执行步骤、预期交付物和验收标准；对于原文未明确的项目背景，请先提出必要的澄清问题，并在每一步注明负责人与时间节点。`

/* Theme tokens mirror the values pulled out of the host asar (light + dark). */
const html = (dark) => `<!doctype html><html lang="zh-CN"${dark ? ' data-theme="dark"' : ''}><head><meta charset="utf-8">
<style>
:root{--dsw-alias-label-primary:#1a1d21;--dsw-alias-label-secondary:#61666b;--dsw-alias-bg-layer-1:#fff;
--dsw-alias-interactive-bg-hover:rgba(38,49,72,.06);--dsw-alias-border-l1:#0000000a;
--dsw-alias-state-business-primary:#4176e6;--dsw-alias-state-success-primary:#1a9c5b;
--dsw-alias-state-error-primary:#d84a4a;--dsw-alias-state-warn-primary:#c98a00;--dsw-radius-sm:8px;--dsw-radius-md:12px}
[data-theme=dark]{--dsw-alias-label-primary:#e7e9ec;--dsw-alias-label-secondary:#cfd3d6;--dsw-alias-bg-layer-1:#1b1e23;
--dsw-alias-interactive-bg-hover:rgba(255,255,255,.07);--dsw-alias-border-l1:#ffffff0f;
--dsw-alias-state-business-primary:#7aaaff}
*{box-sizing:border-box}
body{margin:0;padding:32px;font:14px/1.65 "Segoe UI","Microsoft YaHei",system-ui,sans-serif;color:var(--dsw-alias-label-primary);background:${dark ? '#12151a' : '#f4f6f9'};display:flex;gap:28px;align-items:flex-start}
.col{flex:1;min-width:0;max-width:640px;display:flex;flex-direction:column;gap:20px}
.card{border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-alias-bg-layer-1);
  box-shadow:0 1px 2px rgba(0,0,0,.04),0 8px 28px rgba(15,23,42,.06)}
.composer{padding:14px 14px 10px}
.draft{min-height:64px;font:inherit;color:var(--dsw-alias-label-primary);white-space:pre-wrap;outline:none}
.flash-card{padding:14px;border-radius:12px;min-height:96px}
.flash-card .draft{min-height:0}
.bar{display:flex;align-items:center;justify-content:flex-end;gap:2px;padding-top:8px}
.button{display:inline-flex;align-items:center;justify-content:center;border:none;background:transparent;border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0 10px;height:28px;font:inherit;font-size:12px}
.button.ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.button:disabled{cursor:not-allowed;opacity:.4}
.sidebar{width:392px;flex:none;height:560px;border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-alias-bg-layer-1);
  box-shadow:0 1px 2px rgba(0,0,0,.04),0 8px 28px rgba(15,23,42,.06);overflow:hidden;display:flex;flex-direction:column}
.sidebar-head{flex:none;display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:13px;font-weight:500}
.sidebar-head span{color:var(--dsw-alias-label-secondary);font-weight:400;font-size:12px;margin-left:auto}
</style>
<style>${css}</style></head><body>
<div class="col">
  <div class="card composer">
    <div class="draft">帮我写一份项目计划，预算 200 元。</div>
    <div class="bar">
      <span class="dsh-pe-control dsh-pe-launcher">
        <button type="button" class="button ghost sm dsh-pe-button" aria-label="增强提示词" aria-busy="false">${WAND}</button>
        <button type="button" class="button ghost sm dsh-pe-menu-button" aria-label="更多选项">${CHEVRON}</button>
      </span>
    </div>
  </div>
  <div class="card flash-card"><div class="draft" id="flash">请在 200 元预算内制定项目计划。逐步列出执行步骤、预期交付物和验收标准。</div></div>
</div>
<div class="sidebar">
  <div class="sidebar-head">增强提示词<span>已优化 · 1.2s</span></div>
  <div class="dsh-pe-panel">
    <div class="dsh-pe-panel-scroll">
      <div class="dsh-pe-result">
        <div class="dsh-pe-result-heading">
          <div role="tablist" class="dsh-pe-tabs">
            <button role="tab" aria-selected="true">结果</button>
            <button role="tab" aria-selected="false">逐句</button>
          </div>
          <span class="dsh-pe-state">已写回</span>
        </div>
        <div role="tabpanel" id="result-pane">
          <div class="dsh-pe-text" id="result-text">${RESULT}</div>
          <div class="dsh-pe-diff" id="result-diff" style="display:none">
            <div class="dsh-pe-choice"><div class="dsh-pe-choice-text">
              <div class="dsh-pe-before"><span class="dsh-pe-change-sign">−</span><del>帮我写一份项目计划，预算 200 元。</del></div>
              <div class="dsh-pe-after"><span class="dsh-pe-change-sign">+</span><ins>请在 200 元预算内制定项目计划。</ins></div>
            </div></div>
            <div class="dsh-pe-choice"><div class="dsh-pe-choice-text">
              <div class="dsh-pe-before"><span class="dsh-pe-change-sign">−</span><del>尽快完成。</del></div>
              <div class="dsh-pe-after"><span class="dsh-pe-change-sign">+</span><ins>逐步列出执行步骤、预期交付物和验收标准。</ins></div>
            </div></div>
            <div class="dsh-pe-choice"><div class="dsh-pe-choice-text">
              <div class="dsh-pe-before"><span class="dsh-pe-change-sign">−</span><del>写清楚。</del></div>
              <div class="dsh-pe-after"><span class="dsh-pe-change-sign">+</span><ins>注明负责人与时间节点。</ins></div>
            </div></div>
          </div>
        </div>
        <details class="dsh-pe-details"><summary>详情</summary><p>耗时 1.2s</p><p>事实保留 3/3</p></details>
      </div>
    </div>
    <footer class="dsh-pe-footer">
      <button type="button" class="button ghost sm">恢复原文</button>
      <button type="button" class="dsh-pe-text-action">重试</button>
    </footer>
  </div>
</div>
</body></html>`

const shots = []
async function main() {
  const browser = await chromium.launch({ executablePath: CHROME })
  const page = await browser.newPage({ viewport: { width: 1160, height: 680 }, deviceScaleFactor: 2 })
  const out = name => path.join(OUT, name)
  const file = name => 'file:///' + out(name).replace(/\\/g, '/')
  const seek = ms => page.evaluate(t => {
    for (const a of document.getAnimations()) { a.pause(); a.currentTime = t }
  }, ms)

  await page.goto(file('preview.html'))
  const composer = page.locator('.composer')
  await composer.screenshot({ path: out('light-idle.png') })

  // hover: seek the bloom at dim / peak / dim phases
  await page.locator('.dsh-pe-button').hover()
  for (const [name, ms] of [['hover-a', 40], ['hover-b', 1200], ['hover-c', 2400]]) {
    await seek(ms)
    await page.waitForTimeout(60)
    await composer.screenshot({ path: out(`light-${name}.png`) })
  }
  const hoverStyle = await page.evaluate(() => {
    const el = document.querySelector('.dsh-pe-button'), s = getComputedStyle(el)
    return { color: s.color, background: s.backgroundColor, shadow: s.boxShadow, animation: s.animationName,
      icon: getComputedStyle(el.querySelector('svg')).transform,
      iconFilter: getComputedStyle(el.querySelector('svg')).filter }
  })
  shots.push(['hover-style', hoverStyle])

  // result text reveal frames (diff pane hidden so it cannot cover the text)
  await page.evaluate(() => {
    document.getElementById('result-diff').style.display = 'none'
    const old = document.getElementById('result-text')
    old.replaceWith(old.cloneNode(true))
  })
  for (const ms of [0, 90, 180, 300, 520]) {
    await seek(ms)
    await page.waitForTimeout(50)
    await page.locator('.sidebar').screenshot({ path: out(`reveal-${String(ms).padStart(3, '0')}ms.png`) })
  }

  // diff stagger frames
  await page.evaluate(() => {
    document.getElementById('result-text').style.display = 'none'
    const diff = document.getElementById('result-diff')
    diff.style.display = ''
    diff.replaceWith(diff.cloneNode(true))
  })
  for (const ms of [0, 120, 260, 400]) {
    await seek(ms)
    await page.waitForTimeout(50)
    await page.locator('.sidebar').screenshot({ path: out(`diff-${String(ms).padStart(3, '0')}ms.png`) })
  }

  // composer write-back flash frames
  await page.evaluate(() => { document.getElementById('flash').classList.add('dsh-pe-flash') })
  for (const ms of [0, 120, 260, 460, 700]) {
    await seek(ms)
    await page.waitForTimeout(50)
    await page.locator('.flash-card').screenshot({ path: out(`flash-${String(ms).padStart(3, '0')}ms.png`) })
  }

  // dark theme
  await page.goto(file('preview-dark.html'))
  await page.locator('.dsh-pe-button').hover()
  await seek(650)
  await page.waitForTimeout(80)
  await page.locator('.composer').screenshot({ path: out('dark-hover.png') })
  await page.locator('.sidebar').screenshot({ path: out('dark-panel.png') })

  // reduced motion: motion off, static bloom kept
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(file('preview.html'))
  await page.locator('.dsh-pe-button').hover()
  await page.waitForTimeout(120)
  const reduced = await page.evaluate(() => {
    const pick = sel => getComputedStyle(document.querySelector(sel))
    return { text: pick('.dsh-pe-text').animationName, button: pick('.dsh-pe-button').animationName,
      iconTransition: pick('.dsh-pe-button svg').transitionDuration, shadow: pick('.dsh-pe-button').boxShadow }
  })
  shots.push(['reduced-motion', reduced])
  await page.locator('.composer').screenshot({ path: out('reduced-hover.png') })

  // real-size (1x) look, plus a 4x close-up of the wand hover
  const small = await browser.newPage({ viewport: { width: 1160, height: 680 }, deviceScaleFactor: 1 })
  await small.goto(file('preview.html'))
  await small.locator('.composer').screenshot({ path: out('x1-composer.png') })
  await small.locator('.dsh-pe-button').hover()
  await small.evaluate(() => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = 1200 } })
  await small.waitForTimeout(60)
  await small.locator('.composer').screenshot({ path: out('x1-hover.png') })
  await small.locator('.sidebar').screenshot({ path: out('x1-panel.png') })

  const zoom = await browser.newPage({ viewport: { width: 700, height: 300 }, deviceScaleFactor: 4 })
  await zoom.goto(file('preview.html'))
  await zoom.locator('.dsh-pe-button').hover()
  await zoom.evaluate(() => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = 1200 } })
  await zoom.waitForTimeout(60)
  const box = await zoom.locator('.dsh-pe-button').boundingBox()
  await zoom.screenshot({ path: out('x4-hover.png'),
    clip: { x: box.x - 26, y: box.y - 26, width: box.width + 52, height: box.height + 52 } })
  await zoom.goto(file('preview-dark.html'))
  await zoom.locator('.dsh-pe-button').hover()
  await zoom.evaluate(() => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = 1200 } })
  await zoom.waitForTimeout(60)
  const box2 = await zoom.locator('.dsh-pe-button').boundingBox()
  await zoom.screenshot({ path: out('x4-hover-dark.png'),
    clip: { x: box2.x - 26, y: box2.y - 26, width: box2.width + 52, height: box2.height + 52 } })

  await browser.close()
  console.log(JSON.stringify(shots, null, 2))
}
fs.writeFileSync(path.join(OUT, 'preview.html'), html(false))
fs.writeFileSync(path.join(OUT, 'preview-dark.html'), html(true))
main().catch(error => { console.error(error); process.exit(1) })
