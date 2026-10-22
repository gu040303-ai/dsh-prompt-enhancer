# 动效预览台

从构建产物里抽出插件 CSS，套在复刻的输入框 + 侧栏上，用本机 Chrome 截图，用来在没有宿主源码的情况下检查动效。纯开发工具，不在 npm 包里（`package.json` 的 `files` 不含 `scripts`）。

## 用法

```powershell
cd <repo root>
node scripts/build.mjs                 # 必须先构建，脚本读的是 lib/client.js
node scripts/motion-preview/preview.cjs
```

产物写到 `scripts/motion-preview/shots/`（已 `.gitignore`，不要提交）。

依赖：

- Playwright（本机从 work 副本的 node_modules 里取到）。没有的话 `npm i -D playwright`，或设 `PLAYWRIGHT_PATH=<含 playwright 的目录>`。
- Chrome。默认 `C:/Program Files/Google/Chrome/Application/chrome.exe`，可用 `CHROME_PATH` 覆盖。

## 输出对照

| 文件 | 看什么 |
| --- | --- |
| `light-idle.png` / `light-hover-{a,b,c}.png` | 悬停前 / 呼吸的三个相位（40ms 暗、1200ms 峰值、2400ms 回到暗） |
| `x4-hover.png` / `x4-hover-dark.png` | 4 倍放大看笔画级光晕（判「像发光」还是「像蓝方块」） |
| `x1-*.png` | 1 倍真实尺寸，判会不会在工具条上抢眼 |
| `reveal-{000,090,180,300,520}ms.png` | 结果文字显影的关键帧 |
| `diff-*.png` | 逐句行 28ms 级联 |
| `flash-*.png` | 写回输入框的底洗 + 文字浮现（真实时序是 640ms / 500ms） |
| `reduced-hover.png` | 关动效后仍应保留一层静态光 |
| 结束时的 JSON | `hover-style`（颜色/底色/阴影/图标变换与滤镜）与 `reduced-motion`（各元素 animationName 是否为 none） |

## 为什么用 seek 取帧

`waitForTimeout` + 截图与合成帧不同步，几十毫秒的漂移就能让呼吸峰值跑掉、让 28ms 步长的级联对不齐。脚本统一 `document.getAnimations()` 暂停后设 `currentTime`，每次截图前只多等 50–60ms 让样式刷新。

## 注意

- 页面里的主题 token 是从宿主 asar 里扒出来的值（`#4176e6` / `#7aaaff` 等），和真实皮肤有细微差别；这里判的是「动效强弱与节奏」，不是逐像素配色。
- mock 的 DOM 结构、类名要跟 `src/*.tsx` 保持一致，改了组件结构记得同步这个文件，否则测的就不是真东西了。
- `.dsh-pe-diff` 自带 `display:flex`，会压过 `hidden` 属性，所以隐藏一律用内联 `style.display`。
