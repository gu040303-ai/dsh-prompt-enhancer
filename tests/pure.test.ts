import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendFacts, compareFacts, extractFacts } from '../src/fidelity.ts'
import { diffDraft, splitSentences } from '../src/diff.ts'

test('hard facts are read in the order that makes them unambiguous', () => {
  const facts = extractFacts([
    '见 src/main.ts 和 C:\\work\\a.txt，',
    '数字 123，版本 0.2.1，日期 2026-10-21，',
    '链接 https://example.com/a?b=1，@alice 负责，',
    '`inline()` 与 ```\nfenced()\n```',
  ].join(''))
  assert.deepEqual(facts, [
    { kind: 'code', value: 'fenced()' },
    { kind: 'code', value: 'inline()' },
    { kind: 'url', value: 'https://example.com/a?b=1' },
    { kind: 'path', value: 'src/main.ts' },
    { kind: 'path', value: 'C:\\work\\a.txt' },
    { kind: 'mention', value: '@alice' },
    { kind: 'number', value: '123' },
  ])
})
test('a version, a date and a decimal are structural, not facts', () => {
  assert.deepEqual(extractFacts('版本 0.2.1，日期 2026-10-21，比例 1.5，阈值 12'), [
    { kind: 'number', value: '12' },
  ])
})
test('fidelity separates kept facts from dropped ones', () => {
  const report = compareFacts('改写成 src/main.ts 的 123 行', '请改写 src/main.ts 的代码')
  assert.deepEqual(report.kept, [{ kind: 'path', value: 'src/main.ts' }])
  assert.deepEqual(report.lost, [{ kind: 'number', value: '123' }])
})
test('lost facts can be appended verbatim, and nothing is appended when nothing was lost', () => {
  assert.equal(appendFacts('结果。', [], '保留：'), '结果。')
  assert.equal(appendFacts('结果。\n', [], '保留：'), '结果。\n')
  assert.equal(appendFacts('结果。', [{ kind: 'number', value: '123' }], '保留：'),
    '结果。\n\n保留：\n123')
  assert.equal(appendFacts('结果。', [{ kind: 'code', value: 'a\nb' }], '保留：'),
    '结果。\n\n保留：\na\nb')
})
test('sentences split on Chinese and ASCII terminators', () => {
  assert.deepEqual(splitSentences('第一句。第二句！第三句？\n第四句;'), ['第一句。', '第二句！', '第三句？', '第四句;'])
})
test('an over-long sentence is compared clause by clause', () => {
  const units = splitSentences('长'.repeat(300) + '，' + '又一段'.repeat(80) + '。')
  assert.equal(units.length, 2)
  assert.equal(units[0], '长'.repeat(300) + '，')
})
test('the diff reports added and removed sentences in reading order', () => {
  const result = diffDraft('甲乙。丙丁。', '甲乙。丙丁。戊。')
  assert.deepEqual(result.segments, [
    { op: 'same', text: '甲乙。丙丁。' },
    { op: 'add', text: '戊。' },
  ])
  assert.equal(result.added, 1)
  assert.equal(result.removed, 0)
  assert.equal(result.truncated, false)
})
test('an oversized comparison is refused instead of allocating the table', () => {
  const big = '句。'.repeat(1500)
  const result = diffDraft(big, '句。'.repeat(1400) + '不同。')
  assert.equal(result.truncated, true)
  assert.deepEqual(result.segments, [])
})
