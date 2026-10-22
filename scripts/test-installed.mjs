import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
import { captureDesktop, desktopCommand } from './desktop-capture.mjs'

if (!process.env.DSH_TEST_URL && !process.env.DSH_TEST_DESKTOP_PORT) throw new Error('Set an isolated Host URL or isolated Electron CDP port')
const out = resolve(process.env.DSH_ENHANCER_WORK ?? '.browser-smoke')
await mkdir(out, { recursive: true })
const desktop = process.env.DSH_TEST_DESKTOP_PORT, main = desktop && process.env.DSH_TEST_DESKTOP_MAIN_PORT
const home = process.env.DSH_TEST_DESKTOP_HOME
const browser = desktop ? await chromium.connectOverCDP(`http://127.0.0.1:${desktop}`) : await chromium.launch({
  ...(process.env.DSH_TEST_BROWSER_PATH ? { executablePath: process.env.DSH_TEST_BROWSER_PATH } : { channel: 'chrome' }), headless: true })
const page = desktop ? browser.contexts()[0].pages().find(p => p.url().startsWith('dsh-app://app/'))
  : await browser.newPage({ viewport: { width: 1280, height: 800 } })
if (!page) throw new Error('Isolated Electron workspace not found')
const errors = [], consoleErrors = [], checks = []
page.setDefaultTimeout(15000)
page.on('pageerror', error => errors.push(error.message))
page.on('console', item => { if (item.type() === 'error') consoleErrors.push(item.text()) })
const screenshot = name => main ? captureDesktop(main, home, join(out, name)) : page.screenshot({ path: join(out, name), timeout: 10000 })
const button = name => page.getByRole('button', { name, exact: true })
const menu = async name => { await button('优化选项').click(); await page.getByRole('menuitem', { name, exact: true }).click() }
async function viewport(width, height) {
  if (main) await desktopCommand(main, home, `window.setContentSize(${width},${height}); return true;`)
  await page.setViewportSize({ width, height })
}
async function fresh() {
  await page.locator('[data-conversation-session], [data-plugin-panel]').first().waitFor({ state: 'attached' })
  const previous = await page.evaluate(() => document.querySelector('[data-conversation-session]')?.getAttribute('data-conversation-session') ?? null)
  await page.getByRole('button').filter({ hasText: '新会话' }).first().click()
  await page.waitForFunction(previous => {
    const id = document.querySelector('[data-conversation-session]')?.getAttribute('data-conversation-session')
    return id && id !== previous
  }, previous)
  await page.locator('[data-composer-input][data-lexical-editor="true"]').waitFor()
}
try {
  if (main) await desktopCommand(main, home, 'window.webContents.setBackgroundThrottling(false); return true;')
  if (desktop) { await page.reload({ waitUntil: 'domcontentloaded' }); await fresh() }
  else await page.goto(process.env.DSH_TEST_URL, { waitUntil: 'domcontentloaded' })
  const editor = page.locator('[data-composer-input][contenteditable="true"]').first()
  await button('增强提示词').waitFor({ timeout: 25000 })
  if (await button('继续').isVisible()) await button('继续').click()
  await editor.fill('')
  await expect(button('增强提示词')).toBeDisabled()
  checks.push('Cold boot activates the installed plugin; empty input disables enhancement')
  const selectModel = page.getByRole('button').filter({ hasText: '请选择模型' })
  if (await selectModel.isVisible()) {
    await selectModel.click()
    const models = page.getByRole('menuitem').filter({ hasText: '模型' })
    if (await models.isVisible()) await models.click()
    await page.getByRole('menuitemradio').filter({ hasText: '本地验证模型' }).first().click()
  }
  await page.getByRole('button').filter({ hasText: '本地验证模型' }).waitFor()
  await viewport(1280, 800)
  await editor.fill('帮我写一个项目计划，预算 200 元。')
  const original = await editor.innerText()
  await button('增强提示词').click()
  assert.equal(await editor.innerText(), original)
  await page.waitForFunction(() => document.querySelector('[data-composer-input]').textContent.includes('验收标准'))
  assert.equal(await page.locator('.dsh-pe-panel:visible').count(), 0)
  await button('撤销').waitFor()
  const enhanced = await editor.innerText()
  assert.ok(!enhanced.includes('**') && !enhanced.includes('# ') && !enhanced.includes('- '))
  checks.push('One click completes the real Gateway/model call and writes a plain prompt without opening a panel')
  checks.push('Host strips model-generated headings, bold and bullet markup before editor write-back')
  await screenshot('host-quick.png')
  await editor.press('Control+z')
  await expect(editor).toHaveText(original)
  checks.push('Native Ctrl+Z restores the entire original in one undo step')
  await menu('先预览再应用')
  await button('应用改动').waitFor()
  assert.equal(await editor.innerText(), original)
  await expect(page.getByRole('tab', { name: '结果', exact: true })).toHaveAttribute('aria-selected', 'true')
  assert.equal(await page.getByRole('checkbox').count(), 0)
  await expect(page.locator('.dsh-pe-checks')).not.toHaveAttribute('open', '')
  checks.push('The optional preview opens on clean text with local checks collapsed and no editor write')
  await screenshot('host-preview.png')
  await page.getByRole('tab', { name: '逐句对比', exact: true }).click()
  const choices = page.getByRole('checkbox')
  await choices.first().uncheck(); assert.equal(await editor.innerText(), original); await choices.first().check()
  checks.push('Sentence choices update only the preview')
  for (const dark of [false, true]) {
    await page.evaluate(dark => document.body.toggleAttribute('data-ds-dark-theme', dark), dark)
    await viewport(dark ? 375 : 1280, 800)
    await page.waitForFunction(() => {
      const r = document.querySelector('.dsh-pe-panel')?.getBoundingClientRect()
      return r && r.x >= 0 && r.right <= innerWidth + 1
    })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    const footer = await page.locator('.dsh-pe-footer').boundingBox()
    assert.ok(footer.y + footer.height <= 801)
    await screenshot(`host-${dark ? 'dark-375' : 'light-1280'}.png`)
    checks.push(`Native review and fixed actions fit ${dark ? 'dark 375px' : 'light 1280px'}`)
  }
  await viewport(1280, 800)
  await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))
  await button('应用改动').click()
  await expect(editor).toHaveText(enhanced)
  await button('恢复原文').click()
  await expect(editor).toHaveText(original)
  checks.push('Explicit Apply and Restore Original use the native revision-checked editor')
  await menu('按检查结果优化')
  await page.waitForFunction(() => document.querySelector('[data-composer-input]').textContent.includes('验收标准'))
  await button('恢复原文').click()
  await expect(editor).toHaveText(original)
  checks.push('Conditional optimization completes from one menu selection and remains undoable')
  await editor.fill('模拟丢失：项目预算 200 元。')
  const lossOriginal = await editor.innerText()
  await button('增强提示词').click()
  await button('补回细节').waitFor()
  assert.equal(await editor.innerText(), lossOriginal)
  await button('补回细节').click()
  await button('应用改动').click()
  assert.ok((await editor.innerText()).includes('200'))
  assert.ok(!(await editor.innerText()).includes('`'))
  checks.push('Detected detail loss blocks automatic write-back; restoring and applying stays plain text')
  await editor.fill('模拟等待：项目预算 200 元。')
  const cancelled = await editor.innerText()
  await button('增强提示词').click()
  await page.locator('.dsh-pe-feedback').getByRole('button', { name: '取消', exact: true }).click()
  await expect(editor).toHaveText(cancelled)
  await editor.fill('模拟失败：保留数字 123 和 emoji 🐋\n第二行。')
  const failure = await editor.innerText()
  await button('增强提示词').click()
  await page.getByText('优化失败，原始输入已保留。请检查连接和 Harness 的模型设置后重试。').first().waitFor()
  assert.equal(await editor.innerText(), failure)
  checks.push('Cancel releases the active request; a following adapter failure preserves every original character')
  await screenshot('host-failure.png')
  await fresh()
  await editor.fill('新会话发送前，优化预算 200 元的计划。')
  await button('增强提示词').click()
  await page.waitForFunction(() => document.querySelector('[data-composer-input]').textContent.includes('验收标准'))
  checks.push('A new session can use the one-click flow before sending any message')
  assert.deepEqual(errors, [])
  checks.push('No page runtime errors')
  await writeFile(join(out, 'installed-e2e-results.json'), JSON.stringify({ harness: '0.2.1-rc.2', plugin: '0.4.0',
    surface: desktop ? 'actual installed Electron application' : 'official Web app',
    screenshot: main ? 'Electron capturePage, hidden isolated window' : 'Playwright',
    model: 'local deterministic adapter; no external model calls', checks }, null, 2))
  console.log(checks.join('\n'))
} catch (error) {
  await writeFile(join(out, 'host-error.json'), JSON.stringify({ error: String(error), errors, consoleErrors }, null, 2))
  await screenshot('host-error.png').catch(() => {})
  throw error
} finally {
  if (main) await desktopCommand(main, home, 'window.webContents.setBackgroundThrottling(true); return true;').catch(() => {})
  await browser.close()
}
