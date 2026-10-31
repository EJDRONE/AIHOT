// 运维薄 HTTP（docs/news-engine-ops-plan.md §4，契约 v2）：平台 engine_ops 白名单
// 代理的唯一上游。仅当 ENGINE_OPS_TOKEN 配置时由 main.ts 拉起（动态 import），
// 与 worker 同进程——worker 重启窗口期运维通道短暂不可用（方案已接受）。
//
// 路由 = 上游函数/模块表的透传层（P0 只读批 + P1 调优闭环批）：
//   GET  /ops/runs                    ← admin/runs runsOverview()
//   GET  /ops/models?days=            ← admin/models modelsOverview(days)
//   GET  /ops/patrol/runs             ← news-patrol patrol_runs 台账（部署文档「看巡检对账」面板化）
//   GET  /ops/patrol/pushes           ← patrol_pushes 推送账本（status 过滤）
//   GET  /ops/selectbench[/:id]       ← admin/selectbench 列表/详情（详情支持 model/outcome/stratum/disagree 过滤）
//   POST /ops/selectbench/import      ← importSelectBenchRun(report,label,actor)
//   GET  /ops/sources[/:id]           ← admin/sources 列表/详情
//   PATCH /ops/sources/:id            ← updateSource({patch,version,reason},actor)——启停走 patch.enabled
//   POST /ops/sources/:id/preview     ← previewStoredSource(id)（试抓）
//   POST /ops/sources/:id/fetch       ← fetchNow(id,actor)（立即抓取）
//   POST /ops/runs/receipts/:id/release | /ops/runs/deliveries/:id/resolve | /ops/runs/processing/requeue
// 操作类一律以固定 actor=platform-proxy 进引擎自有 audit_log（方案 §3 双落审计的引擎侧）。
// 白名单即契约：未登记路径一律 404；鉴权 X-Engine-Ops-Token 常数时间比较。
// 错误语义对齐 apps/api adminHandler：ZodError/statusCode 400→400、code=conflict→409、其余 500。
// fastify 是 apps/api 生产依赖，随 monorepo 镜像在根 node_modules（本包不重复声明）。
import { createHash, timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { ZodError } from "zod";

import { modelsOverview } from "@aihot/backend/admin/models";
import { runsOverview, requeueFailedArticles } from "@aihot/backend/admin/runs";
import { importSelectBenchRun, listSelectBenchRuns, selectBenchRun } from "@aihot/backend/admin/selectbench";
import { fetchNow, listSources, previewStoredSource, sourceDetail, updateSource } from "@aihot/backend/admin/sources";
import { resolveDelivery } from "@aihot/backend/notify/deliver";
import { releaseReceipt } from "@aihot/backend/operations/recover";
import { sql } from "@aihot/backend/db";

const OPS_PORT = Number(process.env.ENGINE_OPS_PORT || 8100);
const PATROL_STATUSES = new Set(["pending", "sent", "rejected"]);
const PLATFORM_ACTOR = "platform-proxy";

/** 长度不定的常数时间比较：对两侧先取 sha256 再 timingSafeEqual。 */
function safeEqual(a: string, b: string): boolean {
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(a), digest(b));
}

function clampLimit(raw: unknown): number {
  const n = Number(raw) || 50;
  return Math.min(200, Math.max(1, n));
}

/** 上游抛错的语义映射（对齐 adminHandler）：400/409 保真，其余按 500 透出摘要。 */
function sendUpstreamError(err: unknown, reply: FastifyReply) {
  if (err instanceof ZodError) {
    return reply.code(400).send({ error: err.issues.map((i) => `${i.path.join(".") || "请求"}: ${i.message}`).join("; ").slice(0, 300) });
  }
  if ((err as { statusCode?: number }).statusCode === 400) {
    return reply.code(400).send({ error: String((err as Error).message).slice(0, 300) });
  }
  if ((err as { code?: string }).code === "conflict") {
    return reply.code(409).send({ error: (err as Error).message });
  }
  return reply.code(500).send({ error: String((err as Error).message).slice(0, 300) });
}

const body = <T = Record<string, unknown>>(req: FastifyRequest) => (req.body ?? {}) as T;
const param = (req: FastifyRequest, name: string) => (req.params as Record<string, string>)[name]!;
/** 上游返回 null（未命中）→ 404，与 GET 只读端点口径一致。 */
async function or404<T>(value: T | null, reply: FastifyReply) {
  if (value === null || value === undefined) return reply.code(404).send({ error: "not found" });
  return value;
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

  // ---- P1 调优闭环（docs/news-engine-ops-plan.md §8）：SelectBench / 信源 / 卡件处置 ----

  app.get("/ops/selectbench", async () => ({ runs: await listSelectBenchRuns() }));

  app.get("/ops/selectbench/:id", async (req, reply) => {
    const f = req.query as { model?: string; outcome?: string; stratum?: string; disagree?: string };
    try {
      return await or404(await selectBenchRun(param(req, "id"), {
        model: f.model, outcome: f.outcome, stratum: f.stratum, disagree: f.disagree === "1",
      }), reply);
    } catch (err) {
      return sendUpstreamError(err, reply);
    }
  });

  app.post("/ops/selectbench/import", async (req, reply) => {
    const b = body<{ label?: string; report: unknown }>(req);
    if (b.report === undefined || b.report === null) return reply.code(400).send({ error: "report 字段缺失" });
    try {
      return await importSelectBenchRun(b.report, String(b.label || "导入的对比运行"), PLATFORM_ACTOR);
    } catch (err) {
      return sendUpstreamError(err, reply);
    }
  });

  app.get("/ops/sources", async (req) => {
    const f = req.query as Record<string, string | undefined>;
    return listSources({
      q: f.q, kind: f.kind, health: f.health, mode: f.mode,
      enabled: f.enabled === "true" || f.enabled === "false" ? (f.enabled as "true" | "false") : undefined,
      page: Math.max(1, Number(f.page) || 1),
    });
  });

  app.get("/ops/sources/:id", async (req, reply) => {
    try {
      return await or404(await sourceDetail(param(req, "id")), reply);
    } catch (err) {
      return sendUpstreamError(err, reply);
    }
  });

  app.patch("/ops/sources/:id", async (req, reply) => {
    const b = body<{ patch?: unknown; version?: string; reason?: string }>(req);
    if (!b.version) return reply.code(400).send({ error: "version 字段缺失（乐观锁，取信源 updated_at）" });
    if (!b.patch || typeof b.patch !== "object") return reply.code(400).send({ error: "patch 字段缺失" });
    try {
      return await or404(await updateSource(param(req, "id"), { patch: b.patch, version: b.version, reason: b.reason }, PLATFORM_ACTOR), reply);
    } catch (err) {
      return sendUpstreamError(err, reply);
    }
  });

  app.post("/ops/sources/:id/preview", async (req, reply) => {
    try {
      return await or404(await previewStoredSource(param(req, "id")), reply);
    } catch (err) {
      return sendUpstreamError(err, reply);
    }
  });

  app.post("/ops/sources/:id/fetch", async (req, reply) => {
    try {
      return await or404(await fetchNow(param(req, "id"), PLATFORM_ACTOR), reply);
    } catch (err) {
      return sendUpstreamError(err, reply);
    }
  });

  app.post("/ops/runs/receipts/:id/release", async (req, reply) => {
    const b = body<{ billed?: boolean | null; note?: string }>(req);
    try {
      return await or404(await releaseReceipt(Number(param(req, "id")), { billed: b.billed ?? null, note: String(b.note ?? "") }, PLATFORM_ACTOR), reply);
    } catch (err) {
      return sendUpstreamError(err, reply);
    }
  });

  app.post("/ops/runs/deliveries/:id/resolve", async (req, reply) => {
    const b = body<{ outcome?: string; note?: string }>(req);
    if (b.outcome !== "sent" && b.outcome !== "drop" && b.outcome !== "resend") {
      return reply.code(400).send({ error: "outcome 仅支持 sent/drop/resend" });
    }
    try {
      return await or404(await resolveDelivery(Number(param(req, "id")), { outcome: b.outcome, note: String(b.note ?? "") }, PLATFORM_ACTOR), reply);
    } catch (err) {
      return sendUpstreamError(err, reply);
    }
  });

  app.post("/ops/runs/processing/requeue", async (req, reply) => {
    const b = body<{ group?: string | null; reason?: string }>(req);
    try {
      return await requeueFailedArticles({ group: b.group ?? null, reason: String(b.reason ?? "平台运维台触发") }, PLATFORM_ACTOR);
    } catch (err) {
      return sendUpstreamError(err, reply);
    }
  });

  return app;
}

export async function startOpsServer(): Promise<void> {
  const app = await buildOpsServer();
  await app.listen({ port: OPS_PORT, host: "0.0.0.0" });
  console.log(JSON.stringify({ level: "info", msg: "ops server started", port: OPS_PORT }));
}
