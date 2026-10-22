// Test-only. Load with local-model.patch.yml in an isolated Web profile.
// This provider is excluded from the installable npm tarball.
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
export const inject = ['llm']
class LocalTestAdapter extends LlmAdapter {
  providerInfo(provider) { return { id: provider, name: '本地测试适配器' } }
  async listModels(provider) { return [{ provider, id: 'enhancer-test', name: '本地验证模型' }] }
  async *stream(options) {
    const draft = JSON.parse(options.messages[0].content[0].text).draft
    await new Promise(resolve => setTimeout(resolve, draft.includes('模拟等待') ? 1500 : 300))
    options.signal?.throwIfAborted()
    if (draft.includes('模拟失败')) {
      yield { type: 'text-delta', index: 0, text: '这是一段不应写回的未完成输出' }
      throw new Error('Injected local model failure')
    }
    yield { type: 'text-delta', index: 0, text: draft.includes('模拟丢失') ? '请制定清晰的项目计划。'
      : '# 项目计划\n\n请在 **200 元**预算内制定项目计划，按步骤列出交付物、所需资源和验收标准。\n\n- 对于项目背景中的关键缺项，请先提出澄清问题。' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
export function apply(ctx) { ctx.effect(() => ctx.llm.registerAdapter(['enhancer-local-test'], new LocalTestAdapter())) }
