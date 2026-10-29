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
