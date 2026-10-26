# 0.4.2 本地兼容更新

本地完整安装包：`dsh-prompt-enhancer-0.4.2.tgz`。兼容声明覆盖 Harness 0.2.1-rc.2 与 0.2.1-rc.3，修复新版宿主因旧版本声明而拒载插件的问题。安装包包含构建产物、配置和资源，无需解压或编译。

本轮类型检查、构建、130 条自动化测试，以及实际 rc.3 宿主加载和浏览器入口验证通过；没有验证真实模型生成。范围和复现命令见 [VALIDATION.md](VALIDATION.md)。本次尚未发布 GitHub Release，下面保留此前正式版信息。

---

# 0.4.1 发布信息（历史）

源码仓库：[gu040303-ai/dsh-prompt-enhancer](https://github.com/gu040303-ai/dsh-prompt-enhancer)。

正式版：[v0.4.1 Release](https://github.com/gu040303-ai/dsh-prompt-enhancer/releases/tag/v0.4.1)。目标宿主为 DeepSeek Harness 0.2.1-rc.2。

- 完整预构建安装包：[dsh-prompt-enhancer-0.4.1.tgz](https://github.com/gu040303-ai/dsh-prompt-enhancer/releases/download/v0.4.1/dsh-prompt-enhancer-0.4.1.tgz)。
- 源码快照：[dsh-prompt-enhancer-0.4.1-source.zip](https://github.com/gu040303-ai/dsh-prompt-enhancer/releases/download/v0.4.1/dsh-prompt-enhancer-0.4.1-source.zip)。
- 文件校验：[SHA256SUMS-0.4.1.txt](https://github.com/gu040303-ai/dsh-prompt-enhancer/releases/download/v0.4.1/SHA256SUMS-0.4.1.txt)。

在 Harness 桌面原生插件管理器中安装 tgz；无需解压或构建。升级步骤见 README。没有发布到 npm registry。

本次移除持续呼吸光和文字模糊，修复状态提示的换行、过时状态和操作混显。130 条自动化测试、176 组浏览器布局检查通过。当前版本完整 Harness 应用及真实模型调用未重新验证；历史结果与本轮范围见 [VALIDATION.md](VALIDATION.md)。

收录申请沿用 [PR #8698](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/8698)，条目固定到本版本 tgz。申请状态以 PR 页面为准，发布成功不代表收录审核通过。0.4.0 Release 与旧修复构建均保留历史下载入口。
