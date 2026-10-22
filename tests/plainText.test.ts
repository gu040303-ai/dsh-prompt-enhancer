import { test } from 'node:test'
import assert from 'node:assert/strict'
import { plainPrompt } from '../src/plainText.ts'
import { compareFacts } from '../src/fidelity.ts'

for (const [name, input, expected] of [
  ['headings and bold', '# 任务目标\n\n请写一份**项目计划**，预算 **200 元**。', '任务目标\n\n请写一份项目计划，预算 200 元。'],
  ['fenced markdown envelope', '```markdown\n## 目标\n- **预算**：200 元\n```', '目标\n预算：200 元'],
  ['checkboxes and quotes', '> 请核实以下内容\n- [ ] 第一步\n* 第二步', '请核实以下内容\n第一步\n第二步'],
  ['ordinary numbered steps', '1. 读取文件。\n2. 输出结果。', '1. 读取文件。\n2. 输出结果。'],
  ['requested deliverable format is still a constraint', '请最终输出 Markdown 表格，并保留 JSON 字段名。', '请最终输出 Markdown 表格，并保留 JSON 字段名。'],
  ['link label and full URL', '[文档](https://example.com/a_(b))', '文档（https://example.com/a_(b)）'],
  ['image alternative text', '![流程图](https://example.com/a.png)', '流程图（https://example.com/a.png）'],
  ['table labels and rows', '| 项目 | 预算 |\n| --- | ---: |\n| A | 200 元 |\n| B | 300 元 |', '项目：A；预算：200 元\n项目：B；预算：300 元'],
  ['inline code content', '请运行 `a ** b` 并检查 `snake_case`。', '请运行 a ** b 并检查 snake_case。'],
  ['code block is literal', '示例：\n```python\n# comment\nx = a ** b\n```', '示例：\n# comment\nx = a ** b'],
  ['plain math and identifiers', 'a * b + c，snake_case，2 ** 3，C:\\a_b\\main.py', 'a * b + c，snake_case，2 ** 3，C:\\a_b\\main.py'],
  ['HTML presentation', '<h2>目标</h2><p><strong>保留</strong>数字 200。<br>第二行</p>', '目标\n\n保留数字 200。\n第二行'],
  ['separators and setext heading', '任务\n===\n\n---\n执行。', '任务\n\n执行。'],
] as const) test(`plain prompt: ${name}`, () => assert.equal(plainPrompt(input), expected))

test('the original literal code can contain markdown syntax without losing bytes', () => {
  const original = '保留 `**literal**` 和 `# pragma` 以及 C:\\repo\\_cache_\\main.py。'
  const output = '## 目标\n保留 **literal** 和 # pragma 以及 C:\\repo\\_cache_\\main.py。'
  const converted = plainPrompt(output, original)
  assert.ok(converted.includes('**literal**'))
  assert.ok(converted.includes('# pragma'))
  assert.equal(compareFacts(original, converted).lost.length, 0)
})

test('normalizing twice preserves the same text and protected literal content', () => {
  const original = '保留 `**literal**` 和预算 200 元。'
  const once = plainPrompt('# 目标\n**预算** 200 元，保留 `**literal**`。', original)
  assert.equal(plainPrompt(once, original), once)
})

test('source and generated literal code retain URLs and operators in fenced blocks', () => {
  const code = '# comment\nvalue = a ** b\nurl = "https://example.com/a_(b)"'
  const original = `保留代码：\n\`\`\`python\n${code}\n\`\`\``
  const output = plainPrompt(`## 代码\n\`\`\`python\n${code}\n\`\`\``, original)
  assert.ok(output.includes(code))
  assert.equal(compareFacts(original, output).lost.length, 0)
})

test('unwrapping a code block preserves meaningful leading indentation', () => {
  const code = '    value = a ** b\n    return value'
  assert.equal(plainPrompt(`\`\`\`python\n${code}\n\`\`\``), code)
})
