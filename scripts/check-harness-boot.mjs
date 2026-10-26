// Real host and browser regression. Uses a fresh profile, never the user's profile.
// Authentication tokens are kept in memory and redacted from diagnostic output.
import { spawn } from 'node:child_process'
import { resolve, join } from 'node:path'
import { readFile, writeFile, mkdir, mkdtemp, cp, symlink } from 'node:fs/promises'
import assert from 'node:assert/strict'

const host = resolve(process.env.HARNESS_RUNTIME ?? '../.harness-rc3/dsh')
const cli = join(host, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
const artifactRoot = resolve('.browser-smoke/compat')
await mkdir(artifactRoot, { recursive: true })
const home = await mkdtemp(join(artifactRoot, 'home-'))
const profile = join(home, 'profiles/compat'), modules = join(profile, 'node_modules')
await mkdir(modules, { recursive: true })
for (const name of ['@deepseek-ai', 'zod']) await symlink(join(host, 'node_modules', name), join(modules, name), 'junction')
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
const plugin = join(modules, pkg.name)
await mkdir(plugin)
await cp('lib', join(plugin, 'lib'), { recursive: true })
for (const name of ['package.json', 'cordis.patch.yml']) await cp(name, join(plugin, name))
await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'dsh-profile-compat', private: true,
  dependencies: { [pkg.name]: pkg.version }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', pkg.name] } } }))
await writeFile(join(profile, 'cordis.yml'), '[]\n')
await writeFile(join(profile, 'cordis.patch.yml'), '[]\n')

const redact = value => String(value).replace(/([?&]token=)[^\s]+/g, '$1<REDACTED>').replace(/(Bearer\s+)[\w.-]+/g, '$1<REDACTED>')
const child = spawn(process.execPath, [cli, '--profile', 'compat', '--no-open', '--port', '0'], {
  env: { ...process.env, DSH_HOME: home, SystemRoot: 'C:\\Windows', windir: 'C:\\Windows' },
  windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
})
let log = '', browser
const failures = [], checks = []
try {
  const url = await new Promise((accept, reject) => {
    const timer = setTimeout(() => reject(new Error('Host startup timed out: ' + redact(log).slice(-1500))), 30_000)
    function output(data) {
      log += data.toString()
      const skipped = log.split(/\r?\n/).find(line => line.includes('skipping profile bundle "dsh-prompt-enhancer"'))
      if (skipped) { clearTimeout(timer); reject(new Error(redact(skipped))) }
      const address = log.match(/dsh web: (https?:\/\/[^\s]+)/)?.[1]
      if (address) { clearTimeout(timer); accept(address) }
    }
    child.stdout.on('data', output); child.stderr.on('data', output)
    child.on('error', reject)
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`Host exited with ${code}: ${redact(log).slice(-1500)}`)) })
  })
  assert.doesNotMatch(log, /(?:Error|failed).*dsh-prompt-enhancer|dsh-prompt-enhancer.*(?:Error|failed)/i)
  checks.push('Actual host accepts the package without a version exemption')
  if (process.argv.includes('--browser')) {
    const { chromium, expect } = await import('@playwright/test')
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    page.on('pageerror', error => failures.push(redact(error.message)))
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    try {
      const wand = page.getByRole('button', { name: /^(增强提示词|Enhance prompt)$/ })
      await wand.waitFor({ timeout: 20_000 })
      const welcome = page.getByRole('button', { name: /^(继续|Continue)$/ })
      await welcome.waitFor({ state: 'visible', timeout: 10_000 })
      await welcome.click()
      await welcome.waitFor({ state: 'hidden' })
      // An empty profile offers account setup after the preview notice. Dismiss
      // that onboarding prompt; this regression intentionally has no credentials.
      await page.keyboard.press('Escape')
      const editor = page.locator('[data-composer-input][contenteditable="true"]').first()
      await editor.fill('请制定预算 200 元的项目计划。')
      await expect(wand).toBeEnabled({ timeout: 5_000 })
      await page.keyboard.press('Escape')
      await page.screenshot({ path: join(artifactRoot, 'host-wand.png'), animations: 'disabled' })
      await page.getByRole('button', { name: /^(优化选项|Enhancement options)$/ }).click()
      await page.getByRole('menuitem', { name: /^(先预览再应用|Preview before applying)$/ }).click()
      await page.locator('.dsh-pe-panel').waitFor({ state: 'visible' })
      assert.equal(await editor.innerText(), '请制定预算 200 元的项目计划。', 'Preview must preserve the original input')
      checks.push('A plain draft enables the wand; preview opens the native sidebar without changing the draft')
      await page.screenshot({ path: join(artifactRoot, 'host-preview.png'), animations: 'disabled' })
    } catch (error) {
      await page.screenshot({ path: join(artifactRoot, 'debug-interface.png') })
      console.error(JSON.stringify({ pageErrors: failures, visibleText: (await page.locator('body').innerText()).slice(0, 2200),
        buttons: await page.getByRole('button').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, label: node.getAttribute('aria-label') }))) }))
      throw error
    }
    checks.push('Wand is visible in the real host browser UI')
    assert.deepEqual(failures, [], 'Host UI must not fail while loading the plugin')
  }
  const runtimePackage = JSON.parse(await readFile(join(host, 'package.json'), 'utf8'))
  const result = { version: pkg.version, hostVersion: runtimePackage.version, checks, errors: failures,
    realHost: true, isolatedProfile: true, externalModelCalls: false }
  await writeFile(join(artifactRoot, 'result.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify({ ...result, output: artifactRoot }, null, 2))
} catch (error) { console.error(redact(error.stack ?? error)); process.exitCode = 1 }
finally { await browser?.close(); child.kill() }
