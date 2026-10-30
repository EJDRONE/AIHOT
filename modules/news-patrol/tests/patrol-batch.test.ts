// 回归：巡检窗口命中超过 ingestItems 单批上限（MAX_ITEMS=50）时必须分片入库。
// 起因 2026-10-29/30 两轮 penalty 巡检：每条查询最多带回 10 个命中，batch 可在两次
// 检查之间从 40-49 长到 50 以上，旧的一次性 flush 被 ingestItems 以 413
// 「items[] exceeds max 50 per request」整单拒绝——第一窗入库 50 后炸、第二窗入库清零。
// 构造：首条搜索只回 6 个命中，其后每条回 10 个 → 第 6 条查询后 batch=56 > 50。
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { closeDb, sql } from "@aihot/backend/db";
import { tag } from "../../../tests/setup.ts";
import { runPatrolLine } from "../backend/patrol.ts";

const T = tag();
const QUERIES = 20; // id 前缀 "0-" 保证排序在种子（SS-）与其他测试（P-）之前，20 条查询全部有效
const FIRST_HITS = 6;
const HITS_PER_QUERY = 10;

const savedFetch = globalThis.fetch;
let searchCalls = 0;

before(async () => {
  process.env.PATROL_ENABLED = "true";
  process.env.DEEPSEEK_SEARCH_API_KEY = "test-key";
  process.env.PATROL_MAX_QUERIES = String(QUERIES);
  for (let i = 0; i < QUERIES; i++) {
    await sql`
      INSERT INTO patrol_companies (id, name, aliases, city, category, category_key)
      VALUES (${`0-${T}-${i}`}, ${`桂测锰业${T}${i}有限公司`}, ${[`桂测锰业${T}${i}有限公司`]}, '崇左市', '锰渣', 'manganese_slag')`;
  }
});

after(async () => {
  globalThis.fetch = savedFetch;
  await closeDb();
});

test("窗口命中 >50：按 MAX_ITEMS 分片入库，整轮无错", async () => {
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    if (url.endsWith("/v1/tools/search")) {
      const call = searchCalls++;
      const count = call === 0 ? FIRST_HITS : HITS_PER_QUERY;
      return new Response(JSON.stringify({
        results: Array.from({ length: count }, (_, i) => ({
          rerank_score: 2.4,
          title: `批量命中 ${call}-${i}`,
          url: `https://example.gov.cn/${T}/batch-${call}-${i}.html`,
          snippet: "片段",
          summary: "摘要",
          content: "",
          site_name: "Example",
          date: "2026-10-20T09:30:00+08:00",
          authority: 3,
        })),
      }), { status: 200 });
    }
    if (url.endsWith("/v1/tools/fetch")) {
      return new Response(JSON.stringify({ title: "公告", content: "# 公告\n某锰业渣库渗滤液超标被处罚。" }), { status: 200 });
    }
    throw new Error(`意外的请求 ${url}`);
  }) as typeof fetch;

  const result = await runPatrolLine("penalty");
  assert.equal(result.error, null);
  assert.equal(result.queries, QUERIES);
  const expected = FIRST_HITS + (QUERIES - 1) * HITS_PER_QUERY; // 6 + 19×10 = 196 > 50
  assert.equal(result.hits, expected);
  assert.equal(result.ingested, expected);

  const articles = await sql<{ source_id: string }[]>`
    SELECT source_id FROM articles WHERE url LIKE ${`https://example.gov.cn/${T}/batch-%`}`;
  assert.equal(articles.length, expected);
  assert.ok(articles.every((a) => a.source_id === "patrol-penalty"));
});
