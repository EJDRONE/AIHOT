// 巡检执行：按线路取查询矩阵 → DeepSeek Search → 新 URL Fetch 正文 → 经引擎的 ingestItems
// 入库（与层1信源同一条判重/评分/聚簇管线）。巡检信源已由 industry/sources.json 预建
// （kind=external，penalty=T1，其余 T1_5/T2），ingestItems 不会改写既有信源的分级。
import { sql } from "@aihot/backend/db";
import { ingestItems, MAX_ITEMS } from "@aihot/backend/ingest/items";
import { patrolConfig } from "./config.ts";
import { DeepSeekError, deepseekFetch, deepseekSearch } from "./deepseek.ts";
import { buildCompanyQuery, buildSourceQueries, buildTopicQueries, type PatrolCompany, type PatrolLine } from "./queries.ts";
import { ensureSeedCompanies, listCompanies } from "./companies.ts";

export const PATROL_SOURCES: Record<PatrolLine, { id: string; name: string }> = {
  penalty: { id: "patrol-penalty", name: "全网巡检·涉企处罚" },
  enterprise: { id: "patrol-enterprise", name: "全网巡检·企业动态" },
  project: { id: "patrol-project", name: "全网巡检·项目用地" },
  sources: { id: "patrol-sources", name: "全网巡检·校准信源" },
  topic: { id: "patrol-topic", name: "全网巡检·主题发现" },
};

export interface PatrolRunResult {
  line: PatrolLine;
  windowStart: string;
  windowEnd: string;
  queries: number;
  hits: number;
  fetched: number;
  ingested: number;
  skipped: number;
  error: string | null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayAfter(date: string): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
}

/** 本线路的巡检窗口：上次成功运行的后一天起；首次运行回溯 PATROL_BACKFILL_FROM。 */
async function windowFor(line: PatrolLine, backfillFrom: string): Promise<{ start: string; end: string }> {
  const [last] = await sql<{ window_end: string }[]>`
    SELECT window_end FROM patrol_runs WHERE line = ${line} AND error IS NULL AND finished_at IS NOT NULL
    ORDER BY started_at DESC LIMIT 1`;
  const end = today();
  if (!last) return { start: backfillFrom, end };
  const start = dayAfter(last.window_end);
  return start > end ? { start: end, end } : { start, end };
}

async function queriesFor(line: PatrolLine): Promise<{ query: string; company?: PatrolCompany }[]> {
  if (line === "sources") return buildSourceQueries().map((query) => ({ query }));
  if (line === "topic") return buildTopicQueries().map((query) => ({ query }));
  const companies = await listCompanies();
  return companies.map((company) => ({ query: buildCompanyQuery(company, line), company }));
}

/** 已在文章库里的地址：本轮不再抓正文（引擎自己的判重仍是最终兜底）。 */
async function knownUrls(urls: string[]): Promise<Set<string>> {
  if (!urls.length) return new Set();
  const rows = await sql<{ url: string }[]>`SELECT url FROM articles WHERE url IN ${sql(urls)}`;
  return new Set(rows.map((r) => r.url));
}

/**
 * 跑一条巡检线。过程中的失败（搜索超时、单条抓取失败）计数跳过，不中断整轮；
// 只有引擎入库抛错才记为运行失败（下次同线路重跑整个窗口，ingest 判重兜底）。
 */
export async function runPatrolLine(line: PatrolLine): Promise<PatrolRunResult> {
  const cfg = patrolConfig();
  await ensureSeedCompanies();
  const [run] = await sql<{ id: number }[]>`
    INSERT INTO patrol_runs (line, window_start, window_end) VALUES (${line}, ${cfg.backfillFrom}, ${today()}) RETURNING id`;
  const win = await windowFor(line, cfg.backfillFrom);
  await sql`UPDATE patrol_runs SET window_start = ${win.start}, window_end = ${win.end} WHERE id = ${run!.id}`;

  const result: PatrolRunResult = { line, windowStart: win.start, windowEnd: win.end, queries: 0, hits: 0, fetched: 0, ingested: 0, skipped: 0, error: null };
  const isBackfill = win.start < new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  try {
    const pending = (await queriesFor(line)).slice(0, cfg.maxQueries);
    const seen = new Set<string>();
    const batch: Array<{ title: string; url: string; publishedAt: string | null; raw: Record<string, unknown> }> = [];
    const flush = async () => {
      if (!batch.length) return;
      const chunk = batch.splice(0, batch.length);
      const res = await ingestItems({ sourceId: PATROL_SOURCES[line].id, sourceName: PATROL_SOURCES[line].name, items: chunk });
      result.ingested += res.created;
    };

    for (const { query, company } of pending) {
      const fullQuery = `${query} after:${win.start}` + (win.end < today() ? ` before:${dayAfter(win.end)}` : "");
      result.queries += 1;
      let hits;
      try {
        hits = await deepseekSearch(fullQuery, 10);
      } catch (e) {
        result.skipped += 1;
        if (e instanceof DeepSeekError && !e.retryable) continue; // 查询词非法等，跳过这一条
        throw e; // 网络级失败：停止本轮，下次重跑窗口
      }
      const known = await knownUrls(hits.map((h) => h.url).filter((u) => !seen.has(u)));
      for (const hit of hits) {
        result.hits += 1;
        if (seen.has(hit.url) || known.has(hit.url)) continue;
        seen.add(hit.url);
        let content: string | null = null;
        if (result.fetched < cfg.maxFetches) {
          try {
            const page = await deepseekFetch(hit.url);
            if (page) {
              content = page.content.slice(0, 20_000);
              result.fetched += 1;
            }
          } catch {
            // 抓取失败不拦入库：摘要仍可进管线评分
          }
        }
        batch.push({
          title: hit.title || hit.url,
          url: hit.url,
          publishedAt: hit.publishedDate,
          raw: {
            patrol: { line, query, companyId: company?.id, companyName: company?.name, categoryKey: company?.category_key },
            snippet: hit.snippet,
            summary: hit.summary.length <= 2000 ? hit.summary : hit.summary.slice(0, 2000),
            ...(content ? { content } : {}),
            _aihot: { backfill: isBackfill },
          },
        });
      }
      if (batch.length >= MAX_ITEMS) await flush();
      await new Promise((r) => setTimeout(r, 200));
    }
    await flush();
  } catch (e) {
    result.error = `${(e as Error).message}`.slice(0, 500);
  }
  await sql`
    UPDATE patrol_runs SET queries = ${result.queries}, hits = ${result.hits}, fetched = ${result.fetched},
      ingested = ${result.ingested}, skipped = ${result.skipped}, error = ${result.error}, finished_at = now()
    WHERE id = ${run!.id}`;
  return result;
}
