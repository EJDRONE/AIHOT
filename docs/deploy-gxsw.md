# 部署 news-worker（广西固废情报站）

本仓库部署为 **worker-only** 引擎：一个常驻容器（news-worker）+ 两个一次性容器（db-gate、setup），
与平台（guangxi-solid-waste-map）同机，共用其 PostgreSQL 实例（独立 `aihot` 库），无对外端口。
架构与决策见 [CONSENSUS.md](CONSENSUS.md)；平台侧两个 API 端点见 [engine-platform-contract.md](engine-platform-contract.md)。

## 前置

- 部署机：192.168.103.22（平台已运行，compose 项目名 `gswm`）
- Docker 与 Git（平台机已具备）
- 密钥：DeepSeek API key（平台 `deploy/env` 的 `Deepseek_API_Token`，LLM 与 Search 共用）
- 平台侧已实现契约端点（`GET /api/v1/engine/companies`、`POST /api/v1/engine/articles`）并生成 `ENGINE_API_TOKEN`

## 步骤（在部署机上）

```bash
# 1. 取代码
git clone -b main git@github.com:EJDRONE/AIHOT.git gxsw-news && cd gxsw-news

# 2. 配置
cp .env.example .env && $EDITOR .env
#   必填：ADMIN_PASSWORD、SESSION_SECRET、IMG_PROXY_SIGN_SECRET（随机串）
#         LLM_API_KEY=<Deepseek_API_Token>、LLM_MODEL=deepseek-v4-flash
#         LLM_BASE_URL=https://api.deepseek.com/v1、LLM_EXTRA_JSON={"thinking":{"type":"disabled"}}
#   平台：PLATFORM_API_BASE=<平台 api 容器地址>、PLATFORM_API_TOKEN=<ENGINE_API_TOKEN>
#         AIHOT_DATABASE_URL=postgres://aihot:<随机>@db:5432/aihot
#   开阀：COLLECT_ENABLED=true、MODEL_CALLS_ENABLED=true、PATROL_ENABLED=true、PLATFORM_PUSH_ENABLED=true

# 3. 在平台库实例里建独立库与账号（一次性；密码与 .env 里一致）
docker exec -it gswm-db-1 psql -U waste -d waste \
  -c "CREATE ROLE aihot LOGIN PASSWORD '<随机>';" \
  -c "CREATE DATABASE aihot OWNER aihot;"

# 4. 起栈（首次含构建镜像）
docker compose -f deploy/compose.worker.yml up -d --build
docker compose -f deploy/compose.worker.yml logs -f news-worker
```

## 首启自检

1. `docker compose -f deploy/compose.worker.yml logs setup` —— 迁移与信源导入成功退出；
   `sources` 表应有 19 条（14 层1信源默认 `enabled=false` 待验证选择器 + 5 条巡检 external 信源）。
2. worker 日志出现 `worker started`；约一分钟后 `job_runs` 开始有记录：
   `docker exec -it gswm-db-1 psql -U aihot -d aihot -c "SELECT job, state, started_at FROM job_runs ORDER BY id DESC LIMIT 12;"`
3. 手动触发一轮处罚巡检验证（不等 06:30）：
   ```bash
   docker compose -f deploy/compose.worker.yml exec news-worker node -e \
     "import('./modules/news-patrol/backend/patrol.ts').then(m => m.runPatrolLine('penalty')).then(r => console.log(r))"
   ```
   `patrol_runs` 应有一条 `error IS NULL` 的记录，`articles` 里出现 `source_id='patrol-penalty'` 的新条目。
4. 层1信源验证：逐个打开列表页确认选择器后，把 `industry/sources.json` 里对应项补齐
   `itemSelector/titleSelector/linkSelector` 并 `enabled: true`，然后
   `docker compose -f deploy/compose.worker.yml exec news-worker node scripts/seed.ts`（只补不覆盖）。
5. 测试与冒烟（在能连数据库的环境跑过再上线）：
   ```bash
   npm run typecheck
   DATABASE_URL=postgres://aihot:<密码>@<库主机>:5432/aihot_test npm test
   ```

## 日常运维

- 升级：`git pull && docker compose -f deploy/compose.worker.yml up -d --build`（setup 会自动补新迁移）。
- 看巡检与推送对账：
  ```sql
  SELECT line, queries, hits, fetched, ingested, error, started_at FROM patrol_runs ORDER BY id DESC LIMIT 10;
  SELECT status, count(*) FROM patrol_pushes GROUP BY status;
  ```
- 成本：Search/Fetch 各约 5 元/千次成功请求；处罚线日轮约 129 次查询，可用 `PATROL_MAX_QUERIES/PATROL_MAX_FETCHES` 压。
- 停推送不断采集：`.env` 里 `PLATFORM_PUSH_ENABLED=false` 后 `up -d` 重启；反之亦然。
- 回溯起点改动：`PATROL_BACKFILL_FROM`（只影响尚无成功记录的线路）。

## 已知边界

- 层1的 14 个盯梢信源交付时 `enabled=false`（选择器未逐站验证）；上线初期新闻覆盖主要靠层2巡检，
  验证一个开一个。
- 门槛（industry/selection.ts）是偏宽的初始值：按 docs/selection.md 用真实样本（.data/gold.jsonl）
  跑 `scripts/eval-selection.ts` 校准后再收紧。
- 服务器 PG 不对开发机开放端口：`npm test` 需在部署机或可达数据库的环境执行。
