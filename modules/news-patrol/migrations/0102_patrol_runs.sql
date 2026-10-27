-- 每次巡检的运行记录（job_runs 之外的业务统计：查询数、命中数、抓取数、入库数与时间窗）。
CREATE TABLE IF NOT EXISTS patrol_runs (
  id          bigserial PRIMARY KEY,
  line        text NOT NULL CHECK (line IN ('penalty', 'enterprise', 'project', 'sources', 'topic')),
  window_start date NOT NULL,
  window_end  date NOT NULL,
  queries     integer NOT NULL DEFAULT 0,
  hits        integer NOT NULL DEFAULT 0,
  fetched     integer NOT NULL DEFAULT 0,
  ingested    integer NOT NULL DEFAULT 0,
  skipped     integer NOT NULL DEFAULT 0,
  error       text,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
)
