# PixelFlow 详情素材 v2 · r1

原任务 `detail-v2-20261104-pixelflow`；补修 `detail-v2-20261104-pixelflow-r1`。产品 ID `pixelflow`。2026-11-04 制作。

仓库：[image-pixel-batch-reducer-lym](https://github.com/liaoyiming222-art/image-pixel-batch-reducer-lym)。分支：`codex/detail-v2-20261104-pixelflow`。拍摄代码：`530bdd6ebf3e42db353838db6eb5cfeabf004ece`。素材父提交：`89a31514b87ef5e7a28d1894d62760ca74d5595f`，原版继续保留在 Git 历史。用户原有业务改动、原分支及暂存区均保留。

按总控更新的清单交付 **11 张成品**：4 张桌面逐字节保留，5 张手机局部补修，新增真实处理规则及打包入口两张。七张手机图均为 900px 宽、原生裁区自然高度，无 contain 补边或比例拉伸。每张真实尺寸、SHA-256、中文 alt、来源和裁区见 [manifest.json](manifest.json)；本轮自然高度与字级检查见 [verification-r1.json](qa/verification-r1.json)。

成品文件均以 `pixelflow-detail-` 开头、`.webp` 结尾：

| 场景 | 桌面 | 手机局部 |
|---|---|---|
| 处理 | process-desktop | process-mobile、process-rule-mobile、process-download-mobile |
| 找图 | find-desktop | find-mobile |
| 比例 | ratios-desktop | ratios-mobile |
| 目录 | folders-desktop | folders-input-mobile、folders-preview-mobile |

## 真实操作与来源

继续使用本批自制静物插画输入及 SVG 原稿（`samples/`）：1200×1200、1600×900、900×1200。作者为 Codex，原创陶瓶、茶杯、纸张与果实插画，无外部媒体、隐私内容或生成服务。这些是工具输入，不是 PixelFlow 生成结果，也不冒充照片。

在原隔离代码目录启动锁定版本，使用独立无头 Chrome 新进程与上下文，没有连接或覆盖用户浏览器会话。相同输入重新实际完成仅转格式；`outputs/converted-r1.zip` 内三张 JPEG 与首轮实际下载输出逐字节相同。不将样本压缩率当平均性能。

同一虚构“静物项目”目录只含 square、wide 两张输入，清单加入不存在的 missing 图，重新检索实际得到两项找到、一项未找到，未执行查图下载。实际形成 1:1、16:9、3:4 三个文字组，各一张，没有缩略图或折叠控件。

目录原名“方图、横图、竖图”，前缀“静物项目-”，自动编号勾选、起始编号 1、编号位数 3，预览“静物项目-001-方图”等。输入和预览来自同一设置状态。预览通过真实横滚取最终名称列，保留未选目标提示及创建入口；未选择目标、未执行创建。

## 本轮取景与可读性

七张手机图使用原生布局连续区域，原生浏览器 zoom 保持 100%，视口 300/270 CSS px，DPR3 仅改善栅格质量。字号提升来自更紧的实际裁区，未修改 DOM/CSS、文字或结果，没有拼装新界面。

- 结果只取第一张文件名、元信息、完成状态与实际 JPG 结果，移除队列工具栏。
- 规则与打包入口是同次状态的两个独立真实按钮局部，网页顺序说明，不合成 UI。
- 查图保留连续三项文件名、完整相对路径与找到/未找到状态。
- 分组保留三个连续文字组的比例、数量及完整尺寸；右侧次要下载按钮和误差标签尾部不在核心裁区内，不声称完整展示次要控件。
- 目录输入来自真正窄布局，完整保留原名及实际启用设置，没有桌面右侧半列；预览明确为实际横滚后的最终名称列。

全部 288/358px 校样已查看。关键文字按真实字号和裁区换算，在 288px 下至少约 14px，358px 下更大；数值、自然尺寸及 DOM 度量见 `qa/verification-r1.json` 和 `sources/r1/capture.json`。成品应完整自然高度展示，不使用 cover 裁切。源素材制作检查通过，最终网页视觉复验仍由总控完成；四张桌面是保留的总览，不宣称最终页面字号已经验收。

## 复现与边界

需要 Chrome、项目依赖以及 Playwright/Sharp/JSZip；依赖查找延用上层 `runtime.cjs`，可设置 `PORTFOLIO_NODE_MODULES`。所有媒体引用相对路径，无硬编码本机路径或外站热链。

1. 在隔离目录解包/检出拍摄代码 SHA，运行 `npm run dev -- --port 5187 --strictPort`。
2. 使用随附原始输入，运行 `node docs/portfolio-assets/detail-v2/capture.cjs`（r1 入口；对应 `capture-r1.cjs`），可用 `PORTFOLIO_APP_URL` 指定服务。
3. 运行 `node docs/portfolio-assets/detail-v2/render.cjs`（对应 `render-r1.cjs`），仅按原生比例生成七张手机图，不改桌面。
4. 运行 `node docs/portfolio-assets/detail-v2/verify.cjs`，核对 11 图、无损编码、桌面不变及三张真实 JPEG，并更新校样与 manifest。

原始证据继续保留；本轮截图、裁区、字号在 `sources/r1/`。没有真机兼容性验收、真实共享权限、线上匿名统计或数据库测试。未改业务、部署或账号权限；文件本地处理不表示完全没有网络请求。目录始终仅预览。源素材提交 SHA 在最终回执给出，不循环写入本提交文件。
