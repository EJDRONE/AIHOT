// 本模块的环境配置。巡检与推送是两个独立的安全阀（默认关），密钥沿用 .env，
// 与引擎的采集/模型阀互不干涉：平台推送坏了不影响巡检入库，巡检关着也不影响层1信源。
// DeepSeek Search 的 key 独立于 LLM_API_KEY（可单独计费账号），未配时回落到 LLM_API_KEY。

export interface PatrolConfig {
  enabled: boolean;
  pushEnabled: boolean;
  searchBase: string;
  searchKey: string;
  platformBase: string;
  platformToken: string;
  maxQueries: number;
  maxFetches: number;
  backfillFrom: string;
}

export function patrolConfig(env: NodeJS.ProcessEnv = process.env): PatrolConfig {
  return {
    enabled: env.PATROL_ENABLED === "true",
    pushEnabled: env.PLATFORM_PUSH_ENABLED === "true",
    searchBase: (env.DEEPSEEK_SEARCH_BASE ?? "https://api.deepseek.com").replace(/\/$/, ""),
    searchKey: env.DEEPSEEK_SEARCH_API_KEY ?? env.LLM_API_KEY ?? "",
    platformBase: (env.PLATFORM_API_BASE ?? "").replace(/\/$/, ""),
    platformToken: env.PLATFORM_API_TOKEN ?? "",
    maxQueries: Math.max(1, Number(env.PATROL_MAX_QUERIES) || 400),
    maxFetches: Math.max(1, Number(env.PATROL_MAX_FETCHES) || 300),
    backfillFrom: /^\d{4}-\d{2}-\d{2}$/.test(env.PATROL_BACKFILL_FROM ?? "") ? env.PATROL_BACKFILL_FROM! : "2026-08-01",
  };
}

/** 巡检可以跑：开关打开且搜索 key 配了。 */
export function patrolReady(env: NodeJS.ProcessEnv = process.env): boolean {
  const c = patrolConfig(env);
  return c.enabled && !!c.searchKey;
}

/** 平台推送可以跑：开关打开且地址与 token 配了。 */
export function pushReady(env: NodeJS.ProcessEnv = process.env): boolean {
  const c = patrolConfig(env);
  return c.pushEnabled && !!c.platformBase && !!c.platformToken;
}
