// 站点身份和读者看得到的文案。本站是 worker-only 的新闻检索引擎（广西固废情报站），
// 不部署网站与公开 API：这里的文案只影响日志、推送标识与（未部署的）网页构建。
// 部署形态见 docs/CONSENSUS.md；域名与端口不在这里。

import type { Founder } from "@aihot/contracts/site-config";

/**
 * 日报、周报、月报什么时候出（北京时间，HH:mm）。本站关闭出刊（EDITIONS_ENABLED = false，
 * 见下），这些时间只作为占位符保留给（未部署的）公开文件模板。
 */
export const EDITION_TIMES = { daily: "08:00", weekly: "10:00", monthly: "10:30" };

/** 是否出日报/周报/月报。false 时 worker 不注册出刊排程，缺刊告警也不检查（本站不出刊）。 */
export const EDITIONS_ENABLED = false;

/** “每天 08:00”“每周一 10:00”“每月 1 日 10:30”：写进句子里的出刊时间。 */
export const EDITION_WHEN = {
  daily: `每天 ${EDITION_TIMES.daily}`,
  weekly: `每周一 ${EDITION_TIMES.weekly}`,
  monthly: `每月 1 日 ${EDITION_TIMES.monthly}`,
};

export const SITE = {
  /** 站名：导航、页面标题、分享图、RSS、MCP、后台都用它。 */
  name: "广西固废情报站",
  /**
   * 行业词：拼进默认说法里，比如“固废动态”。中文词，与名词连写。
   */
  subject: "固废",
  /** 首页的完整标题（浏览器标签、搜索结果）。 */
  homeTitle: "广西固废情报站 — 五类工业固废动态 · 检索引擎",
  /** 主题目录页（/topics）的标题。 */
  topicsTitle: "广西固废：赤泥、冶炼渣、锰渣、绿泥、白泥的处罚、项目与风险动态",
  /** 反馈表单输入框里的示例。 */
  feedbackExample: "例如：某条处罚信息抽取的企业名不对……",
  /** 反馈页标题下面的一句话。 */
  feedbackLead: "发现问题、想要的功能，都可以告诉我们。",
  /** 反馈表单邮箱框里的提示。 */
  feedbackEmailHint: "留下邮箱，我们可以回信联系你",
  /** 一句话介绍：搜索引擎、分享卡片、RSS、llms.txt 会用。 */
  description: `盯住官方公示、公告与行业信源，把广西五类工业固废（赤泥、冶炼渣、锰渣、绿泥、白泥）的处罚、项目、用地与风险动态精选、归组，推送给监管平台。`,
  /** llms.txt 里一句话介绍下面的一段详细介绍（选填）。 */
  llmsIntro: null as string | null,
  /** 一行小字：分享图、海报下方。 */
  tagline: "广西五类工业固废新闻检索引擎",
  /** 搜索引擎读到的关键词（首页结构化数据）。 */
  keywords: ["广西固废", "赤泥", "冶炼渣", "锰渣", "绿泥", "白泥", "环保处罚", "环评公示", "综合利用"] as string[],
  /** 网站开始收录的年份（结构化数据的时间范围，选填）。 */
  since: "2026" as string | null,
  /** 界面语言（HTML lang、og:locale）。 */
  locale: "zh-CN",
  /** 默认域名，只在没设置 SITE_URL 时使用。 */
  defaultUrl: "http://localhost:3000",
  /** 标准图标以外也放在网站根目录的图标（选填）。 */
  rootIcons: [] as string[],
  /**
   * MCP 工具名的前缀（小写字母、数字、下划线）。本站不部署 MCP；保留以防后续启用。
   */
  mcpPrefix: "gxswnews",
  /**
   * 公开接口（MCP、OpenAPI、llms.txt）的版本号，只升不降。本站不部署公开接口。
   */
  interfaceVersion: "1.0.0",
  /** 对外联系邮箱（选填）。 */
  contactEmail: null as string | null,
  /** 关于页底部的一行小字（选填）。 */
  footerNote: "由 AIHOT 开源框架驱动",
  /** 中国大陆网站的 ICP 备案号（选填）。本站内网部署，不填。 */
  icp: null as string | null,
  /** 中国大陆网站的公安备案信息（选填）。 */
  psb: null as string | null,
  /** 源码的 GitHub 仓库地址（选填）。 */
  github: null as string | null,
  /** 结构化数据里的网站运营者（搜索引擎用）。 */
  organization: {
    name: "广西固废情报站",
    /** 创始人（选填）。 */
    founder: null as Founder | null,
  },
  /** 抓取信源时报上的名字和版本（User-Agent 里用），不要冒用别的站。 */
  crawlerName: "GXSWNewsBot/1.0",
} as const;

/** 使用规则和隐私说明两页（正文在 pages/ 里）。内网部署，模板保留默认；对外公开前由使用者本人确认。 */
export const POLICY = {
  terms: {
    name: "使用规则",
    description: "本站网页、RSS、公开 API 与 MCP 的使用规则。",
    covers: null as string | null,
    notes: null as null | { rss: string; api: string },
    license: null as null | { llms: string; agent: string },
    headers: null as null | Record<string, string>,
  },
  privacy: {
    description: "本站如何处理浏览器本地数据、反馈资料与访问日志。",
    covers: null as string | null,
  },
  xPostIsFullText: true,
} as const;

/** 导航（电脑侧栏、手机底栏、“我的”页）。本站不部署网页，保持默认。 */
export const NAV = {
  hidden: [] as Array<"/hot" | "/topics">,
};

/** 条目卡片和详情页上的几处说法和显示。 */
export const ITEM_COPY = {
  reasonLabel: "入选理由",
  showScore: true,
};

/** 关于页的一张二维码卡片。 */
interface ContactCard {
  kind: string;
  title: string;
  note: string;
  alias?: string;
}

/** 关于页的文案。数字（信源数、收录数、精选数、日报期数）来自站内实时统计，不用写在这里。 */
export const ABOUT = {
  kicker: `关于 ${SITE.name}`,
  description: `关于 ${SITE.name}：${SITE.description}`,
  headline: ["五类固废，一张情报网。", "处罚、项目、用地、风险。"] as [string, string],
  lead: `${SITE.name} 替你盯着{sources}个信源和一轮全网巡检：抓取、归并、打分、精选，推送给监管平台。`,
  sourcesFallback: "十几",
  steps: {
    collect: "官方公示、交易所公告和行业媒体都在看；巡检每天全网检索一遍涉企处罚。",
    store: "抓到的都存下来，同一件事的报道归到一起，事件页从这里生成。",
    select: `模型先看是不是五类固废的事、有没有实际信息，再写中文标题、摘要和${ITEM_COPY.reasonLabel}；宣传稿和重复转发进不来。`,
    publish: `精选即推监管平台，进入人工审核队列。`,
  },
  maker: null as null | {
    name: string;
    avatarSourceId?: string | null;
    greeting: string[];
    wechat?: ContactCard;
    feishu?: ContactCard;
  },
  copyright: [`${SITE.name} 是聚合摘要和阅读索引，原文版权归各来源所有。如果你是来源方，希望更正、下架或调整展示方式，可以通过`, "联系我们。"] as [string, string],
  termsAnchor: null as string | null,
} as const;

/** 后台页面上给管理员的提示（选填）。本站不部署后台网页，保留默认。 */
export const ADMIN = {
  feedbackNote: null as string | null,
  banNote: null as string | null,
  budgetNote: null as string | null,
};

/** Agent 接入页的示例。本站不部署 Agent 接入页。 */
export const AGENT = {
  search: { scope: "按企业、项目、处罚或话题搜最近 7 天", ask: "这家企业最近有什么处罚或项目？" },
};

/** 日报、周报、月报版面上的说法。本站关闭出刊，仅保留占位语义。 */
export const REPORTS = {
  imprint: SITE.name.toUpperCase(),
  motto: SITE.subject as string,
  descriptions: {
    daily: `${SITE.name} ${subjectAfter(`${EDITION_WHEN.daily}（北京时间）发布的`, "行业精编日报")}`,
    weekly: subjectAfter("每周", "行业综合回顾"),
    monthly: subjectAfter("每月", "行业盘点"),
  },
  entry: { measure: "件", noun: "大事" },
  metricUnits: { sourcesCount: "个来源", firstPartyEvents: "件一手发布", selectedCount: "条精选", reportsCovered: "期日报" },
  shareUnit: "件大事",
  quiet: { title: "今日安静，无大事发生", paragraph: `${subjectAfter("北京时间 {start} 至 {end}，没有新的", "大事")}。` },
};

/** 运维告警（只发给站长）里随部署而变的几处说法。 */
export const ALERTS = {
  quietMinutes: 360,
  usualFlow: null as string | null,
  workerLogs: "看 news-worker 的日志（docker compose logs news-worker）",
};

/** 后台新建信源时的默认设置。 */
export const SOURCE_DEFAULTS = {
  siteFulltext: false,
};

/** 社区站的信源。本站无社区信源。 */
export const COMMUNITY_FEEDS: { dev: string[]; hn: string[] } = {
  dev: [],
  hn: [],
};

/** 各页分享图（/og/pages/*.png）上的文字。本站不部署网页。 */
export const CARDS: Record<string, { kicker: string; title: string; subtitle: string; accent?: "hot" | "amber" }> = {
  site: { kicker: subjectAfter("每日", "精选"), title: SITE.tagline, subtitle: SITE.description },
  all: { kicker: subjectAfter("全部", "动态"), title: "所有信源的最新动态，一站看完", subtitle: "按时间汇总各信源的最新动态，可按类别与标签筛选。" },
  hot: { kicker: "热点榜", title: "过去 48 小时，大家在讨论什么", subtitle: "热度指数、趋势与组成热度的公开来源。", accent: "hot" },
  daily: { kicker: withSubject("日报"), title: subjectAfter(`每天 ${spokenTime(EDITION_TIMES.daily)}，一份读得完的`, "日报"), subtitle: `${subjectAfter("前一天值得关注的", "动态")}。` },
  weekly: { kicker: withSubject("周报"), title: `一周${REPORTS.entry.noun}，一次看清`, subtitle: "本周的主线、重要发布与值得回看的讨论。" },
  monthly: { kicker: withSubject("月报"), title: "一个月的变化", subtitle: "月度主线与关键事件回顾。" },
  about: { kicker: "关于", title: `关于 ${SITE.name}`, subtitle: SITE.description },
  terms: { kicker: "使用规则", title: `${SITE.name} 使用规则`, subtitle: "网页、API、RSS 与 MCP 的使用范围。" },
  privacy: { kicker: "隐私说明", title: `${SITE.name} 隐私说明`, subtitle: "访问日志、浏览器本地数据与反馈资料的处理方式。" },
  changelog: { kicker: "更新日志", title: `${SITE.name} 更新日志`, subtitle: "功能更新、优化、公告与下线记录。" },
  feedback: { kicker: "反馈", title: "告诉我们哪里可以更好", subtitle: "内容、功能、接入，或来源方的更正与下架请求。" },
  agent: { kicker: "Agent 接入", title: `把 ${SITE.name} 接进你的 Agent`, subtitle: "MCP、RSS、API 三种方式，匿名只读，无需 API Key。" },
};

/** 公开接口的访问约定。本站不部署公开接口。 */
export const ACCESS = {
  ratePerMinute: null as number | null,
  userAgent: null as string | null,
};

/** 这个部署自己的几处安排（选填）。 */
export const DEPLOYMENT = {
  credentialsDir: null as string | null,
  credentialFiles: {} as Partial<Record<string, string>>,
  /** 生产进程启动时额外检查的凭据。平台推送与巡检的配置在任务里检查（未配置时任务跳过并记日志），不强制拦截启动。 */
  requiredSecrets: [] as const,
  originHost: null as string | null,
  loginReturnHeader: null as string | null,
  imageUpstreamBudget: null as null | { mbPerMinute: number; gbPerDay: number },
  directFetchHosts: [] as string[],
  selectionGold: null as null | { file: string; sample: number; split: string; sweep: [number, number] },
};

/** RSS 订阅源的说明。本站不部署 RSS。 */
export const FEED_COPY = {
  allLeavesOut: [] as string[],
};

/** 公开接口里和网页不同的类别。本站不部署公开接口。 */
export const PUBLIC_CATEGORIES = {
  merge: {},
  feedLabels: {},
} as const;

/** “固废日报”这类说法：行业词和名词之间，英文词加空格，中文词不加。 */
export function withSubject(noun: string): string {
  return /[A-Za-z0-9]$/.test(SITE.subject) ? `${SITE.subject} ${noun}` : `${SITE.subject}${noun}`;
}

/** “按主题看固废”这类说法：行业词接在中文后面，英文词前加空格，中文词不加；noun 照 withSubject 接上。 */
export function subjectAfter(text: string, noun?: string): string {
  const gap = /^[A-Za-z0-9]/.test(SITE.subject) ? " " : "";
  return `${text}${gap}${noun ? withSubject(noun) : SITE.subject}`;
}

/** “8 点”“10 点 30 分”：口语里的 HH:mm。 */
function spokenTime(time: string): string {
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  return `${hour} 点${minute ? ` ${minute} 分` : ""}`;
}
