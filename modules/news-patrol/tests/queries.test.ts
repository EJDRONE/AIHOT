// 查询矩阵：企业名去括号、类别词拼装、128 字符上限、库外主题查询与校准信源字典。
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCompanyQuery, buildSourceQueries, buildTopicQueries, stripNameSuffix, CATEGORY_TERMS, CALIBRATED_SOURCES } from "../backend/queries.ts";

const company = (over: Partial<Parameters<typeof buildCompanyQuery>[0]> = {}) => ({
  id: "SS-GX-006", name: "广西北港新材料有限公司（不锈钢）", aliases: ["广西北港新材料有限公司"], category: "冶炼渣", category_key: "smelting_slag", ...over,
});

test("企业名去括号后缀", () => {
  assert.equal(stripNameSuffix("广西北港新材料有限公司（不锈钢）"), "广西北港新材料有限公司");
  assert.equal(stripNameSuffix("玖龙纸业（北海）有限公司"), "玖龙纸业有限公司");
  assert.equal(stripNameSuffix("无备注公司"), "无备注公司");
});

test("处罚线查询：精确企业名 + 处罚词", () => {
  const q = buildCompanyQuery(company(), "penalty");
  assert.ok(q.startsWith('"广西北港新材料有限公司" (处罚 OR 罚款'));
  assert.ok(q.length <= 128);
});

test("企业线查询带类别词（冶炼渣含钢渣/高炉渣）与用地堆场词", () => {
  const q = buildCompanyQuery(company(), "enterprise");
  assert.match(q, /冶炼渣|钢渣|高炉渣/);
  assert.match(q, /用地|堆场/);
});

test("项目线查询带环评备案词", () => {
  const q = buildCompanyQuery(company(), "project");
  assert.match(q, /环评|备案|开工/);
});

test("未知类别的企业回落到固废通用词", () => {
  const q = buildCompanyQuery(company({ category: null, category_key: null }), "enterprise");
  assert.match(q, /固废/);
});

test("超长企业名回落到核心词且不超 128 字符", () => {
  const long = company({ name: `广西${"某超长名字".repeat(12)}有限公司（备注）` });
  for (const line of ["penalty", "enterprise", "project"] as const) {
    assert.ok(buildCompanyQuery(long, line).length <= 128, line);
  }
});

test("库外主题查询覆盖五类", () => {
  const queries = buildTopicQueries();
  assert.equal(queries.length, Object.keys(CATEGORY_TERMS).length);
  for (const q of queries) {
    assert.match(q, /^广西 \(/);
    assert.ok(q.length <= 128);
  }
  const joined = queries.join(" ");
  for (const term of ["赤泥", "锰渣", "滤泥", "白泥", "钢渣"]) assert.ok(joined.includes(term), term);
});

test("校准信源字典：19 站、regional 不带 site:、其余限定域名", () => {
  assert.equal(CALIBRATED_SOURCES.length, 19);
  const queries = buildSourceQueries();
  assert.equal(queries.length, 19);
  const regional = queries.filter((q) => !q.includes("site:"));
  assert.equal(regional.length, 2);
  assert.ok(queries.some((q) => q.includes("site:sthjt.gxzf.gov.cn")));
  assert.ok(queries.every((q) => q.length <= 128));
});
