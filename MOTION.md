# 动效说明（未发布）

本文记录 0.4.0 之后加入的一层动效：魔法棒悬停发光、优化结果显影出现、逐句对照级联、写回输入框的落点提示。目标是让人看得出「这个能点」「结果刚出来」「改动落在哪」，而不是加装饰。

现状：代码在本地分支 `motion-polish`，已构建并装进 desktop profile；`package.json` 仍是 0.4.0，未发版。样式全部是纯 CSS，只有三处逻辑改动（`src/client.ts` 的 CSS、`src/resultStore.ts` 的发布序号、`src/EnhanceResult.tsx` 的一个 `key`）。

## 一、四处动效与落点

| 位置 | 触发 | 观感 | 代码 |
| --- | --- | --- | --- |
| 输入框魔法棒 | hover / 键盘聚焦 | 图标转品牌蓝、按钮 10% 品牌底、沿笔画呼吸发光；按下回缩 | `src/client.ts` L31–36 |
| 侧栏结果文本 | 每次新结果发布 | 从 6px 虚化上浮 7px 显影，520ms | L53、L85 |
| 逐句对照行 | 同上，或切到「逐句」 | 每行错开 28ms 依次浮起 | L54–57、L86 |
| 写回后的输入框 | 写回成功 | 淡蓝底洗 640ms + 文字 500ms 从半透明微虚浮现 | L80、L84、L87 |

发光不是加在按钮方块上（试过：30×30 的 `box-shadow` 光晕读作「被选中的蓝方块」），而是加在 SVG 上，用三层 `drop-shadow` 沿魔法棒笔画外溢，所以看起来是笔画在发光。呼吸周期 2.4s，三层半径 2/8/16px 到 3/12/24px 之间往返。

## 二、参数表

| 参数 | 当前值 | 位置 |
| --- | --- | --- |
| 悬停转场 | `background-color/color 140ms` | L30 |
| 图标旋转 | `rotate(-9deg) scale(1.14)`，`280ms cubic-bezier(.2,.7,.25,1)` | L31–33 |
| 呼吸周期 | `2.4s ease-in-out infinite` | L33 |
| 发光 alpha | 底噪 70%/34%/16%，峰值 95%/62%/34% | L88 |
| 悬停底色 | `color-mix(... 10%, transparent)` | L32 |
| 结果显影 | `blur(6px)→0`、`translateY(7px)→0`、`opacity 0→1`，520ms `.16,1,.3,1` | L53、L85 |
| 级联步长 | 28ms，到第 8 行（196ms） | L55–57 |
| 单行浮起 | 380ms `.16,1,.3,1` | L54、L86 |
| 写回底洗 | 10% 品牌 → 透明，640ms `ease-out` | L80、L84 |
| 写回显影 | `opacity .35→1`、`blur(2px)→0`，500ms `ease` | L80、L87 |

调参入口基本都在这张表里。想更亮就抬 L88 的 alpha（半径一起加，只加 alpha 会从「发光」变成「描边」）；想更克制就降 L32 的 10% 和 L88 的第三层半径；嫌慢就改 L53 的 520ms 与 L55 的 28ms 步长，别改缓动曲线——`.16,1,.3,1` 是前快后缓，换成 `ease` 会显得黏。

## 三、改之前必须知道的六条

1. **`!important` 只能出现在整条 `animation` 声明末尾一次。** 写成 `animation:A 700ms!important,B 460ms!important` 整条声明非法，浏览器直接丢弃，表现为「完全没有动画也完全不报错」。现在 L80 是 `dsh-pe-flash 640ms ease-out,dsh-pe-ink-soft 500ms ease!important`。
2. **填充用 `backwards`，不要用 `both`。** `both` 会在动画结束后长期残留 `filter:blur(0)` 与 `transform`，让整块文字被提升为合成层并轻微发灰，而且级联行会一直带着位移。
3. **重播靠 `seq`。** `.dsh-pe-text` 在侧栏常驻，只有重新挂载才会重播动画。所以 `resultStore.publish()` 写 `{ ...outcome, seq: ++published }`，`EnhanceResult.tsx` 给结果文本加 `key={outcome.seq}`。不要改成 effect 里重设 class——和 React 复用节点会打架，也会和「逐句勾选不重播」的约定冲突（勾选不经过 `publish`）。
4. **悬停选择器必须提权。** 宿主 Button 的 `.button.ghost:hover:not(:disabled)` 权重是 0,4,0（CSS Modules 哈希类 + 两个伪类）。插件只写 `.dsh-pe-button:hover` 时底色会被宿主的灰底盖掉，而图标颜色照常变——很容易误判成「生效了」。现在用 `.dsh-pe-control .dsh-pe-button:hover:not(:disabled)`。
5. **reduced-motion 要留静态反馈。** `animation:none` 会把悬停呼吸一起干掉，所以 L32/L33 另写了静态 `drop-shadow`，关动效时仍有一层不闪的光。改这里时别只删动画不管静态态。
6. **`src/client.ts` 是混合行尾。** 第 26、71、75、76、164、165 行是 CRLF，其余是 LF。用会按文本模式重写整个文件的脚本会产生三百多行假 diff；提交前用 `git diff --ignore-cr-at-eol --stat` 与 `git diff --stat` 对照，两者数字应当一致（当前 3 文件、24 增 7 删）。

## 四、验证链路

- `npm run check`：`typecheck` + `build` + 124 条测试。测的是行为（写回、撤销、修订号、取消、纯文本清理），**不测观感**，动效对了测试也照样全绿。
- `npm run test:browser`：需要 `HARNESS_SOURCE` 指向宿主源码（要它的 src 与 CSS）+ Chrome，本机没有宿主源码，**跑不了**。脚本里有断言「reducedMotion=reduce 时 `.dsh-pe-feedback` 的 animationName 是 none」，改类名或改 reduced-motion 块时要保住这条。
- 静态预览台 `scripts/motion-preview/`：从构建产物 `lib/client.js` 里抽 CSS，套在 mock 的输入框 + 392px 侧栏上，用本机 Chrome 截图。用法见该目录 README。
- 为什么用预览台而不是真机：本地 GUI 要鉴权（`curl http://127.0.0.1:<port>` 返回 401 "dsh web authentication required"），`web_fetch` 也拒绝 127.0.0.1；宿主 UI 源码不在 `node_modules` 里（@deepseek-ai 的包只有 lib），`resources/app.asar` 不能当目录读。所以只能「用真实的构建产物 CSS + 真实的主题 token + 复刻的 DOM」来近似。
- 取帧用「暂停所有 `document.getAnimations()` 再 seek 到指定毫秒」，不要用 `waitForTimeout`：截图与合成帧不同步，几十毫秒的漂移足以让呼吸峰值和 28ms 级联完全对不上。

## 五、构建与装到本机

```powershell
cd D:\Codex\2026-10-22\2\work\publish-dsh-prompt-enhancer
node scripts/build.mjs          # 产物在 lib/
npx tsc --noEmit -p tsconfig.json
node --import tsx --test tests/*.test.ts tests/*.test.tsx
```

- `node_modules` 是指向 `D:\Codex\2026-10-21\0-2-1-rc-2-deepseek\work\v030\dsh-prompt-enhancer-0.2.0\node_modules` 的联接。**必须用 pwsh 建**：`New-Item -ItemType Junction -Path .\node_modules -Target <上面那条>`。在 bash 里 `cmd /c mklink /J` 会生成 `/d/D:/...` 这种坏联接，`esbuild` 一跑就报找不到模块。
- 装到桌面端：把 `lib\*` 覆盖到 `C:\Users\LENOVO\.dsh\profiles\desktop\node_modules\dsh-prompt-enhancer\lib\`，然后**完全退出 Harness（含托盘图标）再启动**，否则渲染进程还在用旧 bundle。不要用 CLI 管理 desktop profile（README 里也写了，会破坏桌面安装）。
- 改动前的已装产物备份：`D:\Codex\2026-10-22\2\work\backup-desktop-lib-2002\`。
- 校验：`lib/client.js` 的 SHA256 应为 `875035975a243aeb2125bb2f8ab3f3363e9cdd4df8420a5661d3143f56c95efa`（工作副本、outputs 快照、desktop profile 三处一致）。

## 六、发版时要注意

- 版本仍是 0.4.0，`CHANGELOG.md` 里加了一段「未发布」。发版时把标题改成 `0.5.0 — 日期`，升 `package.json`，再走 `npm run prepack` 出 tgz。
- GitHub 上有计划任务 `Codex-DSH-Listing-8698-20261023`，2026-10-23 19:20 会校验 PR head SHA、包名、版本 0.4.0 与安装包哈希。**在此之前不要推 main、不要重建或覆盖已发布的 tgz**。
- `registry/gu040303-ai__dsh-prompt-enhancer.yml` 只登记仓库 URL，本地快照改动不影响它；收录条目里的版本下载地址要等新 tag 出来再改。
- `D:\Codex\2026-10-22\2\outputs\dsh-prompt-enhancer-0.4.0` 已同步（src、lib、CHANGELOG），它不是 git 仓库，是纯文件快照。

## 七、已知边界

- 忙碌态用 `.dsh-pe-button[aria-busy=true]{opacity:1}` 覆盖宿主 `.button:disabled{opacity:.4}`，靠的是同权重后置样式。预览台是复刻样式，**真实宿主没验到**；若实机上忙碌时按钮仍偏淡，把选择器改成 `.dsh-pe-control .dsh-pe-button[aria-busy=true]`。
- 在「结果 / 逐句」之间来回切换会让 `.dsh-pe-text` 重新挂载，显影重播一次。目前视为可接受；不想要就把 `key` 换成只在 `seq` 变化时递增的 ref。
- 逐句行前 380ms 内有 4px 位移，理论上极快的点击可能落点差 1–2px，实测未遇到问题。
- 发光外溢最多约 12px，若宿主在输入框工具条上加了 `overflow:hidden`，光会被裁在按钮内（不会溢出到输入框）。目前宿主 `.button` 无 `overflow`。
