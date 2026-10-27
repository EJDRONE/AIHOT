// 这个行业的分类体系：类别、标签词表、公司（主体）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
// 本站是广西多源固废新闻引擎（worker-only，无对外网站）：类别 key 同时用于推送给平台的 article.source.line 之外的分类口径，
// 五类固废口径（赤泥/冶炼渣/锰渣/绿泥/白泥）与平台 category_key 一致，见 docs/CONSENSUS.md。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉结构抽取模型这一类收什么、
 * 和相邻类别的边界在哪（总的归类原则写在 prompts/structure.md 里）。
 * commentary 标出评论类（教程、观点）：本站不出日报周报月报，该标志仅保留框架语义。
 * 没归上类的资料放进第一个 key 为 industry 的类别所在的节（没有就放最后一节）。
 * tagColor 是飞书推送卡片里的小标签颜色（本站未配飞书，仅保留框架语义）。
 * feedLabel 是分类 RSS 标题里的名字（不写就用 label）。
 */
export const CATEGORIES = [
  { key: "penalty", tagColor: "red", label: "处罚执法", feedLabel: "环保处罚", section: "处罚与执法", guide: "涉及五类固废企业（赤泥、冶炼渣、锰渣、绿泥、白泥）的行政处罚决定、督察问责、环境司法判决、责令改正与查封扣押。按日计罚、听证公告也算；单纯的行业政策不归这里。" },
  { key: "project", tagColor: "orange", label: "项目用地", feedLabel: "项目与用地", section: "项目与用地", guide: "涉五类固废的新建改扩建项目：环评受理与审批公示、备案、开工投产、综合利用与处置项目、征地与堆场用地公告。看的是项目与地块的变化；企业日常经营归企业动态。" },
  { key: "enterprise", tagColor: "turquoise", label: "企业动态", feedLabel: "企业动态", section: "企业动态", guide: "涉五类固废企业的经营变化：扩产停产、产量与固废产生量披露、综合利用落地、融资与股权、评级报告里的固废信息。没有具体项目的经营新闻归这里。" },
  { key: "incident", tagColor: "violet", label: "环境风险", feedLabel: "环境风险", section: "环境风险", guide: "五类固废堆场与转运环节的环境风险事件及调查进展：渗滤液外溢、扬尘、溃坝滑坡、污染举报信访、应急响应与调查结论。政策部署和常规执法分别归政策标准与处罚执法。" },
  { key: "policy", tagColor: "indigo", label: "政策标准", feedLabel: "政策标准", section: "政策与行业", guide: "国家和广西涉工业固废的法规、规划、标准、督察部署与政策解读，包括一般性工业固废管理政策；不针对具体企业处罚或项目的政策变化归这里。" },
  { key: "industry", tagColor: "blue", label: "行业资讯", feedLabel: "行业资讯", section: "政策与行业", guide: "五类固废综合利用的技术路线、市场行情、行业会议与其他行业动态；既不是具体企业的事、也不是政策发布的行业层面消息。没归上类的资料也放这里。" },
] as const satisfies ReadonlyArray<{ key: string; tagColor: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

/**
 * 这个行业最受关注的一类发布：本站没有这样一类（处罚与项目各自重要），设为 null。
 */
export const RELEASE: { category: string; tag: string; unit: string } | null = null;

/** 报告总述可以直接写、不必在条目里找到出处的行业通用词（本站不出报告，仅保留框架语义）。 */
export const PLAIN_TERMS: readonly string[] = ["固废", "赤泥", "冶炼渣", "锰渣", "绿泥", "白泥", "综合利用", "环评"];

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = ["penalty_decision", "project_progress", "enterprise_change", "environmental_incident", "policy_release", "industry_info", "opinion_analysis"] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一。 */
export const CATEGORY_TAGS = [
  "环保处罚", "项目用地", "企业动态", "环境风险", "政策标准", "行业资讯", "其他",
] as const;

/** 可选的主题标签。 */
export const TOPIC_TAGS = [
  "赤泥", "冶炼渣", "锰渣", "绿泥", "白泥", "用地", "征地", "堆场", "扩产", "综合利用", "环评", "投产", "渗滤液", "扬尘", "督察", "事故", "信访", "资源化", "产量数据",
] as const;

/** 可选的实体标签（公司、机构）。从种子企业名录里挑的主要主体，模型打标签时只能从这里选。 */
export const ENTITY_TAGS = [] as const;

/** 模型常写的近义词，统一成词表里的写法。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  "行政处罚": "环保处罚", "处罚": "环保处罚", "罚款": "环保处罚", "执法": "环保处罚", "通报批评": "环保处罚",
  "环评公示": "项目用地", "环评审批": "项目用地", "征地": "用地", "土地占用": "用地", "项目审批": "项目用地", "新建项目": "项目用地",
  "公司动态": "企业动态", "经营动态": "企业动态", "扩产": "扩产", "停产": "企业动态",
  "污染事件": "环境风险", "环境事件": "环境风险", "渗漏": "渗滤液", "外溢": "渗滤液", "扬尘污染": "扬尘", "举报": "信访", "投诉": "信访",
  "法规": "政策标准", "规划": "政策标准", "标准": "政策标准", "政策": "政策标准", "监管政策": "政策标准",
  "技术": "行业资讯", "市场": "行业资讯", "行情": "行业资讯", "会议": "行业资讯",
  "红泥": "赤泥", "钢渣": "冶炼渣", "高炉渣": "冶炼渣", "冶金渣": "冶炼渣", "电解锰渣": "锰渣", "滤泥": "绿泥", "糖厂滤泥": "绿泥", "造纸白泥": "白泥", "苛化白泥": "白泥",
};

// ── 公司与主体 ──────────────────────────────────────────────────────────────────────────

/**
 * 企业名录（主题与结构抽取的主体对位）。129 家种子企业来自广西固废台账（2026-10-27），
 * id 与平台企业主键一致（SS-GX-006 等），推送平台时可用于对账。别名去掉括号备注和“广西/有限公司”前后缀。
 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; orgNames?: string[]; otherNames?: string[] }> = {
  "SS-GX-006": { name: "广西北港新材料有限公司（不锈钢）", displayTag: null, aliases: ["广西北港新材料有限公司", "北港新材料"] },
  "WM-GX-006": { name: "广西太阳纸业有限公司", displayTag: null, aliases: ["广西太阳纸业有限公司", "太阳纸业"] },
  "WM-GX-007": { name: "玖龙纸业（北海）有限公司", displayTag: null, aliases: ["玖龙纸业有限公司", "玖龙纸业"] },
  "FM-GX-013": { name: "上林南华糖业有限责任公司", displayTag: null, aliases: ["上林南华糖业有限责任公司", "上林南华糖业"] },
  "FM-GX-002": { name: "南宁糖业宾阳大桥制糖有限责任公司", displayTag: null, aliases: ["南宁糖业宾阳大桥制糖有限责任公司", "南宁糖业宾阳大桥制糖"] },
  "FM-GX-005": { name: "广西糖业集团廖平制糖有限公司", displayTag: null, aliases: ["广西糖业集团廖平制糖有限公司", "糖业集团廖平制糖"] },
  "FM-GX-007": { name: "广西糖业集团良圻制糖有限公司", displayTag: null, aliases: ["广西糖业集团良圻制糖有限公司", "糖业集团良圻制糖"] },
  "FM-GX-008": { name: "横县东糖石塘糖业有限公司", displayTag: null, aliases: ["横县东糖石塘糖业有限公司", "横县东糖石塘糖业"] },
  "FM-GX-009": { name: "横州东糖峦城糖业有限公司", displayTag: null, aliases: ["横州东糖峦城糖业有限公司", "横州东糖峦城糖业"] },
  "WM-GX-001": { name: "南宁太阳纸业有限公司", displayTag: null, aliases: ["南宁太阳纸业有限公司", "南宁太阳纸业"] },
  "WM-GX-003": { name: "横县东糖糖业有限公司纸业分公司", displayTag: null, aliases: ["横县东糖糖业有限公司纸业分公司", "横县东糖糖业有限公司纸业分"] },
  "FM-GX-004": { name: "南宁东江制糖有限责任公司", displayTag: null, aliases: ["南宁东江制糖有限责任公司", "南宁东江制糖"] },
  "FM-GX-014": { name: "南宁香山制糖有限责任公司", displayTag: null, aliases: ["南宁香山制糖有限责任公司", "南宁香山制糖"] },
  "FM-GX-001": { name: "南宁明阳制糖有限责任公司", displayTag: null, aliases: ["南宁明阳制糖有限责任公司", "南宁明阳制糖"] },
  "FM-GX-010": { name: "南宁良庆东糖糖业有限公司", displayTag: null, aliases: ["南宁良庆东糖糖业有限公司", "南宁良庆东糖糖业"] },
  "FM-GX-006": { name: "广西糖业集团金光制糖有限公司", displayTag: null, aliases: ["广西糖业集团金光制糖有限公司", "糖业集团金光制糖"] },
  "FM-GX-012": { name: "广西隆安南华糖业有限责任公司南圩糖厂", displayTag: null, aliases: ["广西隆安南华糖业有限责任公司南圩糖厂", "隆安南华糖业有限责任公司南圩糖厂"] },
  "FM-GX-003": { name: "南宁伶利制糖有限责任公司", displayTag: null, aliases: ["南宁伶利制糖有限责任公司", "南宁伶利制糖"] },
  "FM-GX-011": { name: "广西马山惠美糖业有限责任公司", displayTag: null, aliases: ["广西马山惠美糖业有限责任公司", "马山惠美糖业"] },
  "WM-GX-002": { name: "广西和发强纸业有限公司", displayTag: null, aliases: ["广西和发强纸业有限公司", "和发强纸业"] },
  "MN-GX-019": { name: "南方锰业集团有限责任公司大新锰矿分公司", displayTag: null, aliases: ["南方锰业集团有限责任公司大新锰矿分公司", "南方锰业集团有限责任公司大新锰矿分"] },
  "SS-GX-009": { name: "广西南国铜业有限责任公司", displayTag: null, aliases: ["广西南国铜业有限责任公司", "南国铜业"] },
  "FM-GX-036": { name: "广西糖业集团红河制糖有限公司", displayTag: null, aliases: ["广西糖业集团红河制糖有限公司", "糖业集团红河制糖"] },
  "FM-GX-038": { name: "广西来宾小平阳湘桂制糖有限公司", displayTag: null, aliases: ["广西来宾小平阳湘桂制糖有限公司", "来宾小平阳湘桂制糖"] },
  "FM-GX-039": { name: "广西来宾湘桂糖业有限责任公司", displayTag: null, aliases: ["广西来宾湘桂糖业有限责任公司", "来宾湘桂糖业"] },
  "FM-GX-040": { name: "广西来宾东糖迁江有限公司", displayTag: null, aliases: ["广西来宾东糖迁江有限公司", "来宾东糖迁江"] },
  "FM-GX-042": { name: "广西来宾东糖凤凰有限公司", displayTag: null, aliases: ["广西来宾东糖凤凰有限公司", "来宾东糖凤凰"] },
  "FM-GX-043": { name: "广西来宾东糖桂宝有限公司", displayTag: null, aliases: ["广西来宾东糖桂宝有限公司", "来宾东糖桂宝"] },
  "MN-GX-014": { name: "广西汇元锰业有限责任公司", displayTag: null, aliases: ["广西汇元锰业有限责任公司", "汇元锰业"] },
  "SS-GX-011": { name: "来宾华锡冶炼有限公司", displayTag: null, aliases: ["来宾华锡冶炼有限公司", "来宾华锡冶炼"] },
  "SS-GX-018": { name: "广西铁合金有限责任公司", displayTag: null, aliases: ["广西铁合金有限责任公司"] },
  "WM-GX-012": { name: "广西来宾东糖纸业有限公司", displayTag: null, aliases: ["广西来宾东糖纸业有限公司", "来宾东糖纸业"] },
  "WM-GX-013": { name: "广西仙鹤新材料有限公司", displayTag: null, aliases: ["广西仙鹤新材料有限公司", "仙鹤新材料"] },
  "WM-GX-014": { name: "广西湘桂华糖制糖集团来宾纸业有限责任公司", displayTag: null, aliases: ["广西湘桂华糖制糖集团来宾纸业有限责任公司", "湘桂华糖制糖集团来宾纸业"] },
  "WM-GX-015": { name: "广西兴桂纸业有限公司", displayTag: null, aliases: ["广西兴桂纸业有限公司", "兴桂纸业"] },
  "FM-GX-048": { name: "合山市祥星制糖有限责任公司", displayTag: null, aliases: ["合山市祥星制糖有限责任公司", "合山市祥星制糖"] },
  "FM-GX-044": { name: "忻城南华糖业有限责任公司", displayTag: null, aliases: ["忻城南华糖业有限责任公司", "忻城南华糖业"] },
  "FM-GX-037": { name: "广西糖业集团黔江制糖有限公司", displayTag: null, aliases: ["广西糖业集团黔江制糖有限公司", "糖业集团黔江制糖"] },
  "FM-GX-045": { name: "广西博宣食品有限公司", displayTag: null, aliases: ["广西博宣食品有限公司", "博宣食品"] },
  "FM-GX-041": { name: "广西来宾东糖石龙有限公司", displayTag: null, aliases: ["广西来宾东糖石龙有限公司", "来宾东糖石龙"] },
  "FM-GX-046": { name: "广西博华食品有限公司", displayTag: null, aliases: ["广西博华食品有限公司", "博华食品"] },
  "MN-GX-013": { name: "广西下田锰矿有限责任公司", displayTag: null, aliases: ["广西下田锰矿有限责任公司", "下田锰矿"] },
  "SS-GX-021": { name: "广西飞南资源利用有限公司", displayTag: null, aliases: ["广西飞南资源利用有限公司", "飞南资源利用"] },
  "FM-GX-047": { name: "广西金秀东达制糖有限责任公司", displayTag: null, aliases: ["广西金秀东达制糖有限责任公司", "金秀东达制糖"] },
  "SS-GX-001": { name: "广西柳州钢铁集团有限公司（柳州本部）", displayTag: null, aliases: ["广西柳州钢铁集团有限公司", "柳州钢铁集团"] },
  "FM-GX-016": { name: "广西凤糖生化股份有限公司柳城糖厂", displayTag: null, aliases: ["广西凤糖生化股份有限公司柳城糖厂", "凤糖生化股份有限公司柳城糖厂"] },
  "FM-GX-017": { name: "广西凤糖六塘制糖有限责任公司", displayTag: null, aliases: ["广西凤糖六塘制糖有限责任公司", "凤糖六塘制糖"] },
  "FM-GX-015": { name: "广西糖业集团柳兴制糖有限公司", displayTag: null, aliases: ["广西糖业集团柳兴制糖有限公司", "糖业集团柳兴制糖"] },
  "FM-GX-018": { name: "广西凤糖柳江制糖有限责任公司", displayTag: null, aliases: ["广西凤糖柳江制糖有限责任公司", "凤糖柳江制糖"] },
  "SS-GX-030": { name: "广西融安兴隆锌业有限责任公司", displayTag: null, aliases: ["广西融安兴隆锌业有限责任公司", "融安兴隆锌业"] },
  "FM-GX-020": { name: "广西凤糖融水和睦制糖有限责任公司", displayTag: null, aliases: ["广西凤糖融水和睦制糖有限责任公司", "凤糖融水和睦制糖"] },
  "WM-GX-004": { name: "柳州市沁原纸业发展有限公司", displayTag: null, aliases: ["柳州市沁原纸业发展有限公司", "柳州市沁原纸业发展"] },
  "MN-GX-017": { name: "广西桂柳新材料股份有限公司", displayTag: null, aliases: ["广西桂柳新材料股份有限公司", "桂柳新材料"] },
  "FM-GX-019": { name: "广西凤糖鹿寨制糖有限责任公司", displayTag: null, aliases: ["广西凤糖鹿寨制糖有限责任公司", "凤糖鹿寨制糖"] },
  "WM-GX-005": { name: "广西凤糖鹿寨纸业有限公司", displayTag: null, aliases: ["广西凤糖鹿寨纸业有限公司", "凤糖鹿寨纸业"] },
  "SS-GX-019": { name: "广西桂康新材料有限公司", displayTag: null, aliases: ["广西桂康新材料有限公司", "桂康新材料"] },
  "SS-GX-015": { name: "广西梧州市西南特钢有限公司", displayTag: null, aliases: ["广西梧州市西南特钢有限公司", "梧州市西南特钢"] },
  "SS-GX-005": { name: "广西翅冀钢铁有限公司", displayTag: null, aliases: ["广西翅冀钢铁有限公司", "翅冀钢铁"] },
  "WM-GX-009": { name: "广西建晖纸业有限公司", displayTag: null, aliases: ["广西建晖纸业有限公司", "建晖纸业"] },
  "SS-GX-013": { name: "梧州市永达钢铁有限公司（永达钢铁集团）", displayTag: null, aliases: ["梧州市永达钢铁有限公司", "梧州市永达钢铁"] },
  "SS-GX-032": { name: "梧州市永达特钢有限公司", displayTag: null, aliases: ["梧州市永达特钢有限公司", "梧州市永达特钢"] },
  "SS-GX-033": { name: "广西梧州市金海不锈钢有限公司", displayTag: null, aliases: ["广西梧州市金海不锈钢有限公司", "梧州市金海不锈钢"] },
  "SS-GX-034": { name: "梧州市鑫峰特钢有限公司", displayTag: null, aliases: ["梧州市鑫峰特钢有限公司", "梧州市鑫峰特钢"] },
  "SS-GX-020": { name: "梧州金升铜业股份有限公司", displayTag: null, aliases: ["梧州金升铜业股份有限公司", "梧州金升铜业"] },
  "SS-GX-022": { name: "广西金翔铜业有限公司", displayTag: null, aliases: ["广西金翔铜业有限公司", "金翔铜业"] },
  "SS-GX-023": { name: "梧州华锡环保科技有限公司（原梧州华锡冶炼有限公司）", displayTag: null, aliases: ["梧州华锡环保科技有限公司", "梧州华锡环保科技"] },
  "SS-GX-024": { name: "广西震宇环保科技有限公司", displayTag: null, aliases: ["广西震宇环保科技有限公司", "震宇环保科技"] },
  "SS-GX-025": { name: "骆驼集团华南再生资源有限公司", displayTag: null, aliases: ["骆驼集团华南再生资源有限公司", "骆驼集团华南再生资源"] },
  "SS-GX-010": { name: "广西南丹南方金属有限公司", displayTag: null, aliases: ["广西南丹南方金属有限公司", "南丹南方金属"] },
  "SS-GX-012": { name: "南丹县南方有色金属有限责任公司（锌系统）", displayTag: null, aliases: ["南丹县南方有色金属有限责任公司", "南丹县南方有色金属"] },
  "FM-GX-031": { name: "广西糖业集团达华制糖有限公司", displayTag: null, aliases: ["广西糖业集团达华制糖有限公司", "糖业集团达华制糖"] },
  "FM-GX-032": { name: "广西博庆食品有限公司石别糖厂", displayTag: null, aliases: ["广西博庆食品有限公司石别糖厂", "博庆食品有限公司石别糖厂"] },
  "MN-GX-018": { name: "广西申亚锰业有限责任公司", displayTag: null, aliases: ["广西申亚锰业有限责任公司", "申亚锰业"] },
  "WM-GX-011": { name: "广西博冠环保制品有限公司", displayTag: null, aliases: ["广西博冠环保制品有限公司", "博冠环保制品"] },
  "FM-GX-034": { name: "广西凤糖罗城制糖有限责任公司", displayTag: null, aliases: ["广西凤糖罗城制糖有限责任公司", "凤糖罗城制糖"] },
  "FM-GX-035": { name: "广西都安湘桂糖业有限责任公司", displayTag: null, aliases: ["广西都安湘桂糖业有限责任公司", "都安湘桂糖业"] },
  "FM-GX-033": { name: "广西博东食品有限公司", displayTag: null, aliases: ["广西博东食品有限公司", "博东食品"] },
  "SS-GX-029": { name: "广西誉升锗业高新技术有限公司", displayTag: null, aliases: ["广西誉升锗业高新技术有限公司", "誉升锗业高新技术"] },
  "SS-GX-007": { name: "广西柳钢中金不锈钢有限公司", displayTag: null, aliases: ["广西柳钢中金不锈钢有限公司", "柳钢中金不锈钢"] },
  "SS-GX-026": { name: "广西银亿新材料有限公司", displayTag: null, aliases: ["广西银亿新材料有限公司", "银亿新材料"] },
  "SS-GX-027": { name: "广西华友新材料有限公司", displayTag: null, aliases: ["广西华友新材料有限公司", "华友新材料"] },
  "FM-GX-053": { name: "广西百色市万林糖业有限公司", displayTag: null, aliases: ["广西百色市万林糖业有限公司", "百色市万林糖业"] },
  "FM-GX-051": { name: "广西平果南华糖业有限责任公司", displayTag: null, aliases: ["广西平果南华糖业有限责任公司", "平果南华糖业"] },
  "RM-GX-001": { name: "中国铝业股份有限公司广西分公司", displayTag: null, aliases: ["中国铝业股份有限公司广西分公司", "中国铝业股份有限公司广西分"] },
  "RM-GX-002": { name: "广西华银铝业有限公司", displayTag: null, aliases: ["广西华银铝业有限公司", "华银铝业"] },
  "FM-GX-049": { name: "广西田东南华糖业有限责任公司一糖厂", displayTag: null, aliases: ["广西田东南华糖业有限责任公司一糖厂", "田东南华糖业有限责任公司一糖厂"] },
  "FM-GX-050": { name: "广西田东南华糖业有限责任公司二糖厂", displayTag: null, aliases: ["广西田东南华糖业有限责任公司二糖厂", "田东南华糖业有限责任公司二糖厂"] },
  "RM-GX-004": { name: "广西田东锦鑫化工有限公司", displayTag: null, aliases: ["广西田东锦鑫化工有限公司", "田东锦鑫化工"] },
  "WM-GX-017": { name: "广西春盛纸业有限公司", displayTag: null, aliases: ["广西春盛纸业有限公司", "春盛纸业"] },
  "FM-GX-052": { name: "广西田林和平糖业有限公司", displayTag: null, aliases: ["广西田林和平糖业有限公司", "田林和平糖业"] },
  "MN-GX-008": { name: "广西田阳桂航锰业有限公司", displayTag: null, aliases: ["广西田阳桂航锰业有限公司", "田阳桂航锰业"] },
  "WM-GX-016": { name: "田阳南华纸业有限公司", displayTag: null, aliases: ["田阳南华纸业有限公司", "田阳南华纸业"] },
  "MN-GX-001": { name: "靖西市鑫源锰业有限公司", displayTag: null, aliases: ["靖西市鑫源锰业有限公司", "靖西市鑫源锰业"] },
  "MN-GX-002": { name: "靖西市大西南锰业有限公司", displayTag: null, aliases: ["靖西市大西南锰业有限公司", "靖西市大西南锰业"] },
  "MN-GX-003": { name: "靖西湘潭电化科技有限公司", displayTag: null, aliases: ["靖西湘潭电化科技有限公司", "靖西湘潭电化科技"] },
  "MN-GX-004": { name: "广西靖西市一洲锰业有限公司", displayTag: null, aliases: ["广西靖西市一洲锰业有限公司", "靖西市一洲锰业"] },
  "MN-GX-005": { name: "广西斯达特锰材料有限公司", displayTag: null, aliases: ["广西斯达特锰材料有限公司", "斯达特锰材料"] },
  "MN-GX-006": { name: "靖西市锰矿有限责任公司", displayTag: null, aliases: ["靖西市锰矿有限责任公司", "靖西市锰矿"] },
  "MN-GX-007": { name: "靖西百矿锰业有限公司", displayTag: null, aliases: ["靖西百矿锰业有限公司", "靖西百矿锰业"] },
  "RM-GX-003": { name: "广西信发铝电有限公司", displayTag: null, aliases: ["广西信发铝电有限公司", "信发铝电"] },
  "RM-GX-005": { name: "靖西天桂铝业有限公司", displayTag: null, aliases: ["靖西天桂铝业有限公司", "靖西天桂铝业"] },
  "MN-GX-015": { name: "桂平南海科技有限公司", displayTag: null, aliases: ["桂平南海科技有限公司", "桂平南海科技"] },
  "MN-GX-016": { name: "广西远辰新能源材料有限责任公司", displayTag: null, aliases: ["广西远辰新能源材料有限责任公司", "远辰新能源材料"] },
  "FM-GX-028": { name: "广西糖业集团西江制糖有限公司", displayTag: null, aliases: ["广西糖业集团西江制糖有限公司", "糖业集团西江制糖"] },
  "FM-GX-030": { name: "广西广业贵糖糖业集团有限公司", displayTag: null, aliases: ["广西广业贵糖糖业集团有限公司", "广业贵糖糖业集团"] },
  "SS-GX-004": { name: "广西贵港钢铁集团有限公司", displayTag: null, aliases: ["广西贵港钢铁集团有限公司", "贵港钢铁集团"] },
  "WM-GX-010": { name: "广西广业贵糖糖业集团有限公司", displayTag: null, aliases: ["广西广业贵糖糖业集团有限公司", "广业贵糖糖业集团"] },
  "FM-GX-029": { name: "贵港市甘化糖业有限公司", displayTag: null, aliases: ["贵港市甘化糖业有限公司", "贵港市甘化糖业"] },
  "SS-GX-014": { name: "广西贵丰特钢有限公司", displayTag: null, aliases: ["广西贵丰特钢有限公司", "贵丰特钢"] },
  "SS-GX-017": { name: "广西贺州市科信达金属制品有限公司", displayTag: null, aliases: ["广西贺州市科信达金属制品有限公司", "贺州市科信达金属制品"] },
  "SS-GX-031": { name: "广西桂鑫钢铁集团有限公司", displayTag: null, aliases: ["广西桂鑫钢铁集团有限公司", "桂鑫钢铁集团"] },
  "SS-GX-028": { name: "中稀（广西）金源稀土新材料有限公司", displayTag: null, aliases: ["中稀金源稀土新材料有限公司", "中稀金源稀土新材料"] },
  "FM-GX-022": { name: "广西浦北县湘桂糖业有限责任公司", displayTag: null, aliases: ["广西浦北县湘桂糖业有限责任公司", "浦北县湘桂糖业"] },
  "FM-GX-025": { name: "广西浦北县安寨糖业有限公司", displayTag: null, aliases: ["广西浦北县安寨糖业有限公司", "浦北县安寨糖业"] },
  "FM-GX-023": { name: "广西陆屋欧亚糖业有限公司", displayTag: null, aliases: ["广西陆屋欧亚糖业有限公司", "陆屋欧亚糖业"] },
  "FM-GX-021": { name: "广西糖业集团平吉制糖有限公司", displayTag: null, aliases: ["广西糖业集团平吉制糖有限公司", "糖业集团平吉制糖"] },
  "MN-GX-009": { name: "广西埃索凯新材料科技有限公司", displayTag: null, aliases: ["广西埃索凯新材料科技有限公司", "埃索凯新材料科技"] },
  "MN-GX-010": { name: "钦州南海化工有限公司", displayTag: null, aliases: ["钦州南海化工有限公司", "钦州南海化工"] },
  "MN-GX-012": { name: "广西锰华新能源科技发展有限公司", displayTag: null, aliases: ["广西锰华新能源科技发展有限公司", "锰华新能源科技发展"] },
  "FM-GX-024": { name: "广西那彭欧亚糖业有限公司", displayTag: null, aliases: ["广西那彭欧亚糖业有限公司", "那彭欧亚糖业"] },
  "MN-GX-011": { name: "广西禹鼎新材料科技有限公司", displayTag: null, aliases: ["广西禹鼎新材料科技有限公司", "禹鼎新材料科技"] },
  "WM-GX-008": { name: "广西金桂浆纸业有限公司", displayTag: null, aliases: ["广西金桂浆纸业有限公司", "金桂浆纸业"] },
  "FM-GX-026": { name: "广西糖业集团昌菱制糖有限公司", displayTag: null, aliases: ["广西糖业集团昌菱制糖有限公司", "糖业集团昌菱制糖"] },
  "FM-GX-027": { name: "广西上上糖业有限公司", displayTag: null, aliases: ["广西上上糖业有限公司", "上上糖业"] },
  "RM-GX-006": { name: "广西华昇新材料有限公司", displayTag: null, aliases: ["广西华昇新材料有限公司", "华昇新材料"] },
  "SS-GX-002": { name: "广西钢铁集团有限公司（柳钢防城港基地）", displayTag: null, aliases: ["广西钢铁集团有限公司", "钢铁集团"] },
  "SS-GX-003": { name: "广西盛隆冶金有限公司", displayTag: null, aliases: ["广西盛隆冶金有限公司", "盛隆冶金"] },
  "SS-GX-008": { name: "广西金川有色金属有限公司", displayTag: null, aliases: ["广西金川有色金属有限公司", "金川有色金属"] },
  "SS-GX-016": { name: "防城港市福城钢铁制品有限公司", displayTag: null, aliases: ["防城港市福城钢铁制品有限公司", "防城港市福城钢铁制品"] },
};

/**
 * 身份词典：摘要和标题里出现的公司，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 本站信源以中文官方与媒体为主，企业名直接来自种子名录（ENTITIES 的 aliases 已覆盖），词典留空。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [];

/** 这些域名上的文章，发布方就是对应的公司（本站信源均为政府与媒体站点，无企业自发布域名）。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [];

/** 原文里的这些写法也算提到了对应公司。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [];
