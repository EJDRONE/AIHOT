// 运维薄 HTTP（契约 v2）standalone 用例：鉴权与白名单边界——不触达任何路由处理器，
// 因此无需数据库（patrol 两表响应形状属 DB 用例，随引擎部署/CI 跑）。
import assert from "node:assert/strict";
import { test } from "node:test";

process.env.ENGINE_OPS_TOKEN = "standalone-ops-token";

const { buildOpsServer } = await import("../apps/worker/src/ops-server.ts");
const app = await buildOpsServer();
const ok = { "x-engine-ops-token": "standalone-ops-token" };

test("ops：缺 token / 错 token 一律 401", async () => {
  assert.equal((await app.inject({ method: "GET", url: "/ops/runs" })).statusCode, 401);
  assert.equal(
    (await app.inject({ method: "GET", url: "/ops/patrol/runs", headers: { "x-engine-ops-token": "wrong" } }))
      .statusCode, 401);
});

test("ops：token 正确时未登记路径 404（白名单即契约）", async () => {
  for (const url of ["/ops/nope", "/ops/models/switch", "/admin/runs", "/"]) {
    assert.equal((await app.inject({ method: "GET", url, headers: ok })).statusCode, 404, url);
  }
});

test("ops：白名单四路径在鉴权通过后进入处理器（此处因无库而 5xx，区别于 404）", async () => {
  for (const url of ["/ops/runs", "/ops/models", "/ops/patrol/runs", "/ops/patrol/pushes?status=sent"]) {
    const res = await app.inject({ method: "GET", url, headers: ok });
    assert.notEqual(res.statusCode, 401, url);
    assert.notEqual(res.statusCode, 404, url);
  }
});

// ---- P1（docs/news-engine-ops-plan.md §8）：selectbench / sources / 卡件处置 ----

test("ops：P1 未登记的操作类路径仍 404（含方法不匹配）", async () => {
  const cases: Array<["GET" | "POST" | "PATCH" | "DELETE", string]> = [
    ["POST", "/ops/selectbench/reimport"],
    ["POST", "/ops/sources"],           // 创建信源不进 P1（方案 §8 只列启停/试抓/立即抓取）
    ["POST", "/ops/sources/preview"],   // 未存库试抓不进 P1
    ["DELETE", "/ops/sources/s1"],
    ["PATCH", "/ops/runs/processing/requeue"],
    ["POST", "/ops/content/s1/rerun"],  // 内容诊断属 P2
    ["POST", "/ops/models/translate"],  // 模型切换属 P2
  ];
  for (const [method, url] of cases) {
    assert.equal((await app.inject({ method, url, headers: ok })).statusCode, 404, `${method} ${url}`);
  }
});

test("ops：P1 路由注册齐——鉴权通过后进入处理器（无库 5xx/抛错均可，区别于 401/404）", async () => {
  const cases: Array<["GET" | "POST" | "PATCH", string, Record<string, unknown> | undefined]> = [
    ["GET", "/ops/selectbench", undefined],
    ["GET", "/ops/selectbench/run-1?stratum=a", undefined],
    ["POST", "/ops/selectbench/import", { label: "对比", report: {} }],
    ["GET", "/ops/sources?enabled=true", undefined],
    ["GET", "/ops/sources/rss-1", undefined],
    ["PATCH", "/ops/sources/rss-1", { patch: { enabled: false }, version: "2026-10-31T00:00:00.000Z" }],
    ["POST", "/ops/sources/rss-1/preview", undefined],
    ["POST", "/ops/sources/rss-1/fetch", undefined],
    ["POST", "/ops/runs/receipts/7/release", { billed: null, note: "" }],
    ["POST", "/ops/runs/deliveries/9/resolve", { outcome: "sent", note: "" }],
    ["POST", "/ops/runs/processing/requeue", { group: null, reason: "回归" }],
  ];
  for (const [method, url, payload] of cases) {
    const res = await app.inject({
      method, url,
      headers: payload === undefined ? ok : { ...ok, "content-type": "application/json" },
      ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
    });
    assert.notEqual(res.statusCode, 401, `${method} ${url}`);
    assert.notEqual(res.statusCode, 404, `${method} ${url}`);
  }
});

test("ops：P1 载荷形状前置校验 400（缺 report/version/patch、outcome 非法）", async () => {
  assert.equal(
    (await app.inject({ method: "POST", url: "/ops/selectbench/import", headers: { ...ok, "content-type": "application/json" }, payload: JSON.stringify({ label: "x" }) })).statusCode,
    400, "import 缺 report");
  assert.equal(
    (await app.inject({ method: "PATCH", url: "/ops/sources/rss-1", headers: { ...ok, "content-type": "application/json" }, payload: JSON.stringify({ patch: { enabled: false } }) })).statusCode,
    400, "PATCH 缺 version");
  assert.equal(
    (await app.inject({ method: "PATCH", url: "/ops/sources/rss-1", headers: { ...ok, "content-type": "application/json" }, payload: JSON.stringify({ version: "v" }) })).statusCode,
    400, "PATCH 缺 patch");
  assert.equal(
    (await app.inject({ method: "POST", url: "/ops/runs/deliveries/9/resolve", headers: { ...ok, "content-type": "application/json" }, payload: JSON.stringify({ outcome: "nope" }) })).statusCode,
    400, "outcome 非法");
});
