-- 巡检企业名单（种子 xlsx 导入；后续由平台 API 定期刷新，见 backend/companies.ts）。
CREATE TABLE IF NOT EXISTS patrol_companies (
  id                 text PRIMARY KEY,               -- 平台企业主键（如 SS-GX-006）
  name               text NOT NULL,
  aliases            text[] NOT NULL DEFAULT '{}',   -- 去括号全名、简称
  city               text,
  county             text,
  address            text,
  category           text,                           -- 五类中文名
  category_key       text,                           -- red_mud / smelting_slag / manganese_slag / green_mud / white_mud
  waste_type_cn      text,
  lon                double precision,
  lat                double precision,
  origin             text NOT NULL DEFAULT 'seed' CHECK (origin IN ('seed', 'platform')),
  enabled            boolean NOT NULL DEFAULT true,
  platform_updated_at timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
)
