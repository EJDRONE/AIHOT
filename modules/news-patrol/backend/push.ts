// 精选出品的平台推送：游标扫 publications（selected 且未推过）→ 实体抽取 → POST
// /api/v1/engine/articles（契约见 docs/engine-platform-contract.md §2）。200/409 幂等成功；
// 401/422 记 rejected 不再重试；5xx/超时指数退避（attempts 上限内每轮推送重试）。
import { sql } from "@aihot/backend/db";
import { patrolConfig, pushReady } from "./config.ts";
import { extractEntities, type ExtractedEntity } from "./extract.ts";
import { listCompanies, matchCompanies } from "./companies.ts";

const BATCH = 20;
const MAX_ATTEMPTS = 10;

interface DueArticle {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  published_at: Date | null;
  first_seen_at: Date;
  source_id: string;
  source_name: string;
  source_tier: string;
  source_tags: string[];
  story_id: bigint | number | null;
  story_public_id: string | null;
  story_title: string | null;
  report_count: number;
}

function lineOf(tags: string[]): "penalty" | "eia" | "industry" | "patrol" {
  if (tags.includes("penalty") || tags.includes("处罚线")) return "penalty";
  if (tags.includes("eia") || tags.includes("环评项目用地线")) return "eia";
  if (tags.includes("industry") || tags.includes("企业动态行业线")) return "industry";
  return "patrol";
}

/** 待推文章：精选、公开、且没有推过或还在重试中。 */
export async function dueArticles(): Promise<DueArticle[]> {
  return sql<DueArticle[]>`
    SELECT p.article_id AS id, p.title, p.summary, p.url, p.published_at, p.discovered_at AS first_seen_at,
           p.source_id, s.name AS source_name, s.tier AS source_tier, s.tags AS source_tags,
           p.story_id, st.public_id AS story_public_id, st.title AS story_title,
           (SELECT count(*)::int FROM publications q WHERE q.story_id = p.story_id AND q.selected) AS report_count
    FROM publications p
    JOIN sources s ON s.id = p.source_id
    LEFT JOIN stories st ON st.id = p.story_id
    LEFT JOIN patrol_pushes pp ON pp.article_id = p.article_id
    WHERE p.selected AND p.visibility = 'public'
      AND (pp.id IS NULL OR (pp.status = 'pending' AND pp.attempts < ${MAX_ATTEMPTS}))
    ORDER BY p.selected_ready_at NULLS FIRST, p.updated_at
    LIMIT ${BATCH}`;
}

/** 平台响应分类。 */
export class PushResponseError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function postArticle(payload: unknown): Promise<string> {
  const cfg = patrolConfig();
  const res = await fetch(`${cfg.platformBase}/api/v1/engine/articles`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-engine-token": cfg.platformToken },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 200 || res.status === 409) {
    const data = (await res.json().catch(() => ({}))) as { id?: unknown };
    return typeof data.id === "string" ? data.id : "";
  }
  const text = (await res.text().catch(() => "")).slice(0, 300);
  throw new PushResponseError(res.status, `平台 HTTP ${res.status}: ${text}`);
}

export interface PushOutcome {
  pushed: number;
  failed: number;
  rejected: number;
}

/** 推一轮（最多 BATCH 篇）。未配置或未开阀时静默跳过（schedule 的 when 已挡，双保险）。 */
export async function pushSelected(): Promise<PushOutcome> {
  const outcome: PushOutcome = { pushed: 0, failed: 0, rejected: 0 };
  if (!pushReady()) return outcome;
  const companies = await listCompanies();
  const due = await dueArticles();
  for (const article of due) {
    const [existing] = await sql<{ entities: ExtractedEntity[] | null; attempts: number }[]>`
      SELECT entities, attempts FROM patrol_pushes WHERE article_id = ${article.id}`;
    let entities = existing?.entities ?? null;
    if (!entities) {
      try {
        entities = await extractEntities({ title: article.title, summary: article.summary ?? "", bodyText: null });
      } catch (e) {
        // 抽取失败（模型不可用等）：保持 pending，下轮再试，不占 attempts（还没碰平台）
        await sql`
          INSERT INTO patrol_pushes (article_id, status, attempts, last_error) VALUES (${article.id}, 'pending', ${existing?.attempts ?? 0}, ${`抽取失败：${(e as Error).message}`.slice(0, 300)})
          ON CONFLICT (article_id) DO UPDATE SET last_error = EXCLUDED.last_error, updated_at = now()`;
        outcome.failed += 1;
        continue;
      }
    }
    const matched = matchCompanies(companies, `${article.title}\n${article.summary ?? ""}\n${entities.map((e) => e.name).join("\n")}`);
    const payload = {
      engine: "gxsw-news-engine",
      article: {
        id: article.id,
        url: article.url,
        title: article.title,
        summary: article.summary ?? "",
        language: "zh",
        published_at: article.published_at?.toISOString() ?? null,
        first_seen_at: article.first_seen_at.toISOString(),
        source: { id: article.source_id, name: article.source_name, tier: article.source_tier, line: lineOf(article.source_tags) },
        event: article.story_id
          ? { id: article.story_public_id ?? String(article.story_id), title: article.story_title ?? "", report_count: article.report_count }
          : null,
      },
      entities: entities.map((e) => ({
        ...e,
        company_ids: matched.filter((m) => [m.name, ...m.aliases].some((n) => e.name.includes(n) || n.includes(e.name))).map((m) => m.id),
      })),
    };
    try {
      const platformId = await postArticle(payload);
      await sql`
        INSERT INTO patrol_pushes (article_id, status, entities, platform_id, pushed_at) VALUES (${article.id}, 'sent', ${sql.json(entities)}, ${platformId}, now())
        ON CONFLICT (article_id) DO UPDATE SET status = 'sent', entities = EXCLUDED.entities, platform_id = EXCLUDED.platform_id, pushed_at = now(), last_error = NULL, updated_at = now()`;
      outcome.pushed += 1;
    } catch (e) {
      const status = e instanceof PushResponseError && (e.status === 401 || e.status === 422) ? "rejected" : "pending";
      const attempts = (existing?.attempts ?? 0) + 1;
      await sql`
        INSERT INTO patrol_pushes (article_id, status, entities, attempts, last_error) VALUES (${article.id}, ${status}, ${sql.json(entities)}, ${attempts}, ${`${(e as Error).message}`.slice(0, 300)})
        ON CONFLICT (article_id) DO UPDATE SET status = EXCLUDED.status, entities = EXCLUDED.entities, attempts = EXCLUDED.attempts, last_error = EXCLUDED.last_error, updated_at = now()`;
      if (status === "rejected") outcome.rejected += 1;
      else outcome.failed += 1;
    }
  }
  return outcome;
}
