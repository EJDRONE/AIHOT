-- Fork（gxsw 部署）：articles_url_idx 为普通 btree(url)，行 >2704 字节的病态长 URL（超长
-- 查询串）在入库时撑爆索引——2026-10-30/31 两轮 penalty 巡检实测 identity 唯一索引与
-- url 索引先后炸（index row size 3360/3400 exceeds btree maximum 2704）。
-- 改为 md5(url) 函数索引：定长 32 字节无行限；URL 去重仍由 identity_key 唯一约束仲裁
-- （超长身份已改 urlh:<sha256>，见 packages/backend/src/lib/url.ts）。
-- 唯一按原始 url 等值查的消费点=admin 内容搜索（content.ts），转为 seq scan 兜底
-- （表量级可接受，且同一查询已 OR identity_key 命中路径）。
DROP INDEX IF EXISTS articles_url_idx;
CREATE INDEX IF NOT EXISTS articles_url_md5_idx ON articles (md5(url));
