-- 0104 的另一半：把 0030 建出的 articles_url_idx（btree(url)）在线删除——病态长 URL
-- 撑爆其 2704 字节行限（事故与决策见 0104 头注）。生产已手工 DROP（热修），IF EXISTS
-- 重放为 no-op；全新库在 0104 建好 md5 函数索引后于此收敛到与生产一致的状态。
DROP INDEX CONCURRENTLY IF EXISTS articles_url_idx;
