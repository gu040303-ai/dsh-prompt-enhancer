# 0.4.0 验证记录

日期：2026-10-22。目标：DeepSeek Harness 0.2.1-rc.2。Windows、Node 24.15.0、Chrome，以及机器上实际安装的 Electron 桌面程序。参考宿主提交 687f282e8625c6b8d11ff58211a90524be2e4317，未修改宿主源码。

所有模型测试使用隔离的本地确定性适配器，没有使用用户真实账号或调用外部付费模型。

## 验证范围与证据

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| Host／Client 严格类型检查、构建与测试 | 124 项通过 | evidence/check.log |
| 原生组件、菜单与 Lexical 浏览器检查 | 21 项通过 | evidence/browser-results.json |
| 官方 Web 完整应用 | 14 项通过 | evidence/web-e2e-results.json |
| 真实安装的 Electron 完整应用 | 14 项通过 | evidence/desktop-e2e-results.json |
| Web 安装文件哈希与卸载配置恢复 | 通过 | evidence/web-lifecycle.json |
| 原生桌面管理器安装与哈希 | 通过 | evidence/desktop-install.json |
| 原生桌面管理器卸载与清理 | 通过 | evidence/desktop-remove.json |

124 项包括真实 Gateway／LLM／Session 链、五类预检与预算、工作区路径边界、工具作用域、Host 对条件化结论的重新核验、纯文本转换、句级拼接及界面工作流。纯文本专项包含 Markdown 标题、加粗、斜体、引用、列表、表格、链接、围栏、代码运算符、路径、原始字面代码、缩进与幂等性；普通编号和任务要求的交付格式不被删除。

界面测试覆盖一次点击一次事务写回、默认不打开侧栏、重复点击抑制、显式预览、句级勾选、条件化优化、细节丢失时转入预览、取消、失败、后续编辑、修订号失效、会话切换及卸载。关闭侧栏只取消预览请求，快捷请求独立于可选侧栏；不遵守取消的旧响应不能写回。

21 项浏览器检查使用官方源码的原生 Button、Menu、Tooltip、主题和 Lexical 编辑器。明暗主题各检查 320／375／768／1200px 操作栏；验证侧栏底部操作可见、纯文本写回、原生撤销、事实丢失回退、取消与超时，以及减少动态效果偏好。夹具不代替完整应用验证。

Web 与 Electron 的 14 项分别验证冷启动、空输入禁用、一键真实调用与纯文本写回、不自动开侧栏、原生 Ctrl+Z、干净预览与折叠检查、句级选择、1280px 明色与 375px 暗色布局、显式应用和恢复、条件化优化、细节丢失保护、取消后的失败恢复、新会话以及运行错误。分组计数见 JSON。

## 安装与隔离

Web 使用独立测试 home／profile，官方 rc.2 安装器安装本地 tgz。安装后的 lib/index.js、lib/client.js、lib/remote.js、cordis.patch.yml 与构建逐一核对 SHA-256；卸载后 --dump-config 与安装前逐字节一致，摘要记录在 evidence/web-lifecycle.json。

Electron 使用独立测试 home 与浏览器目录，通过桌面原生插件管理器安装和卸载，未操作用户常用 profile。安装后核验相同运行入口哈希；卸载核验依赖、bundle、样式和入口移除，原有本地测试模型与用户 patch 保留。

同版本重装可能需要完整重启才能刷新宿主静态资源。本轮完整应用检查经过冷启动。所有截图都来自实际隔离桌面，本地模型名称明确可见。

## 隐藏窗口取证

隐藏的 Windows Electron 窗口可使 CDP 截图或动画稳定性等待停顿。测试阶段临时关闭目标窗口的 backgroundThrottling，并使用 Electron 原生 capturePage 驱动绘制、等待短暂动效结束后再取图，随后恢复设置。通过核对 DSH_HOME 限定目标，不操作其他实例。

复现完整桌面检查：设置 DSH_TEST_DESKTOP_PORT、DSH_TEST_DESKTOP_MAIN_PORT、DSH_TEST_DESKTOP_HOME 和 DSH_ENHANCER_WORK，再执行 npm run test:installed。调试端口应仅监听 loopback，启动前移除 ELECTRON_RUN_AS_NODE；只对隔离实例运行。scripts/test-desktop-install.mjs 的 install／remove 参数用于原生管理器生命周期检查，install 需要 DSH_TEST_PACKAGE 指向 tgz。

## 边界

- 未用外部供应商账号测试真实鉴权和改写质量；模型凭据与调用链由宿主处理。
- 纯文本清理覆盖常见展示标记，并保护可识别的原始代码、路径等；不声称任意文本语法都可无歧义识别。
- 硬事实检查是有限的逐字检查，不保证语义保真。检测到丢失时快捷路径不自动写回。
- 只适配指定 rc.2，没有任意区间采纳。
- 上述记录形成于本地交付阶段；公开源码与安装包入口见 RELEASE.md。收录 YAML 仍为草稿，收录 CI 和维护者审核未完成。

