# 引擎 ↔ 平台 API 契约（v2）

> 本契约是 news-worker（AIHOT fork，本仓库）与 guangxi-solid-waste-map 平台
> FastAPI 之间唯一的集成面。v1 = 数据面两端点（§1/§2）；v2 新增运维面白名单通道（§4，
> docs/news-engine-ops-plan.md）。铁律措辞：数据面两端点 + 运维面白名单通道，数据库零交叉。
> 平台侧端点由平台仓库的单独任务实现；字段变更须双方仓库同步修改并更新本文件版本号。

- 引擎侧环境变量：`PLATFORM_API_BASE`（如 `http://<平台主机>:8000`）、
  `PLATFORM_API_TOKEN`。
- 平台侧环境变量（建议）：`ENGINE_API_TOKEN`。两边 token 相同，静态值，
  部署时生成随机串。
- 鉴权：所有请求带 `X-Engine-Token: <token>`。
- 内网 HTTP；量级低（日均几十条推送、每 15 分钟一次名单拉取）。

## 1. 拉取企业名单（引擎巡检种子同步）

```
GET /api/v1/engine/companies?updated_since=2026-10-01T00:00:00+08:00
Header: X-Engine-Token: <token>
```

`updated_since` 可选，增量拉取。只返回启用/有效企业；量级 ≤500，无需分页。

```
200 →
{
  "companies": [
    {
      "id": "SS-GX-006",             // 平台企业主键，引擎原样保存
      "name": "广西北港新材料有限公司（不锈钢）",
      "city": "北海市",                // 带市字
      "county": "铁山港区",
      "address": "铁山港临海工业园区四号路与七号路附近",
      "category": "冶炼渣",            // 五类中文名
      "category_key": "smelting_slag",
      "waste_type_cn": "长短流程结合冶炼废渣",
      "lon": 109.52, "lat": 21.52,
      "updated_at": "2026-10-24T16:24:55+08:00"
    }
  ]
}

401 → {"error": "unauthorized"}
```

引擎行为：企业全名去掉括号后缀后用于巡查询词；`category_key` 决定
类别词；首次种子来自 xlsx，此接口用于定期刷新。

## 2. 接收精选成品

```
POST /api/v1/engine/articles
Header: X-Engine-Token: <token>
Content-Type: application/json
```

```jsonc
{
  "engine": "gxsw-news-engine",
  "article": {
    "id": "<引擎条目 UUID>",            // 幂等键之一
    "url": "<规范化原文 URL>",           // 幂等键之二，任一重复即 409
    "title": "<中文标题（引擎写作产物）>",
    "summary": "<中文摘要（引擎写作产物）>",
    "language": "zh",
    "published_at": "2026-10-20T09:30:00+08:00",  // 可空
    "first_seen_at": "2026-10-27T06:00:00+08:00",
    "source": {
      "id": "<引擎信源 id>",
      "name": "广西生态环境厅",
      "tier": "T1",                     // T1=官方一手 / T2=媒体
      "line": "penalty"                 // penalty / eia / industry / patrol
    },
    "event": {                          // 引擎聚簇产物，可空（未聚簇）
      "id": "<事件 UUID>",
      "title": "广西某锰业电解锰渣库渗漏被处罚",
      "report_count": 3
    }
  },
  "entities": [
    {
      "type": "penalty",               // company / project / penalty
      "name": "广西某锰业有限公司",
      "city": "崇左市",
      "county": "",
      "address": "",
      "category": "锰渣",               // 五类之一；无法判定为空串
      "penalty": {                     // 仅 type=penalty 时存在
        "decision": "罚款",
        "amount_yuan": 420000,          // 数字或 null（未披露）
        "doc_no": "崇环罚〔2026〕XX号",
        "date": "2026-10-15",
        "authority": "崇左市生态环境局"
      },
      "year": "", "month": "",         // 仅固废数量相关实体填
      "amount": "", "unit": "",
      "quantity_basis": "",            // direct_waste / product_capacity_proxy
      "publish_date": "2026-10-16",
      "tags": ["渗漏", "堆场"],         // 用地/堆场/扩产/事故/综合利用…
      "note": "原文佐证摘录",
      "company_ids": ["SS-GX-006"]    // 引擎企业名单命中时附上（平台主键），未命中为 []
    }
  ]
}
```

响应：

| 状态 | 含义 | 引擎行为 |
|---|---|---|
| 200 `{"status":"stored","id":"..."}` | 入库成功 | 记录平台 id，不再推 |
| 409 `{"status":"duplicate","id":"..."}` | 幂等命中（url 或 id 已存在） | 视为成功 |
| 401 | token 错 | 告警，不重试 |
| 422 | 实体校验失败 | 不重试，记日志人工看 |
| 5xx / 超时 | 平台侧异常 | 指数退避重试 |

平台行为要求：入库为 `pending` 状态，进平台现有审核队列（五页签 UI 直接
可用）；URL 需规范化后比对幂等；端点可重入。

## 3. 字段口径备注

- 五类 `category_key`：`red_mud` / `smelting_slag` / `manganese_slag` /
  `green_mud` / `white_mud`；中文名：赤泥 / 冶炼渣 / 锰渣 / 绿泥 / 白泥。
  绿泥=制糖滤泥，白泥=造纸碱回收苛化白泥。
- `quantity_basis`：`direct_waste`（固废产生量）与
  `product_capacity_proxy`（产品产能代理值）沿用平台旧 discovery 管线语义；
  代理值必须在 `note` 开头注明「项目处理/利用规模，非产生量：」。
- `line` 标识信源/查询的业务线：penalty=处罚线、eia=环评项目用地线、
  industry=企业动态行业线、patrol=主题级库外巡检。

## 4. 运维通道（v2 新增）

平台 → 引擎方向的内网 HTTP（news-worker 同进程 Fastify，`:8100` 仅容器网内可达，
不映射宿主）。鉴权 `X-Engine-Ops-Token`（env `ENGINE_OPS_TOKEN`，常数时间比较；
**未配置则不启动**，此时全部运维动作回退 CLI/SQL）。平台侧经白名单代理
`/api/v1/engine-ops/*`（admin 角色）访问，代理不接受任意路径拼接——**白名单即契约，
未登记路径一律 404**。

P0 只读批（第一批放开）：

| 引擎路径 | 上游 | 说明 |
|---|---|---|
| `GET /ops/runs` | `admin/runs runsOverview()` | 管线卡件/失败/心跳/队列积压总览 |
| `GET /ops/models?days=` | `admin/models modelsOverview(days≤90)` | 各能力步模型与质量/耗时/token（默认 7 天） |
| `GET /ops/patrol/runs?limit=` | `patrol_runs` 表 | 巡检轮次台账（line/窗口/queries/hits/fetched/ingested/skipped/error/起止） |
| `GET /ops/patrol/pushes?status=&limit=` | `patrol_pushes` 表 | 推送账本（article_id/status=pending|sent|rejected/entities/platform_id/attempts/last_error/pushed_at） |

- 响应统一 JSON；错误语义对齐上游（404 未命中 / 422 参数 / 5xx 引擎侧异常）。
- 操作类动作（runs 三个 POST、selectbench、sources、模型切换）**未登记即 404**，
  随 P1/P2 批次升契约版本逐个放开；放开前置与批次见 news-engine-ops-plan.md §8。
- GET 不记审计；操作类由平台侧代理落 `audit_log`（action 前缀 `engine_ops.`），
  引擎侧上游函数收固定 actor `platform-proxy`（P1 起接入）。
- 数据库零交叉、数据面两端点行为均不受本通道影响。
