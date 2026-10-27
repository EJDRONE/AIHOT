// 企业名单：首次从种子 xlsx 快照导入（data/companies-seed.json），之后定期经平台 API 刷新
// （docs/engine-platform-contract.md §1）。两个来源写同一张表，origin 标记来路；平台刷新
// 不删除种子行（删除语义留给平台侧，引擎只做名单消费者）。
import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { sql } from "@aihot/backend/db";
import { patrolConfig } from "./config.ts";
import type { PatrolCompany } from "./queries.ts";

interface SeedFile {
  generatedFrom: string;
  companies: Array<{
    id: string; name: string; city: string | null; county: string | null; address: string | null;
    category: string | null; category_key: string | null; waste_type_cn: string | null;
    lon: number | null; lat: number | null; aliases: string[];
  }>;
}

export async function listCompanies(): Promise<PatrolCompany[]> {
  return sql<PatrolCompany[]>`SELECT id, name, aliases, category, category_key FROM patrol_companies WHERE enabled ORDER BY id`;
}

/** 表为空时导入种子（幂等：已在库的行不覆盖）。返回导入条数。 */
export async function ensureSeedCompanies(): Promise<number> {
  const [{ count }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM patrol_companies`;
  if (count > 0) return 0;
  const seedPath = path.join(REPO_ROOT, "modules", "news-patrol", "data", "companies-seed.json");
  const seed = JSON.parse(readFileSync(seedPath, "utf8")) as SeedFile;
  let added = 0;
  for (const c of seed.companies) {
    const res = await sql`
      INSERT INTO patrol_companies (id, name, aliases, city, county, address, category, category_key, waste_type_cn, lon, lat, origin)
      VALUES (${c.id}, ${c.name}, ${c.aliases}, ${c.city}, ${c.county}, ${c.address}, ${c.category}, ${c.category_key}, ${c.waste_type_cn}, ${c.lon}, ${c.lat}, 'seed')
      ON CONFLICT (id) DO NOTHING RETURNING id`;
    added += res.length;
  }
  return added;
}

interface PlatformCompany {
  id: string; name: string; city?: string | null; county?: string | null; address?: string | null;
  category?: string | null; category_key?: string | null; waste_type_cn?: string | null;
  lon?: number | null; lat?: number | null; updated_at?: string | null;
}

/** 从平台拉名单（GET /api/v1/engine/companies）并 upsert。失败返回错误信息，不抛出：同步是尽力而为。 */
export async function syncCompaniesFromPlatform(): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  const cfg = patrolConfig();
  if (!cfg.platformBase || !cfg.platformToken) return { ok: false, error: "PLATFORM_API_BASE / PLATFORM_API_TOKEN 未配置" };
  try {
    const res = await fetch(`${cfg.platformBase}/api/v1/engine/companies`, {
      headers: { "x-engine-token": cfg.platformToken },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status !== 200) return { ok: false, error: `平台 HTTP ${res.status}` };
    const data = (await res.json()) as { companies?: PlatformCompany[] };
    const companies = data.companies ?? [];
    for (const c of companies) {
      await sql`
        INSERT INTO patrol_companies (id, name, aliases, city, county, address, category, category_key, waste_type_cn, lon, lat, origin, platform_updated_at)
        VALUES (${c.id}, ${c.name}, ${[c.name]}, ${c.city ?? null}, ${c.county ?? null}, ${c.address ?? null}, ${c.category ?? null}, ${c.category_key ?? null},
                ${c.waste_type_cn ?? null}, ${c.lon ?? null}, ${c.lat ?? null}, 'platform', now())
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, city = EXCLUDED.city, county = EXCLUDED.county, address = EXCLUDED.address,
          category = EXCLUDED.category, category_key = EXCLUDED.category_key, waste_type_cn = EXCLUDED.waste_type_cn,
          lon = EXCLUDED.lon, lat = EXCLUDED.lat, origin = 'platform', platform_updated_at = now(), updated_at = now()`;
    }
    return { ok: true, total: companies.length };
  } catch (e) {
    return { ok: false, error: `平台名单同步失败：${(e as Error).message}` };
  }
}

/** 文本里点名了哪些名单企业（名称或别名直接出现）。用于抽取结果对位与巡检命中归因。 */
export function matchCompanies<T extends { name: string; aliases?: readonly string[] }>(companies: T[], text: string): T[] {
  return companies.filter((c) => [c.name, ...(c.aliases ?? [])].some((n) => n && n.length >= 4 && text.includes(n)));
}
