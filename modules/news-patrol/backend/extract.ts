// 精选出品的实体抽取：对推送平台的每篇文章，按平台契约口径（docs/engine-platform-contract.md §2）
// 抽 company / project / penalty 实体。字段语义沿用平台旧 discovery 管线（EXTRACT_SYSTEM 平移）：
// quantityBasis 的 direct_waste / product_capacity_proxy 之别、代理值必须在 note 开头注明。
import { z } from "zod";
import { chatJson } from "@aihot/backend/providers/llm";
import { modelFor } from "@aihot/backend/editorial/models";

export const EXTRACT_PROMPT_VERSION = "patrol-extract-v2";

// 模型实测会把数值字段写成 JSON 数字（amount: 120、year: 2024）、把未知字段写成 null
// （city: null、penalty: null），而 Zod 的 .default() 只兜底键缺失——2026-10-31 巡检推送
// 17 篇精选整批因单字段类型不符被弃、每轮重抽重付。先归一化再校验（同 editorial/analyze 的 String(v ?? "") 习惯）。
const str = z.preprocess((v) => String(v ?? ""), z.string());

const PenaltySchema = z.object({
  decision: str,
  amount_yuan: z.number().nullable().default(null),
  doc_no: str,
  date: str,
  authority: str,
});

export const EntitySchema = z.object({
  type: z.enum(["company", "project", "penalty"]),
  name: z.string().min(1),
  city: str,
  county: str,
  address: str,
  category: str,
  // 非处罚实体模型常显式写 "penalty": null，optional() 只收键缺失，先归一成省略。
  penalty: z.preprocess((v) => (v == null ? undefined : v), PenaltySchema.optional()),
  year: str,
  month: str,
  amount: str,
  unit: str,
  quantity_basis: str,
  publish_date: str,
  tags: z.array(z.string()).default([]),
  note: str,
});

export const ExtractSchema = z.object({ entities: z.array(EntitySchema).default([]) });

export type ExtractedEntity = z.infer<typeof EntitySchema>;

const EXTRACT_SYSTEM = [
  "你是广西固废数据采集助手。从标题与正文合并信息中提取提到的广西固废产生企业、新建/改扩建项目实体和环保处罚实体。",
  "类别只限五类：赤泥、冶炼渣（含钢渣/高炉渣/冶金渣）、锰渣、绿泥（含滤泥）、白泥。无法判定的 category 留空。",
  "标题和正文必须互为线索：先用二者交叉确认同一主体，再互相补全企业、地点、类别和规模；不得因摘要不完整而省略正文已明确且被印证的信息。",
  "处罚实体（type=penalty）：name 填被处罚主体；penalty.decision 填处罚种类（罚款/责令改正/查封等），amount_yuan 填金额数字（未披露为 null），doc_no 填决定书文号，date 填处罚决定日期（YYYY-MM-DD），authority 填作出处罚的机关。",
  "项目实体（type=project）：name 填项目主体或项目名称；项目处理/利用/无害化规模（如 120万吨/年）也提取到 amount 和 unit，quantity_basis 填 direct_waste；这类值不是产生量时必须在 note 开头写明“项目处理/利用规模，非产生量：”。仅披露产品产能时可填 amount 并把 quantity_basis 填 product_capacity_proxy，note 保留原文。",
  "企业实体（type=company）：产量、堆存量披露时填 year（YYYY）、month（MM）、amount（万吨）、unit（万吨/年或万吨），quantity_basis 填 direct_waste。",
"city 带市字（如 崇左市），county 为区县；publish_date 填本页标注的发布时间（YYYY-MM-DD）；tags 从 用地/征地/堆场/扩产/投产/渗滤液/扬尘/事故/信访/综合利用/督察 中选；note 填能直接佐证企业、类别或数量的原文摘录。",
"所有字段值一律是字符串：amount、year、month 等数字也写成字符串（如 \"120\"、\"2024\"），不要写 JSON 数字；未知或未披露的字段直接省略键或写空字符串，不要写 null；penalty 只在处罚实体给出，其余实体省略该键。",
"没有符合条件的实体时返回 {\"entities\":[]}。只返回 JSON。",
].join("\n");

export interface ExtractInput {
  title: string;
  summary: string;
  bodyText: string | null;
}

/** 抽取一篇文章的实体。模型调用走引擎的付费回执与 MODEL_CALLS_ENABLED 阀。 */
export async function extractEntities(input: ExtractInput): Promise<ExtractedEntity[]> {
  const body = (input.bodyText ?? "").slice(0, 6000);
  const summary = input.summary.slice(0, 1500);
  const user = `标题：${input.title}\n摘要：${summary}\n正文：\n${body}`;
  const model = await modelFor("extractEntities");
  const { data } = await chatJson({
    model,
    purpose: "extract_entities",
    subject: "patrol:extract",
    promptVersion: EXTRACT_PROMPT_VERSION,
    system: EXTRACT_SYSTEM,
    user,
    schema: ExtractSchema,
    temperature: 0,
    maxTokens: 2500,
  });
  return data.entities;
}
