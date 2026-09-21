-- TAB 5 — Escenario A: seguimiento (watchlist, re-chequeo, delta).
-- Decision del 13/9, ejecutada el 21/9.

-- ---------------------------------------------------------------------------
-- watchlist: un nicho vigilado por un usuario.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  producto TEXT NOT NULL,
  pais TEXT NOT NULL,
  perfil_vendedor TEXT NOT NULL DEFAULT 'principiante',
  costo_estimado NUMERIC,

  -- La keyword que EFECTIVAMENTE se scrapea. Si el analisis de origen cayo al
  -- fallback de keyword simplificada, el re-chequeo tiene que repetir esa misma
  -- keyword: scrapear otra compara dos mercados distintos y lo reporta como si
  -- el nicho hubiera cambiado.
  search_keyword TEXT,

  analysis_id UUID REFERENCES analyses(id) ON DELETE SET NULL,

  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_check_at TIMESTAMPTZ,

  CONSTRAINT watchlist_unica UNIQUE (user_id, producto, pais, perfil_vendedor)
);

CREATE INDEX IF NOT EXISTS watchlist_user_idx ON watchlist (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- watch_runs: la serie temporal. Cada fila es una medicion del nicho.
-- Es lo que hace posible el diff: sin historia no hay delta.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS watch_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id UUID NOT NULL REFERENCES watchlist(id) ON DELETE CASCADE,

  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  origen TEXT NOT NULL DEFAULT 'manual',
  CONSTRAINT watch_runs_origen_valido CHECK (origen IN ('analisis','manual','cron')),

  status TEXT NOT NULL DEFAULT 'pending',
  CONSTRAINT watch_runs_status_valido CHECK (status IN ('pending','scraping','done','error')),

  n_listings INT,
  precio_stats JSONB,   -- PrecioStats de lib/confianza.ts
  metricas JSONB,       -- MetricasScrape de lib/score.ts (TAB 3)

  -- Los nombres de vendedor, normalizados. Es lo unico que permite decir
  -- "entraron 12 vendedores nuevos" en vez de "el conteo subio 12": pueden
  -- haber entrado 15 y salido 3, y el conteo no distingue los dos casos.
  vendedores TEXT[],

  -- Snapshot acotado para poder mostrar QUE publicacion aparecio, no solo
  -- cuantas. A proposito NO se guardan los 30 listings crudos: 52 semanas x N
  -- nichos x 30 filas de jsonb crece rapido y el diff no lo necesita.
  top_listings JSONB,

  score INT,
  score_detalle JSONB,

  -- Version de la formula (FORMULA_VERSION). El TAB 3 la dejo puesta justo para
  -- esto: sin ella, el delta del score compararia dos formulas distintas y
  -- atribuiria al mercado un cambio que fue nuestro.
  formula TEXT,

  apify_run_id TEXT,
  error_message TEXT,

  -- Estado del aviso, no del dato. Vive aca y no en una tabla aparte porque es
  -- lo unico del delta que NO es derivable: si ya se mando el mail o no.
  notificado_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS watch_runs_serie_idx
  ON watch_runs (watchlist_id, fetched_at DESC);

-- Una sola corrida en vuelo por nicho: evita que el boton "re-chequear"
-- apretado dos veces pague dos scrapes.
CREATE UNIQUE INDEX IF NOT EXISTS watch_runs_una_en_vuelo
  ON watch_runs (watchlist_id)
  WHERE status IN ('pending','scraping');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "watchlist: el dueno lee" ON watchlist
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "watchlist: el dueno inserta" ON watchlist
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "watchlist: el dueno actualiza" ON watchlist
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "watchlist: el dueno borra" ON watchlist
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Las corridas se leen a traves del nicho. A diferencia de `analyses`, NO hay
-- policy para anon: un analisis se comparte por link, la vigilancia de un nicho
-- es del usuario. Escribe unicamente el service role desde Inngest.
CREATE POLICY "watch_runs: el dueno del nicho lee" ON watch_runs
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM watchlist w
      WHERE w.id = watch_runs.watchlist_id AND w.user_id = auth.uid()
    )
  );
