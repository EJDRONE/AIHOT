// DeepSeek Search / Fetch 客户端（https://api-docs.deepseek.com/zh-cn/guides/search）。
// 按成功请求计费（成功才有 results/正文），429 与 5xx 退避重试一次，其余 4xx 不重试。
// 这不是 LLM chat 调用，不走引擎的付费回执；次数记进 patrol_runs 供对账。
import { patrolConfig } from "./config.ts";

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  summary: string;
  publishedDate: string | null; // YYYY-MM-DD，无法解析为 null
  rerankScore: number;
  authority: number;
  siteName: string | null;
}

export class DeepSeekError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.retryable = status === 429 || status === 408 || status >= 500;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeDate(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

async function postJson(path: string, body: Record<string, unknown>): Promise<unknown> {
  const cfg = patrolConfig();
  if (!cfg.searchKey) throw new DeepSeekError(0, "DeepSeek Search key 未配置（DEEPSEEK_SEARCH_API_KEY 或 LLM_API_KEY）");
  let lastError: DeepSeekError | null = null;
  // 429/5xx 按官方指南等待重试一次；两次都失败抛给巡检记录。
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${cfg.searchBase}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.searchKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status === 200) return await res.json();
      const text = (await res.text()).slice(0, 300);
      const error = new DeepSeekError(res.status, `DeepSeek HTTP ${res.status}: ${text}`);
      if (!error.retryable) throw error;
      lastError = error;
    } catch (e) {
      if (e instanceof DeepSeekError && !e.retryable) throw e;
      lastError = e instanceof DeepSeekError ? e : new DeepSeekError(0, `网络异常：${(e as Error).message}`);
    }
    if (attempt === 0) await sleep(2000);
  }
  throw lastError ?? new DeepSeekError(0, "DeepSeek 请求失败");
}

/** 全网搜索。query 支持官方语法（site:、after:/before:、lang:、引号短语）。 */
export async function deepseekSearch(query: string, count = 10): Promise<SearchHit[]> {
  if (query.length > 128) throw new DeepSeekError(400, `query 超过 128 字符（${query.length}）`);
  const data = (await postJson("/v1/tools/search", { query, count, need_content: false })) as {
    results?: Array<Record<string, unknown>>;
  };
  return (data.results ?? [])
    .filter((item) => typeof item.url === "string" && item.url)
    .map((item) => ({
      title: String(item.title ?? ""),
      url: String(item.url ?? ""),
      snippet: String(item.snippet ?? "").slice(0, 500),
      summary: String(item.summary ?? ""),
      publishedDate: normalizeDate(item.date),
      rerankScore: Number(item.rerank_score ?? 0),
      authority: Number(item.authority ?? 0),
      siteName: typeof item.site_name === "string" ? item.site_name : null,
    }));
}

/** 抓取单个网页，返回 Markdown 正文（404/403 属正常：目标站拦截或无正文，不重试）。 */
export async function deepseekFetch(url: string): Promise<{ title: string; content: string } | null> {
  try {
    const data = (await postJson("/v1/tools/fetch", { url })) as { title?: unknown; content?: unknown };
    const content = typeof data.content === "string" ? data.content : "";
    if (!content.trim()) return null;
    return { title: typeof data.title === "string" ? data.title : "", content };
  } catch (e) {
    if (e instanceof DeepSeekError && (e.status === 403 || e.status === 404)) return null;
    throw e;
  }
}
