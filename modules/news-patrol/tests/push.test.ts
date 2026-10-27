// 精选推送：实体抽取（模型桩）→ POST 平台（本地 HTTP 桩）；200/409 幂等、422 拒绝不再重试、
// 5xx 保持待推。平台地址与 token 全部指向本测试的桩，不访问外部服务。
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { closeDb, sql } from "@aihot/backend/db";
import { installModules } from "@aihot/backend/modules";
import { SERVER_MODULES } from "@aihot/site/modules/server";
import { pointModels, Reply, stub, tag } from "../../../tests/setup.ts";
import { pushSelected } from "../backend/push.ts";

const T = tag();
const SOURCE = `patrol-penalty`;
const ARTICLE_OK = `push-ok-${T}`.slice(0, 80);
const ARTICLE_REJ = `push-rej-${T}`.slice(0, 80);

interface PlatformHit { body: Record<string, unknown>; }

let platform: { url: string; close: () => Promise<void> };
let model: { url: string; close: () => Promise<void> };
let platformHits: PlatformHit[] = [];

async function insertSelectedArticle(id: string, title: string) {
  await sql`
    INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at, language)
    VALUES (${id}, ${SOURCE}, ${`identity-${id}`}, ${`https://example.gov.cn/${id}.html`}, ${title}, now(), now(), 'zh')`;
  await sql`
    INSERT INTO publications (article_id, source_id, channel, url, title, summary, selected, eligible, visibility, discovered_at, timeline_at, selected_ready_at)
    VALUES (${id}, ${SOURCE}, 'news', ${`https://example.gov.cn/${id}.html`}, ${title}, ${`${title}，罚款 42 万元。`}, true, true, 'public', now(), now(), now())`;
}

before(async () => {
  installModules(SERVER_MODULES); // extractEntities 注册进模型体系
  process.env.EXTRACT_ENTITIES_MODEL = "deepseek-flash"; // 指向下面的本地模型桩
  await sql`
    INSERT INTO sources (id, name, kind, config, tier, participation_mode, interval_minutes, tags, site_fulltext, syndicate_fulltext)
    VALUES (${SOURCE}, '全网巡检·涉企处罚', 'external', '{}'::jsonb, 'T1', 'editorial', 1440, ${["patrol", "penalty", "处罚线"]}, false, false)`;
  await sql`
    INSERT INTO patrol_companies (id, name, aliases, city, category, category_key) VALUES
      (${`P-${T}-1`}, ${`广西测试锰业${T}有限责任公司`}, ${[`广西测试锰业${T}有限责任公司`]}, '崇左市', '锰渣', 'manganese_slag')`;
  await insertSelectedArticle(ARTICLE_OK, "某锰业因渣库渗滤液超标被处罚");
  await insertSelectedArticle(ARTICLE_REJ, "另一条测试处罚");

  // 模型桩：实体抽取返回一个处罚实体
  model = await stub(() => ({
    id: "stub", model: "stub",
    choices: [{ message: { content: JSON.stringify({ entities: [
      { type: "penalty", name: `广西测试锰业${T}有限责任公司`, city: "崇左市", county: "", address: "", category: "锰渣",
        penalty: { decision: "罚款", amount_yuan: 420000, doc_no: "崇环罚〔2026〕12号", date: "2026-10-15", authority: "崇左市生态环境局" },
        year: "", month: "", amount: "", unit: "", quantity_basis: "", publish_date: "2026-10-16", tags: ["渗滤液"], note: "原文摘录" },
    ] }) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }));
  pointModels(model.url, ["deepseek-flash"]);

  // 平台桩：对被拒用例的文章固定回 422，其余 200
  platform = await stub((_hit, req) => {
    const body = JSON.parse(req.body) as { article?: { id?: string } };
    platformHits.push({ body: body as Record<string, unknown> });
    if (body.article?.id === ARTICLE_REJ) return new Reply(422, { error: "invalid" });
    return { status: "stored", id: `plat-${platformHits.length}` };
  });
  process.env.PLATFORM_PUSH_ENABLED = "true";
  process.env.PLATFORM_API_BASE = platform.url;
  process.env.PLATFORM_API_TOKEN = "test-token";
});

after(async () => {
  await model.close();
  await platform.close();
  await closeDb();
});

test("推送：抽取 → 平台 200 记 sent；422 记 rejected 不再重试", async () => {
  const outcome = await pushSelected();
  assert.equal(outcome.pushed, 1);
  assert.equal(outcome.rejected, 1);

  const rows = await sql<{ article_id: string; status: string; entities: { entities?: unknown[] } | unknown[]; platform_id: string | null }[]>`
    SELECT article_id, status, entities, platform_id FROM patrol_pushes WHERE article_id IN (${ARTICLE_OK}, ${ARTICLE_REJ})`;
  const ok = rows.find((r) => r.article_id === ARTICLE_OK)!;
  const rej = rows.find((r) => r.article_id === ARTICLE_REJ)!;
  assert.equal(ok.status, "sent");
  assert.ok(ok.platform_id);
  assert.equal(rej.status, "rejected");

  const payload = platformHits.find((h) => (h.body.article as { id: string }).id === ARTICLE_OK)!.body as {
    engine: string; article: { source: { tier: string; line: string }; }; entities: Array<{ type: string; penalty?: { amount_yuan: number }; company_ids?: string[] }>;
  };
  assert.equal(payload.engine, "gxsw-news-engine");
  assert.equal(payload.article.source.tier, "T1");
  assert.equal(payload.article.source.line, "penalty");
  assert.equal(payload.entities[0]!.type, "penalty");
  assert.equal(payload.entities[0]!.penalty!.amount_yuan, 420000);
  assert.deepEqual(payload.entities[0]!.company_ids, [`P-${T}-1`]);

  // 再推一轮：sent 与 rejected 都不在待推集合，平台不再收到请求
  const hitsBefore = platformHits.length;
  const again = await pushSelected();
  assert.equal(again.pushed + again.failed + again.rejected, 0);
  assert.equal(platformHits.length, hitsBefore);
});
