// 广西固废新闻引擎的 worker 侧：巡检排程（处罚每日、企业/项目/校准信源/主题发现每周）、
// 平台名单同步、精选推送。模型步骤 extractEntities 注册进引擎的模型体系（modelFor 解析
// 环境变量/后台改选/默认）。安全阀：PATROL_ENABLED、PLATFORM_PUSH_ENABLED（默认关）。
import { sql } from "@aihot/backend/db";
import { defineServerModule } from "@aihot/backend/modules";
import type { Finding } from "@aihot/backend/notify/feishu";
import { patrolConfig, patrolReady, pushReady } from "./backend/config.ts";
import { runPatrolLine } from "./backend/patrol.ts";
import { pushSelected } from "./backend/push.ts";
import { ensureSeedCompanies, syncCompaniesFromPlatform } from "./backend/companies.ts";

export const newsPatrolServer = defineServerModule({
  name: "news-patrol",
  models: {
    extractEntities: {
      label: "实体抽取（推送平台的处罚/项目/企业实体，字段口径见 docs/engine-platform-contract.md）",
      env: "EXTRACT_ENTITIES_MODEL",
      purposes: ["extract_entities"],
    },
  },
  schedules: [
    // 处罚线每日一轮（06:30，北京时间），窗口=上次成功运行次日至今日
    { name: "patrol.penalty", cron: "30 6 * * *", missed: "once", run: () => runPatrolLine("penalty"), when: () => patrolReady() },
    // 企业动态与项目用地每周一早（07:00 / 07:30）
    { name: "patrol.enterprise", cron: "0 7 * * 1", missed: "once", run: () => runPatrolLine("enterprise"), when: () => patrolReady() },
    { name: "patrol.project", cron: "30 7 * * 1", missed: "once", run: () => runPatrolLine("project"), when: () => patrolReady() },
    // 校准信源字典（19 站 site:/区域查询）每周二、主题级库外发现每周六
    { name: "patrol.sources", cron: "0 8 * * 2", missed: "once", run: () => runPatrolLine("sources"), when: () => patrolReady() },
    { name: "patrol.topic", cron: "0 8 * * 6", missed: "once", run: () => runPatrolLine("topic"), when: () => patrolReady() },
    // 平台名单同步（种子兜底 + API 刷新），每 15 分钟
    {
      name: "patrol.companies-sync",
      cron: "*/15 * * * *",
      run: async () => {
        await ensureSeedCompanies();
        const result = await syncCompaniesFromPlatform();
        if (!result.ok) console.log(JSON.stringify({ level: "warn", msg: "patrol companies sync failed", error: result.error }));
      },
      when: () => {
        const c = patrolConfig();
        return !!(c.platformBase && c.platformToken);
      },
    },
    // 精选推送：每 10 分钟一轮（每轮至多 20 篇，幂等 + 退避重试）
    { name: "patrol.push", cron: "*/10 * * * *", run: () => pushSelected(), when: () => pushReady() },
  ],
  alerts: async () => {
    const findings: Finding[] = [];
    // 每条巡检线路最近一次运行失败要浮出来（连续失败说明 key、额度或网络出问题）
    const failed = await sql<{ line: string; error: string | null }[]>`
      SELECT DISTINCT ON (line) line, error FROM patrol_runs WHERE finished_at IS NOT NULL ORDER BY line, started_at DESC`;
    for (const row of failed) {
      if (!row.error) continue;
      findings.push({
        key: `patrol.${row.line}.failed`,
        level: "now",
        title: `巡检线路 ${row.line} 最近一次运行失败`,
        impact: "该线路的处罚、项目动态可能漏采",
        heals: "下一轮巡检自动重跑整个窗口",
        action: "看 news-worker 日志与 patrol_runs 的 error 字段，确认 DeepSeek key 与额度",
        detail: row.error,
      });
    }
    const [stuck] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM patrol_pushes WHERE status = 'pending' AND attempts >= 5`;
    if ((stuck?.count ?? 0) > 0) {
      findings.push({
        key: "patrol.push.stuck",
        level: "later",
        title: "有精选成品连续 5 次以上推不出去",
        impact: "平台收不到这些条目",
        heals: "平台恢复后自动补推",
        action: "确认 PLATFORM_API_BASE 可达、token 有效",
        detail: `待推条数 ${stuck!.count}`,
      });
    }
    return findings;
  },
});
