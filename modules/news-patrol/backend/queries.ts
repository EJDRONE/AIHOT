// 巡检查询矩阵：企业×类型（处罚每日、企业动态/项目每周）+ 校准信源字典 + 主题级库外发现。
// 五类类别词与平台 category_key 对齐；企业名去括号后缀（巡检词引号包裹精确匹配）。
// 改词表只改这里，不动巡检流程。

export interface PatrolCompany {
  id: string;
  name: string;
  aliases: string[];
  category: string | null;
  category_key: string | null;
}

export type PatrolLine = "penalty" | "enterprise" | "project" | "sources" | "topic";

/** 每类的检索词（OR 连接；smelting_slag 含钢渣/高炉渣等同义词扩大召回）。 */
export const CATEGORY_TERMS: Record<string, string[]> = {
  red_mud: ["赤泥"],
  smelting_slag: ["冶炼渣", "钢渣", "高炉渣"],
  manganese_slag: ["锰渣"],
  green_mud: ["滤泥", "绿泥"],
  white_mud: ["白泥"],
};

const orJoin = (terms: string[]) => terms.join(" OR ");

/** 企业名去掉全角/半角括号备注后缀（"广西北港新材料有限公司（不锈钢）"→"广西北港新材料有限公司"）。 */
export function stripNameSuffix(name: string): string {
  return name.replace(/[（(][^（）()]*[）)]/g, "").trim();
}

export interface CompanyQuery {
  company: PatrolCompany;
  query: string;
}

const PENALTY_TERMS = ["处罚", "罚款", "违法", "通报"];
const ENTERPRISE_TERMS = ["环保", "扩建", "用地", "堆场", "征地", "投产", "固废"];
const PROJECT_TERMS = ["项目", "环评", "备案", "开工", "综合利用", "征地"];

function categoryTerms(company: PatrolCompany): string[] {
  const terms = company.category_key ? CATEGORY_TERMS[company.category_key] : undefined;
  return terms ?? ["固废"];
}

/** 一家企业在一条巡检线上的查询（长度守 128 字符上限，超长回落到企业名+核心词）。 */
export function buildCompanyQuery(company: PatrolCompany, line: "penalty" | "enterprise" | "project"): string {
  const name = stripNameSuffix(company.name);
  const terms = line === "penalty" ? PENALTY_TERMS : line === "enterprise" ? [...categoryTerms(company), ...ENTERPRISE_TERMS] : [...categoryTerms(company), ...PROJECT_TERMS];
  const query = `"${name}" (${orJoin(terms)})`;
  if (query.length <= 128) return query;
  const fallbackTerms = line === "penalty" ? PENALTY_TERMS.slice(0, 2) : categoryTerms(company).slice(0, 1);
  return `"${name}" (${orJoin(fallbackTerms)})`.slice(0, 128);
}

/** 主题级库外发现：每类一条（发现 129 家之外的新企业、新项目）。 */
export function buildTopicQueries(): string[] {
  return Object.values(CATEGORY_TERMS).map(
    (terms) => `广西 (${orJoin(terms)}) (综合利用 OR 项目 OR 处罚 OR 堆场 OR 事故 OR 征地)`,
  );
}

/** 平台旧栈校准的权威来源字典（discovery_sources.py 平移）：优先级来自历史台账「说明与来源」。 */
export interface CalibratedSource {
  name: string;
  domain: string;
  kind: "gov" | "exchange" | "rating" | "media";
  categories: "all" | string[];
  keywords: string[];
  regional?: boolean;
  priority: number;
}

export const CALIBRATED_SOURCES: CalibratedSource[] = [
  // 区域召回通道：地市部门散布在大量 gov.cn 子域，精确域名会漏，改广西语义过滤
  { name: "广西地市生态环境公告", domain: "gov.cn", kind: "gov", categories: "all", keywords: ["生态环境局", "环评", "受理公示", "审批公示"], regional: true, priority: 10 },
  { name: "广西地市自然资源征地公告", domain: "gov.cn", kind: "gov", categories: "all", keywords: ["自然资源局", "征收土地预公告", "征地", "项目用地"], regional: true, priority: 10 },
  // 优先级来自历史台账「说明与来源」的实际复用情况
  { name: "钢铁信用评级报告", domain: "zgrkk.com", kind: "rating", categories: ["smelting_slag", "manganese_slag"], keywords: ["产量", "高炉", "评级"], priority: 8 },
  { name: "世界钢铁协会·统计数据", domain: "worldsteel.org", kind: "rating", categories: ["smelting_slag"], keywords: ["中国", "粗钢", "产量"], priority: 7 },
  { name: "柳州统计公报", domain: "liuzhou.gov.cn", kind: "gov", categories: ["smelting_slag"], keywords: ["统计公报", "粗钢", "产量"], priority: 6 },
  { name: "东方财富公告·柳钢 ESG", domain: "rdfile.dzh.com.cn", kind: "exchange", categories: ["smelting_slag"], keywords: ["柳钢", "环境", "社会", "治理"], priority: 6 },
  { name: "南方有色集团", domain: "nanfangmetal.com", kind: "media", categories: ["smelting_slag", "manganese_slag"], keywords: ["供应链", "环境", "固废", "冶炼"], priority: 6 },
  { name: "广西生态环境厅·环评公示", domain: "sthjt.gxzf.gov.cn", kind: "gov", categories: "all", keywords: ["环评", "审批", "公示"], priority: 3 },
  { name: "广西各市政府·环保公示", domain: "gov.cn", kind: "gov", categories: "all", keywords: ["环评", "公示", "固废", "项目"], priority: 3 },
  { name: "广西自然资源厅·项目用地公告", domain: "dnr.gxzf.gov.cn", kind: "gov", categories: "all", keywords: ["征地", "项目", "用地", "公告"], priority: 3 },
  { name: "上海证券交易所·公告", domain: "static.sse.com.cn", kind: "exchange", categories: "all", keywords: ["公告", "环评", "募集"], priority: 2 },
  { name: "深圳证券交易所·公告", domain: "szse.cn", kind: "exchange", categories: "all", keywords: ["公告", "环评"], priority: 2 },
  { name: "中国货币网·债券公告", domain: "chinamoney.com.cn", kind: "exchange", categories: "all", keywords: ["公告", "评级", "债券"], priority: 2 },
  { name: "南方金属·行业资讯", domain: "nanfangmetal.com", kind: "media", categories: "all", keywords: ["项目", "投产", "固废"], priority: 1 },
  { name: "上海有色网 SMM", domain: "smm.cn", kind: "media", categories: ["smelting_slag", "red_mud", "manganese_slag"], keywords: ["项目", "投产", "扩建"], priority: 1 },
  { name: "国际能源网·环保", domain: "in-en.com", kind: "media", categories: "all", keywords: ["项目", "环评", "固废"], priority: 1 },
  { name: "防城港市政府·工业环评公示", domain: "fcgs.gov.cn", kind: "gov", categories: ["smelting_slag", "manganese_slag"], keywords: ["环评", "冶炼", "固废"], priority: 2 },
  { name: "环评云助手·环评公示", domain: "eiacloud.com", kind: "media", categories: "all", keywords: ["环评", "公示", "受理"], priority: 1 },
  { name: "环评信息公示平台", domain: "fcghbxx.com", kind: "media", categories: "all", keywords: ["环评", "公示", "项目"], priority: 1 },
  { name: "综合新闻", domain: "chinanews.com.cn", kind: "media", categories: "all", keywords: ["环评", "固废", "项目"], priority: 1 },
];

/** 校准来源的站内查询：regional 不带 site:，其余限定域名；类别词取来源涉及的类别。 */
export function buildSourceQueries(): string[] {
  return CALIBRATED_SOURCES.map((source) => {
    const categories = source.categories === "all" ? ["固废"] : [...new Set(source.categories.flatMap((key) => CATEGORY_TERMS[key] ?? ["固废"]))];
    const site = source.regional ? "" : ` site:${source.domain}`;
    return `广西 (${orJoin(categories)}) (${orJoin(source.keywords)})${site}`.slice(0, 128);
  });
}
