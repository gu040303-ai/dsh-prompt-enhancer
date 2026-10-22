import { chromium, expect } from '@playwright/test'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
import { desktopCommand } from './desktop-capture.mjs'

const home = process.env.DSH_TEST_DESKTOP_HOME
const port = process.env.DSH_TEST_DESKTOP_PORT
const mainPort = process.env.DSH_TEST_DESKTOP_MAIN_PORT
const action = process.argv[2]
if (!['install', 'remove'].includes(action) || !port || !home) throw new Error('Use install/remove with explicit isolated desktop ports and home')
await desktopCommand(mainPort, home, 'return true;')
const out = resolve(process.env.DSH_ENHANCER_WORK ?? '.desktop-install')
await mkdir(out, { recursive: true })
const profile = join(home, 'profiles/desktop')
const patchBefore = await readFile(join(profile, 'cordis.patch.yml'))
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
const page = browser.contexts()[0].pages().find(p => p.url().startsWith('dsh-app://app/'))
assert.ok(page)
page.setDefaultTimeout(20000)
try {
  await page.getByRole('button', { name: '插件', exact: true }).click()
  const card = page.locator('[data-plugin-package="dsh-prompt-enhancer"]')
  if (action === 'remove') {
    await card.getByRole('button').first().click()
    await page.locator('[data-plugin-detail="dsh-prompt-enhancer"]').getByRole('button', { name: /^卸载/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: '卸载', exact: true }).click()
    await expect(card).toHaveCount(0, { timeout: 45000 })
    await expect.poll(async () => JSON.parse(await readFile(join(profile, 'package.json'), 'utf8')).dependencies?.['dsh-prompt-enhancer']).toBeUndefined()
    const manifest = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'))
    assert.ok(!manifest.dsh.profile.bundles.includes('dsh-prompt-enhancer'))
    assert.ok(manifest.dsh.profile.bundles.includes('dsh-enhancer-local-test'))
    await expect(page.locator('style[data-plugin="dsh-prompt-enhancer"]')).toHaveCount(0)
    await page.getByRole('button').filter({ hasText: '新会话' }).first().click()
    await page.locator('[data-composer-input][data-lexical-editor="true"]').waitFor()
    await expect(page.getByRole('button', { name: '增强提示词', exact: true })).toHaveCount(0)
    await page.getByRole('button').filter({ hasText: '本地验证模型' }).waitFor()
    await writeFile(join(out, 'desktop-remove.json'), JSON.stringify({ passed: true, nativeManager: true,
      removedFromDependencies: true, removedFromBundles: true, stylesRemoved: true, launcherRemoved: true,
      existingModelPreserved: true, patchUnchanged: patchBefore.equals(await readFile(join(profile, 'cordis.patch.yml'))) }, null, 2))
    console.log('Native desktop uninstall restored the composer; unrelated model and user patch preserved')
  } else {
    assert.ok(process.env.DSH_TEST_PACKAGE, 'Set DSH_TEST_PACKAGE to the local tgz')
    await expect(card).toHaveCount(0)
    await page.getByRole('button', { name: '添加插件', exact: true }).click()
    await page.getByRole('textbox', { name: '包名或地址', exact: true }).fill(resolve(process.env.DSH_TEST_PACKAGE))
    await page.getByRole('button', { name: '安装', exact: true }).click()
    await page.waitForFunction(() => ['done', 'failed'].includes(document.querySelector('[data-install-phase]')?.getAttribute('data-install-phase')), null, { timeout: 60000 })
    const enable = page.getByRole('button', { name: '立即启用', exact: true })
    await enable.click()
    await page.locator('[data-install-phase]').waitFor({ state: 'hidden' })
    await expect(card).toHaveAttribute('data-plugin-status', 'running')
    const hash = buffer => createHash('sha256').update(buffer).digest('hex')
    const hashes = {}
    for (const name of ['lib/index.js', 'lib/client.js', 'lib/remote.js', 'cordis.patch.yml']) {
      const expected = hash(await readFile(new URL(`../${name}`, import.meta.url)))
      const installed = hash(await readFile(join(profile, 'node_modules/dsh-prompt-enhancer', name)))
      assert.equal(installed, expected, `Installed file mismatch: ${name}`)
      hashes[name] = installed
    }
    assert.ok(patchBefore.equals(await readFile(join(profile, 'cordis.patch.yml'))))
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    await writeFile(join(out, 'desktop-install.json'), JSON.stringify({ passed: true, nativeManager: true, version: manifest.version, patchUnchanged: true, hashes }, null, 2))
    console.log('Native desktop install activated the package; all runtime entry hashes match the reviewed build')
  }
} finally { await browser.close() }
