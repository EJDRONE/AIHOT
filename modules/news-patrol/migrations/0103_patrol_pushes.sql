-- 精选出品的平台推送账本：一篇文章只推一次（article_id 幂等），记录抽取的实体与平台回执。
CREATE TABLE IF NOT EXISTS patrol_pushes (
  article_id  text PRIMARY KEY REFERENCES articles (id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'rejected')),
  entities    jsonb,
  platform_id text,
  attempts    integer NOT NULL DEFAULT 0,
  last_error  text,
  pushed_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
)
