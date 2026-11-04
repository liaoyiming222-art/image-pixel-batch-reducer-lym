# PixelFlow 详情素材 v2

任务编号：`detail-v2-20261104-pixelflow`。产品 ID：`pixelflow`。制作日期：2026-11-04。

仓库：https://github.com/liaoyiming222-art/image-pixel-batch-reducer-lym

素材分支：`codex/detail-v2-20261104-pixelflow`。拍摄代码完整 SHA：`530bdd6ebf3e42db353838db6eb5cfeabf004ece`。素材分支从旧素材提交 `df191acb1dd14be2428201e100bfa31094d9bd0c` 派生，保留旧首页图和图标。

**状态：9 张规定文件已制作并保留真实证据，但 C 清单完整验收受阻，不能将本目录视为全部通过的接入素材。** 未改产品功能以补画面。缺口见下文及 [manifest.json](manifest.json) 的 `unresolved`。

## 成品与实际取景

网页负责标题、用途、来源与限制。以下均为真实界面局部，采用无损 WebP，没有营销标题、模拟按钮或手机外壳。没有修改 DOM 样式、业务状态或结果文本；只裁切和等比缩放，必要时以产品原背景色留白。

| 文件 | 尺寸 | 实际内容 |
|---|---|---|
| pixelflow-detail-process-desktop.webp | 1920 × 1200 | 仅转格式设置、三张实际完成队列与 ZIP 入口 |
| pixelflow-detail-process-mobile.webp | 900 × 1200 | 队列标题与一条完整结果、单张下载；规则与全局 ZIP 入口未在此局部中 |
| pixelflow-detail-find-desktop.webp | 1600 × 1200 | 所选静物目录、三条匹配与路径、两项找到一项未找到 |
| pixelflow-detail-find-mobile.webp | 900 × 1200 | 三条真实匹配结果、路径与状态；清单由结果图名呈现 |
| pixelflow-detail-ratios-desktop.webp | 1600 × 1200 | 三组实际画幅标签、数量、图名、尺寸和下载入口及检测表 |
| pixelflow-detail-ratios-mobile.webp | 900 × 1200 | 三个真实展开组，不存在缩略图或收起状态 |
| pixelflow-detail-folders-desktop.webp | 1600 × 1200 | 输入、设置、原名至最终名称的对应预览与创建上下文 |
| pixelflow-detail-folders-input-mobile.webp | 900 × 750 | 明确来自桌面左侧局部：原名、静物项目前缀、已启用的编号设置 |
| pixelflow-detail-folders-preview-mobile.webp | 900 × 1050 | 同一状态的窄屏预览，真实横向滚动到最终名称列，保留未选择目标和创建按钮 |

## 本次真实运行

原工作区在 `codex/portfolio-assets`，已有 README、查图与统计相关未提交改动及 output/tmp 等未跟踪文件，均予保留。本轮将锁定代码用 `git archive` 导出到独立临时目录，依赖复用现有 node_modules，服务只监听 127.0.0.1:5187。浏览器使用独立无头 Chrome 进程和新上下文，没有连接或覆盖用户浏览器会话。

三张新静物样图由本任务用 SVG 自行绘制：绿陶瓶、茶杯、纸张和果实的统一静物插画。作者为 Codex，本轮原创，无外部素材、隐私内容或生成服务。它们是工具输入，**不是 PixelFlow 的生图结果或真实照片**。SVG 源及 PNG 位于 `samples/`，分别为 1200×1200、1600×900、900×1200；逐文件散列见 manifest resources。

实测仅转格式：三张 PNG 全部转为 JPEG，通过产品“下载全部”取得 `outputs/converted.zip`；已解包保存实际三张 JPEG，并记录尺寸、字节与 SHA-256。未将样本压缩率当平均性能宣传。

真实目录 `静物项目` 只含 square、wide 两张输入。图名清单增加不存在的 `pf-still-missing.png`，实际得到两项找到、一项未找到。未进行查图下载，也未混入工作区未提交的查图转 JPG 行为。

同组输入实际形成 1:1、16:9、3:4 三组，均为一张；详见 `sources/run-report.json`。普通文件夹工具输入“方图、横图、竖图”，前缀“静物项目-”，启用三位自动编号，真实预览为“静物项目-001-方图”等三项。未选择目标目录、未执行创建，两张目录手机素材来源于同一设置状态。

## 完整验收的具体缺口

1. 锁定版的比例分组不显示缩略图，也没有展开/收起控件。因此无法实拍 C 中“缩略图形状差别”或“其他组收起”的画面；交付保留实际文字分组，不伪造控件。
2. 压缩窄屏规则面板、队列和固定全局 ZIP 栏分处较长界面，不能在所定 3:4 局部同时保留并达到字级目标。手机成品保留一条完整结果和单张下载；规则和 ZIP 由桌面实拍证明。
3. 普通目录表在锁定版窄屏下仍有 1120px 最小宽度。手机预览通过真实滚动显示最终名称列，原名称在另一张输入素材中；输入素材明确使用桌面局部，没有伪装为不存在的窄屏排布。
4. 在 288/358 CSS px 宽等比展示时，若干文件名、路径和设置小字仍低于约 14px 的目标。已保留全部目标宽度校验图于 `qa/`；不能用导出更高像素宣称可读性达标。本批没有扩大为业务功能开发。

需要总控根据这些事实决定是否接受本次真实局部，或调整任务单构图范围；这不属于产品失败或功能修复请求。本轮文件数、尺寸、无损格式、真实运行与散列校验通过，**完整 C 视觉验收未通过**。

## 复现与校验

需要项目依赖以及 Playwright、Sharp、JSZip、Chrome；延用上层 `runtime.cjs` 依赖查找器，可用 `PORTFOLIO_NODE_MODULES` 指向独立工具依赖目录。所有交付引用均为相对路径，没有外站热链或硬编码本机绝对路径。

1. 在隔离目录检出/解包拍摄代码 SHA，安装项目依赖，运行 `npm run dev -- --port 5187 --strictPort`。不得用原工作区未提交代码替换锁定基线。
2. 在素材所在仓库根运行 `node docs/portfolio-assets/detail-v2/make-samples.cjs`。
3. 运行 `node docs/portfolio-assets/detail-v2/capture.cjs`，仅连接该隔离服务；可用 `PORTFOLIO_APP_URL` 更改地址。
4. 运行 `node docs/portfolio-assets/detail-v2/render.cjs`，按保存的 CSS 坐标与 DPR2 取真实局部，等比导出无损图。
5. 运行 `node docs/portfolio-assets/detail-v2/verify.cjs`，核对九个文件尺寸、VP8L 无损编码和三张真实 JPEG，生成目标宽度 QA 与 manifest。

源截图与执行记录在 `sources/`；成品图不包含文案覆盖。字体采用 Windows 微软雅黑，浏览器与字体版本不同可能改变精确像素，接入以提交内的成品及散列为准。窄屏截图不构成手机真机兼容性验收。共享目录权限、线上匿名统计、生产数据库、部署和账号未测试或修改；本地处理指文件内容，不能描述成完全无任何网络请求。
