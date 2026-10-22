# 声明与实现对应

| 功能 | 主要实现 | 证据 |
| --- | --- | --- |
| 一键优化并写回、取消、修订号保护 | src/EnhanceLauncher.tsx、EnhanceButton.tsx、workflow.ts | ui.test.tsx、Web／Electron E2E |
| 原生菜单、安静状态反馈与侧栏 | src/client.ts、EnhanceLauncher.tsx、EnhancePanel.tsx、EnhanceResult.tsx | 浏览器夹具、真实桌面截图 |
| 纯文本指令与双端清理 | src/enhance.ts、plainText.ts | plainText.test.ts、host.test.ts、两组 E2E |
| 代码、路径、运算符和缩进保护 | src/plainText.ts | plainText.test.ts |
| 五类预检、三态、预算及工作区边界 | src/lint.ts、lintRules.ts、lintTypes.ts | lint.test.ts |
| 条件化请求重新核验 | src/index.ts、enhance.ts、remote.ts | host.test.ts、lint.test.ts |
| 干净预览、句级选择与单事务应用 | src/selection.ts、EnhanceResult.tsx | lint.test.ts、ui.test.tsx、两组 E2E |
| 事实丢失回退、补回细节与撤销 | src/fidelity.ts、EnhanceButton.tsx、EnhanceResult.tsx | pure.test.ts、ui.test.tsx、两组 E2E |
| 无位移状态反馈、写回轻亮、减少动态效果 | src/client.ts 的 CSS 与 EnhanceFeedback | 浏览器检查 |
| 安装运行文件一致与卸载恢复 | package.json、cordis.patch.yml、生命周期清理 | evidence/*lifecycle.json、desktop-install.json、desktop-remove.json |

没有声明语义保真保证、完整权限审计、任意区间采纳、跨版本兼容或已公开发布。
