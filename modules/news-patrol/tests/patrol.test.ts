// 巡检执行：搜索→抓取→ingest 入库的整链（DeepSeek 用 fetch 桩，不访问外部服务），
// 同窗口重跑不再抓已知 URL、不再重复入库。
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { tag } from "../../../tests/setup.ts";
import { runPatrolLine } from "../backend/patrol.ts";

const T = tag();
const URLS = [`https://example.gov.cn/${T}/notice-1.html`, `https://example.gov.cn/${T}/notice-2.html`];

const savedFetch = globalThis.fetch;
let fetchCalls = 0;

before(async () => {
  process.env.PATROL_ENABLED = "true";
  process.env.DEEPSEEK_SEARCH_API_KEY = "test-key";
  process.env.PATROL_MAX_QUERIES = "2";
  await sql`
    INSERT INTO patrol_companies (id, name, aliases, city, category, category_key) VALUES
      (${`P-${T}-1`}, ${`广西测试锰业${T}有限责任公司`}, ${[`广西测试锰业${T}有限责任公司`]}, '崇左市', '锰渣', 'manganese_slag'),
      (${`P-${T}-2`}, ${`广西测试铝业${T}有限公司`}, ${[`广西测试铝业${T}有限公司`]}, '百色市', '赤泥', 'red_mud')`;
  // 每次搜索都返回同一组命中：第二轮应当全部因 URL 已知而跳过
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/v1/tools/search")) {
      return new Response(JSON.stringify({
        results: URLS.map((u, i) => ({
          rerank_score: 2.4, title: `测试命中 ${i}`, url: u, snippet: "片段", summary: "摘要",
          content: "", site_name: "Example", date: "2026-10-20T09:30:00+08:00", authority: 3,
        })),
      }), { status: 200 });
    }
    if (url.endsWith("/v1/tools/fetch")) {
      fetchCalls += 1;
      return new Response(JSON.stringify({ title: "公告", content: "# 公告\n某锰业渣库渗滤液超标被处罚。" }), { status: 200 });
    }
    throw new Error(`意外的请求 ${url}`);
  }) as typeof fetch;
});

after(async () => {
  globalThis.fetch = savedFetch;
  // runPatrolLine → ingestItems 会经 queueProcessing 拉起 pg-boss；不停掉它，轮询会
  // 钉住测试进程不退出、拖死整个 runner（tests/admin-corrections.test.ts 同款收尾）
  await stopBoss();
  await closeDb();
});

test("巡检一轮：搜索命中 → 抓正文 → ingest 入库；同窗口重跑不重复", async () => {
  const result = await runPatrolLine("penalty");
  assert.equal(result.error, null);
  assert.equal(result.queries, 2);
  assert.equal(result.hits, 4); // 2 次搜索 × 2 命中
  assert.equal(result.fetched, 2);
  assert.equal(result.ingested, 2);

  const articles = await sql<{ source_id: string }[]>`
    SELECT source_id FROM articles WHERE url LIKE ${`https://example.gov.cn/${T}/%`}`;
  assert.equal(articles.length, 2);
  assert.ok(articles.every((a) => a.source_id === "patrol-penalty"));

  const [run] = await sql<{ line: string; error: string | null }[]>`
    SELECT line, error FROM patrol_runs WHERE line = 'penalty' ORDER BY id DESC LIMIT 1`;
  assert.equal(run!.error, null);

  const fetchCallsAfterFirst = fetchCalls;
  const again = await runPatrolLine("penalty");
  assert.equal(again.error, null);
  assert.equal(again.ingested, 0);
  assert.equal(fetchCalls, fetchCallsAfterFirst);
});
