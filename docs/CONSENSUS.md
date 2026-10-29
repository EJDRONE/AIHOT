# 共识方案 —— 广西固废新闻检索引擎（AIHOT fork）

> 2026-10-27 与使用者确认的实施共识。本文档是本仓库改造的唯一需求基准；
> 平台侧契约见同目录 `engine-platform-contract.md`（交给平台仓库的单独任务实现）。

## 1. 背景与定位

- 使用者要监测广西涉及**赤泥、冶炼渣、锰渣、绿泥、白泥**五类工业固废的
  企业、项目、环保处罚、土地占用情况，为环保管理部门提供治理依据。
- 本仓库是 [KKKKhazix/AIHOT](https://github.com/KKKKhazix/AIHOT) 的 fork，
  定位为**独立的新闻检索引擎（news-worker）**：采集信源、判重、预筛、
  双重评分、中文写作与实体抽取、事件聚簇，把精选成品推送给
  [guangxi-solid-waste-map](https://github.com/Yufang-Liu/guangxi-solid-waste-map)
  平台（FastAPI + PostgreSQL 17，部署于 192.168.103.22）。
- 平台现有 Python discovery 管线**先不动**；引擎跑 2~4 周产出效果后再评估去留。
- AIHOT 自带的网站（apps/web）与 API 服务（apps/api）**代码保留但不部署**
  （保持上游可合并），运营操作用仓库自带 CLI。

## 2. 架构

```
┌─ 192.168.103.22 ──────────────────────────────────────────────┐
│  平台栈（guangxi-solid-waste-map，现有）                        │
│  ┌──────────┐   ┌─────────────┐   ┌──────────────────────┐     │
│  │ frontend │──▶│ FastAPI :8000│──▶│ PostgreSQL 17         │     │
│  └──────────┘   │  +2个新端点   │   │  ├ 平台库（现有）       │     │
│                 └─────▲───────┘   │  └ aihot 库（引擎内部）  │     │
│            ①拉企业名单 │ ②推精选成品           │共实例          │
│                       │                      │各连各的库        │
│  ┌────────────────────┴──────────────────────┴──────────┐     │
│  │ news-worker 容器（AIHOT 镜像，仅 worker 进程）          │     │
│  │  层1 信源盯梢：RSS/网页列表（19校准信源+处罚线）          │     │
│  │  层2 DeepSeek 巡检：Search → Fetch → 内部 ingest        │     │
│  │  管线：判重→预筛→双重评分→写作+实体抽取→事件聚簇          │     │
│  └───────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────┘
```

**集成铁律**：两边只通过两个 HTTP 端点交互（拉名单、推成品），数据库零交叉。
`aihot` 库是引擎私有工作区，平台不读不写；引擎重建/升级不影响平台数据。

## 3. 决策清单

| # | 主题 | 决策 |
|---|---|---|
| 1 | 形态 | worker-only：只部署 `news-worker` 一个容器；apps/api、apps/web 保留代码不部署 |
| 2 | 管线 | 六种信源 → 判重 → 预筛 → 双重评分 → 中文写作+实体抽取 → 事件聚簇；**不出日报/周报/月报**（EDITION 关闭） |
| 3 | 层1 信源 | 旧栈校准的 19 信源（平台 `discovery_sources.py` 平移）+ 处罚线新增（信用中国·广西、生态环境厅处罚公示、生态环境部督察）；有稳定列表页的配 RSS/网页列表，其余转层2 `site:` 查询 |
| 4 | 层2 巡检 | DeepSeek Search 巡检模块：**处罚每日**（企业名+处罚词，`after:昨日`）、**企业动态/项目每周**（含用地/堆场词）；主题级库外发现每周约 15 条 |
| 5 | 查询模板 | 企业名去括号后缀 + 五类类别词 + 类型词；模板放 `industry/` 可改配置 |
| 6 | 种子企业 | 首阶段 xlsx 导入（129 家，`D:\Ecode\exports\广西固废企业信息_129家_2026-10-27.xlsx`）；后续经平台 API 定期刷新 |
| 7 | 回溯深度 | 统一 3 个月（2026-08-01 起） |
| 8 | 分类口径 | 赤泥、冶炼渣、锰渣、绿泥（制糖滤泥）、白泥（造纸苛化白泥）；`category_key` 与平台一致（red_mud / smelting_slag / manganese_slag / green_mud / white_mud） |
| 9 | 实体抽取 | 对齐平台旧管线 schema（name/city/county/category/address/year/month/amount/unit/quantityBasis/publishDate/note）+ 处罚扩展（决定/金额/文号/日期/机关）；土地占用走标签 |
| 10 | 推送 | 精选通过即推（含实体+事件上下文），失败进重试队列指数退避；只推精选 |
| 11 | 模型 | 全流程单模型 `deepseek-v4-flash`，api.deepseek.com 原生接入（LLM_BASE_URL/LLM_MODEL），token 复用平台 `deploy/env` 的 `Deepseek_API_Token` |
| 12 | Search/Fetch | `POST /v1/tools/search`、`POST /v1/tools/fetch`，Bearer 鉴权；按成功请求计费（5 元/千次）；Search QPS 100 / Fetch 25 |
| 13 | 信源管理 | `industry/sources.json` 改后重部署；试抓/诊断/评分更正用自带 CLI；管理界面属平台侧后续需求 |
| 14 | 站名 | 广西固废情报站（仅用于日志与推送标识，无对外网站） |
| 15 | 成本预估 | 处罚线日轮约 0.5~1 元 Search 费 + Fetch 费；模型费另计；成功请求才计费 |

## 4. 实施清单（本仓库）

1. **`industry/`**：taxonomy 换五类；`sources.json` 换层1 信源（含 tier 与
   line=penalty/eia/industry 标签）；重写 `prompts/selection-score.md`
   （重要=涉五类企业的处罚/项目/用地/堆场事故；噪声示例）与写作+实体抽取
   提示词（平台 schema + 处罚扩展）；`selection.ts` 初始门槛；`wording.ts`。
2. **`site/`**：站名「广西固废情报站」；`models.ts` 全部指向
   `deepseek-v4-flash`；关闭 EDITION_TIMES。
3. **`modules/news-patrol/`**（新模块，挂 worker 的 SERVER_MODULES）：
   - DeepSeek Search/Fetch 客户端（预算、限流、重试）
   - 查询模板引擎（企业×类型矩阵 + 主题级库外查询，3 个月回溯窗）
   - 企业表 + xlsx 导入脚本 + 平台 API 同步任务
   - 巡检 pg-boss 定时任务（Search→Fetch→内部 ingest）
   - 精选完成后的平台推送任务（幂等、指数退避重试）
   - 模块自己的 `migrations/`
4. **`deploy/`**：worker-only compose（单容器；entrypoint 依次
   migrate → seed sources → 起 worker；DATABASE_URL 指平台 PG 实例的
   `aihot` 库；挂平台 compose 外部网络）；`.env.example` 补 `LLM_*`、
   `DEEPSEEK_SEARCH_*`、`PLATFORM_API_*`、`IMG_PROXY_SIGN_SECRET` 等。
5. **验证**：`npm run typecheck`；`npm test`（本地假服务，不访问外部）；
   一轮真实巡检的 10~20 条样本人工核验抽取质量；同步替换 `tests/` 里
   示例行业公司用例。
6. **文档**：本文件 + `engine-platform-contract.md` + 部署说明。

## 5. 边界外（另行安排）

- 平台侧两个端点（`GET /api/v1/engine/companies`、
  `POST /api/v1/engine/articles`）：**单独会话任务**，按
  `engine-platform-contract.md` 实现。
- 平台审核 UI 对 engine 推送记录的展示适配。
- 旧 Python discovery 管线的退役决策（跑 2~4 周后评估）。

### #14 运维通道（2026-10-29 增补，契约 v2）

平台侧「新闻优化」工作台（docs/news-engine-ops-plan.md，已拍板）需要引擎运维 UI，
引擎仍不起前端（#1 维持）：worker 同进程拉起 Fastify 运维薄 HTTP（`:8100`，仅
`ENGINE_OPS_TOKEN` 配置时启动），路由 = 上游 `admin/*` 函数与 news-patrol 两表的
透传层，白名单即契约（`engine-platform-contract.md` §4）。#13 的预留就此落地；
铁律措辞修订为「数据面两端点 + 运维面白名单通道，数据库零交叉」。

## 6. 安全阀与运行纪律（沿用上游规则）

- 开发与测试期保持关闭：`COLLECT_ENABLED`、`MODEL_CALLS_ENABLED`、
  `FEISHU_*_ENABLED`、`INDEXNOW_SUBMIT_ENABLED`；服务器部署时按需打开。
- 测试里推送一直关着，采集和模型调用只连本地假服务。
- 信源默认只展示摘要和原文链接（`site_fulltext` 关）；只有来源明确允许
  才打开全文。
- 不提交 `.env`、密钥和 `.data/`。
