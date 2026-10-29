// 运维薄 HTTP（docs/news-engine-ops-plan.md §4，契约 v2）：平台 engine_ops 白名单
// 代理的唯一上游。仅当 ENGINE_OPS_TOKEN 配置时由 main.ts 拉起（动态 import），
// 与 worker 同进程——worker 重启窗口期运维通道短暂不可用（方案已接受）。
//
// 路由 = 上游函数/模块表的透传层（P0 只读批）：
//   GET /ops/runs           ← packages/backend admin/runs runsOverview()
//   GET /ops/models?days=   ← admin/models modelsOverview(days)
//   GET /ops/patrol/runs    ← news-patrol patrol_runs 台账（部署文档「看巡检对账」面板化）
//   GET /ops/patrol/pushes  ← patrol_pushes 推送账本（status 过滤）
// 白名单即契约：未登记路径一律 404；鉴权 X-Engine-Ops-Token 常数时间比较。
// fastify 是 apps/api 生产依赖，随 monorepo 镜像在根 node_modules（本包不重复声明）。
import { createHash, timingSafeEqual } from "node:crypto";
import Fastify from "fastify";

import { modelsOverview } from "@aihot/backend/admin/models";
import { runsOverview } from "@aihot/backend/admin/runs";
import { sql } from "@aihot/backend/db";

const OPS_PORT = Number(process.env.ENGINE_OPS_PORT || 8100);
const PATROL_STATUSES = new Set(["pending", "sent", "rejected"]);

/** 长度不定的常数时间比较：对两侧先取 sha256 再 timingSafeEqual。 */
function safeEqual(a: string, b: string): boolean {
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(a), digest(b));
}

function clampLimit(raw: unknown): number {
  const n = Number(raw) || 50;
  return Math.min(200, Math.max(1, n));
}

export async function buildOpsServer() {
  const app = Fastify({ logger: false });
  app.addHook("onRequest", async (req, reply) => {
    const given = String(req.headers["x-engine-ops-token"] ?? "");
    if (!safeEqual(given, process.env.ENGINE_OPS_TOKEN ?? "")) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.get("/ops/runs", async () => runsOverview());

  app.get("/ops/models", async (req) => {
    const days = Math.min(90, Number((req.query as { days?: string }).days) || 7);
    return modelsOverview(days);
  });

  app.get("/ops/patrol/runs", async (req) => {
    const limit = clampLimit((req.query as { limit?: string }).limit);
    const runs = await sql`
      SELECT id, line, window_start, window_end, queries, hits, fetched,
             ingested, skipped, error, started_at, finished_at
      FROM patrol_runs ORDER BY id DESC LIMIT ${limit}`;
    return { runs };
  });

  app.get("/ops/patrol/pushes", async (req) => {
    const q = req.query as { status?: string; limit?: string };
    const limit = clampLimit(q.limit);
    const status = PATROL_STATUSES.has(q.status ?? "") ? q.status! : null;
    const rows = status
      ? await sql`
          SELECT article_id, status, entities, platform_id, attempts,
                 last_error, pushed_at, created_at, updated_at
          FROM patrol_pushes WHERE status = ${status}
          ORDER BY updated_at DESC LIMIT ${limit}`
      : await sql`
          SELECT article_id, status, entities, platform_id, attempts,
                 last_error, pushed_at, created_at, updated_at
          FROM patrol_pushes ORDER BY updated_at DESC LIMIT ${limit}`;
    return { pushes: rows };
  });

  return app;
}

export async function startOpsServer(): Promise<void> {
  const app = await buildOpsServer();
  await app.listen({ port: OPS_PORT, host: "0.0.0.0" });
  console.log(JSON.stringify({ level: "info", msg: "ops server started", port: OPS_PORT }));
}
