-- Fork（gxsw 部署）：articles_url_idx 为普通 btree(url)，行 >2704 字节的病态长 URL（超长
-- 查询串）在入库时撑爆索引——2026-10-30/31 两轮 penalty 巡检实测 identity 唯一索引与
-- url 索引先后炸（index row size 3360/3400 exceeds btree maximum 2704）。
-- 改为 md5(url) 函数索引：定长 32 字节无行限；URL 去重仍由 identity_key 唯一约束仲裁
-- （超长身份已改 urlh:<sha256>，见 packages/backend/src/lib/url.ts）。
-- 生产已手工建好同名索引（热修）：IF NOT EXISTS 重放为 no-op。旧 btree(url) 索引的
-- 在线删除在 0105（一文件一语句，见 scripts/migration-safety.ts 词汇表）。
CREATE INDEX CONCURRENTLY IF NOT EXISTS articles_url_md5_idx ON articles (md5(url));
