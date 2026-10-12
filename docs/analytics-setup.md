# PixelFlow 统计系统部署与口径

## 已实现范围

正式产品为 `pixelflow-image-tools`。前端采集访问、工具进入、图片导入、图片处理开始/结束、检测结果、复制/导出/下载、目录创建开始/结束。匿名编号持久化，30 分钟无活动后生成新会话。采集仅启用于正式域名，排除后台与预览部署。图片、文件名、路径、表格内容均不上传。

事件经 `/api/events` 校验、限流、去重写入 D1。后台 `/admin` 通过密码登录，查询接口使用签名 HttpOnly Cookie，8 小时过期。未配置后台密钥时拒绝查询。不要把密码或 Cloudflare API Token 放到 VITE 环境变量。

## Cloudflare 配置

已有账户，不需另购服务器。API Token 应限定到账户 `4a8a917a1d515000fae113807a66c877`，具备 D1 编辑、Cloudflare Pages 编辑、Workers Scripts 编辑及 Analytics 读取。把 Token 保存在根目录 `.env.local` 的 `CLOUDFLARE_API_TOKEN`，不要提交 Git 或发送到聊天。

1. 运行 `node scripts/cloudflare-analytics.mjs check` 验证权限。
2. 运行 `node scripts/cloudflare-analytics.mjs setup` 创建/复用 `pixelflow-analytics`，初始化表，并绑定生产环境。此步骤会新增 D1 资源与生产密钥，不删除原有配置。
3. 运行 `node scripts/cloudflare-analytics.mjs deploy` 构建并部署 Pages 和定时 Worker。无需再次 setup。密码保存在本机 `analytics-admin.local.txt`，不输出到日志。
4. 打开正式站点 `/admin` 登录；未启用埋点之前的业务数据不能补算。

部署脚本使用当前机器的 pnpm 路径；其他电脑可通过 `PIXELFLOW_PNPM` 指定。配置文件、密码文件、本地运行状态均已被 Git 忽略。仓库保留 example 配置以便复现；真实 `wrangler.jsonc` 需在部署机生成。

Git 自动部署：生产环境应保持 D1 的 DB 绑定、ADMIN_PASSWORD、AUTH_SECRET、ANALYTICS_HOST，以及用于归档的 CF_ACCOUNT_ID、CLOUDFLARE_API_TOKEN。预览环境不要绑定生产数据库。控制台直接拖拽静态文件不包含 Functions，应使用 Git 构建或 Wrangler 部署。

## 验证及本地预览

日常查看统计可双击根目录的 `启动统计预览.cmd`，或运行 `npm run analytics:preview`，然后打开 `http://127.0.0.1:8788/admin`。该预览仅绑定本机地址，使用原后台密码登录，查询同一份线上数据，不使用本地测试数据库，也不采集本地产品事件。电脑重启后需要再次启动。服务需要网络来读取线上统计；本地静态页面可以直接加载。

运行 `npm run test:analytics`、`npm run typecheck:analytics` 和 `npm run build`。本地联调时复制 `wrangler.example.jsonc` 到 `wrangler.jsonc`，用本地测试 UUID 配置 DB，设置 `.dev.vars` 中的 ADMIN_PASSWORD、AUTH_SECRET 与 ANALYTICS_HOST=localhost。使用 Wrangler 初始化本地数据库，启动 `wrangler pages dev dist`。前端在本地默认不采集；可用验证脚本直接提交测试事件。本地数据库不会写入线上。

测试人员可在正式站点浏览器控制台设置 `localStorage.setItem('pixelflow.analytics.disabled','1')` 排除自己的后续采集；删除该键可恢复。关闭采集时，待发送的事件不会继续提交。

## 长期累计与日期

- 按北京时间自然日统计。任务、导出、图片数量为操作次数，不是跨任务不重复文件数。
- 新建主目录和子目录独立计数。已有子目录不增加新建数；部分创建后失败仍保留实际创建数量。
- 匿名人数按浏览器随机编号去重；更换设备、浏览器或清除本地数据可能生成新编号。每日人数不能相加为累计人数。
- 分组处理中断时将未尝试的图片计入 pending，不算失败；进程直接关闭可能只有开始事件，没有结束事件。
- 导出统计到复制成功或触发浏览器下载，不代表文件最终保存成功。
- 检测计数在检测工具展示新任务结果时记录；切换工具或重复渲染不重复增加。
- 后台在 D1 内汇总查询原始事件，避免将全量明细传到 Worker。每天覆盖重建每日汇总作为长期归档，第一版不自动删除原始事件。以后清理前必须完善汇总读取和匿名人数保留，并完成备份。
- 后台显示全局统计起始时间和最近入库时间；空数据不意味着历史业务量为零。

## Cloudflare 历史归档

Worker 每日北京时间 03:15 汇总并重拉前 3 个完整自然日；每个日期、来源、指标是唯一键，覆盖更新而非累加。按正式 requestHost 过滤 Web Analytics，与自建数据分别保存。后台密码登录后可以调用 `/api/admin/archive?days=30`（POST）补回 30 天；每次最多 31 天；可用 offset 参数跳过最近若干天分段补录更早数据，不能补回超出 Cloudflare 保留期的数据。

2026-10-10 已验证正式站点 GraphQL 查询、D1 读写及后台登录，线上已部署。归档使用项目已有站点标识与正式域名过滤。GraphQL 错误会记录归档失败，不会伪造为零；统计可能有 Cloudflare 采样误差。

Cloudflare 历史数据展示所选范围内的归档累计值与每日明细，不与新自建访问量直接相加，也不能补回历史匿名用户、图片处理或目录数量。后台给出来源和归档状态。

## 运维

每天检查入库时间和归档状态，定期备份 D1。迁移 SQL 为非删除式、可重复执行。签名密钥轮换会使现有后台会话失效。业务采集是浏览器上报的观测值，具备限流和白名单但不能完全防止伪造，不用于收费或审计。
