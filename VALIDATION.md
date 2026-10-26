# 0.4.2 验证记录

日期：2026-10-26。使用本机安装的官方 Harness 0.2.1-rc.3 构建产物，源提交 be72761ee1a6736ebcdf4f3739363b083ae53c98；没有修改宿主源码或安装目录。

- 旧包 0.4.1 在实际加载器中稳定复现：`engines.dsh` 仅为 `0.2.1-rc.2`，宿主跳过整个 bundle，因而界面没有魔法棒。
- 修改兼容声明后，同一真实加载器正常启用插件，不使用版本豁免。
- `npm run check`：类型检查、构建、130 条自动化测试通过；开发依赖仍固定在 rc.2，保留旧版 API 的回归覆盖。
- `npm run test:compat`：在独立 profile 启动真实 rc.3 Web 应用，验证输入后魔法棒启用、菜单可打开预览侧栏、原始草稿不变，浏览器无运行错误。
- 测试 profile 没有账号和模型配置。预览调用在模型不可用时报告失败；本轮验证的是宿主加载、界面入口与草稿保护，没有验证真实模型生成，也没有调用外部付费模型或操作日常桌面 profile。

复现界面回归：先构建插件，将 `HARNESS_RUNTIME` 指向官方宿主运行目录（应含 `node_modules/@deepseek-ai/dsh/lib/bin.js`），将 `CHROME_PATH` 指向 Chrome，然后运行 `npm run test:compat`。测试每次创建新的 `.browser-smoke/compat/home-*`，认证令牌不输出。当前机器默认使用工作区旁的 `.harness-rc3/dsh`。

---

# 0.4.1 验证记录（历史）

目标：DeepSeek Harness 0.2.1-rc.2。2026-10-22 在 Windows、Node 24.15.0 与 Chrome 上验证本次动效和状态提示修复。

- npm run check：严格类型检查、构建及 130 条自动化测试。
- npm run test:feedback：176 组浏览器布局检查，覆盖中英文、深浅主题、240/320/392/672px 宽度、减少动态效果、关闭提示后保留侧栏结果。
- 浏览器夹具使用真实插件组件、已安装的原生 Button 与模拟输入状态；本版本没有重新运行完整 Harness 应用及真实模型调用。下方完整应用数据属于 0.4.0 历史记录，不代表 0.4.1 已重复验证。
- 完整安装包包含预构建 runtime、类型声明、配置及资源，发布资产附 SHA-256 校验文件。

动效参数见 [MOTION.md](MOTION.md)，修复验证记录见 [evidence/feedback-fix-validation.json](evidence/feedback-fix-validation.json)。

---

# 0.4.0 验证记录（历史）

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

