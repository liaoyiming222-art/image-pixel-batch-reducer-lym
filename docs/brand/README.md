# PixelFlow 品牌与展示素材

更新：2026-10-27。图标采用用户确认的 A「精致轻立体」。本批基于 `e410603`，保留原工具功能。

## 唯一品牌母版

[`public/pixelflow.svg`](../../public/pixelflow.svg) 是可维护 SVG 母版，导航、浏览器图标和 README 共用同一文件。三个像素单元汇入画幅，保留靛紫识别，以瓷白表面和克制边缘光表达轻厚度。不要在各入口另画不同图形。

## 正式截图

首页于 2026-10-26 拍摄；功能与手机截图于 2026-10-27 从同一品牌构建实际操作取得。图片保留真实界面和结果；局部图片只改变取景。手机图来自真实窄屏布局，不表示已完成真机兼容性验收。

| 文件 | 实际像素 | 用途 |
|---|---|---|
| [pixelflow-home.png](../images/pixelflow-home.png) | 1439 × 1050 | 首页总览，README 首图，保留真实导航与四项工具。 |
| [pixelflow-cover.png](../images/pixelflow-cover.png) | 1168 × 540 | 首页标题与四项工具取景，用于宽封面。 |
| [pixelflow-compression.jpg](../images/pixelflow-compression.jpg) | 1414 × 990 | 快速压缩的实际设置、队列与两张 PNG 转 JPG 结果，README 功能图。 |
| [pixelflow-compression-focus.jpg](../images/pixelflow-compression-focus.jpg) | 1112 × 496 | 同一实际压缩状态的设置与结果局部，用于作品集详情。 |
| [pixelflow-compression-mobile.jpg](../images/pixelflow-compression-mobile.jpg) | 351 × 400 | 真实窄屏队列结果局部，用于手机构图。 |
| [pixelflow-finder-results.jpg](../images/pixelflow-finder-results.jpg) | 1112 × 397 | 真实查找结果：三项图名中两项找到、一项未找到，README 功能图。 |
| [pixelflow-finder-mobile.jpg](../images/pixelflow-finder-mobile.jpg) | 351 × 622 | 真实窄屏图名、目录与查找结果局部，用于手机详情。 |
| [pixelflow-home-mobile.jpg](../images/pixelflow-home-mobile.jpg) | 375 × 1876 | 真实 375px 宽首页全页，保留四工具重排及完整说明。 |
| [pixelflow-cover-mobile.jpg](../images/pixelflow-cover-mobile.jpg) | 354 × 447 | 真实窄屏首页标题与首项工具取景，用于手机封面。 |

README 选用完整首页、压缩界面与查找结果局部。其他取景用于作品集宽窄模块，不必在 README 重复铺陈。

## 演示内容与复现

压缩输入沿用灵犀项目公开演示图 `public/images/living-room.png`、`kitchen.png`，重命名为“室内场景.png”“厨房空间.png”。在快速图片压缩选择“仅转格式”并实际处理，得到 263.4 KB 和 193.7 KB 两个 JPG，尺寸均为 1024 × 1024。此结果只适用于这两个样本，不作为平均性能宣传。

查找演示使用只包含上述两张图的独立目录，文字清单为“室内场景.png”“厨房空间.png”“待补充封面.png”，实际得到两项找到、一项未找到。未读取真实共享目录或个人图片，也未验证真实共享权限、线上统计或全部工具功能。

逐文件尺寸、SHA-256、用途及源版本见 [`source-notes.json`](source-notes.json)。作品集集成应复制确定版本的选用素材；源项目继续维护正式资产。
