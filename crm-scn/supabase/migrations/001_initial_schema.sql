-- CRM SCN & Co - Schema inicial

-- Leads / Acompanhamento
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa TEXT NOT NULL,
  origem TEXT,
  data_entrada DATE,
  mes_entrada TEXT,
  broker NUMERIC,
  tier TEXT,
  faturamento TEXT,
  cargo TEXT,
  urgencia TEXT,
  segmento TEXT,
  conexao TEXT,
  data_ra DATE,
  mes_ra TEXT,
  situacao_bdr TEXT,
  data_rr DATE,
  mes_rr TEXT,
  bant INTEGER,
  budget TEXT,
  autority TEXT,
  need TEXT,
  timing TEXT,
  closer TEXT,
  reuniao_agendada TEXT,
  show TEXT,
  temperatura TEXT CHECK (temperatura IN ('FRIO', 'MORNO', 'QUENTE', 'FECHADO')),
  recomendacoes TEXT,
  situacao_closer TEXT,
  proximos_passos TEXT,
  data_fup DATE,
  tcv NUMERIC,
  venda TEXT,
  data_assinatura DATE,
  mes_assinatura TEXT,
  data_ativacao DATE,
  inicio_projeto DATE,
  primeiro_pagamento DATE,
  produto_vendido TEXT,
  handover TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pipeline do Closer (Cockpit)
CREATE TABLE pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead TEXT NOT NULL,
  closer TEXT,
  temperatura TEXT CHECK (temperatura IN ('FRIO', 'MORNO', 'QUENTE', 'FECHADO')),
  status TEXT,
  proximos_passos TEXT,
  data_fup DATE,
  mes_referencia TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Metas por período
CREATE TABLE metas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo TEXT NOT NULL,   -- ex: '2026-04'
  tipo TEXT NOT NULL,      -- 'inbound' | 'outbound'
  tcv_meta NUMERIC,
  tcv_realizado NUMERIC,
  tm_meta NUMERIC,
  vendas_meta INTEGER,
  vendas_realizado INTEGER,
  rr_meta INTEGER,
  rr_realizado INTEGER,
  rm_meta NUMERIC,
  leads_meta NUMERIC,
  investimento NUMERIC,
  roas NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Atividades diárias (Daily)
CREATE TABLE atividades_diarias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL,
  tipo TEXT NOT NULL,  -- 'LEADS','R_AGENDADA','R_REALIZADA','VENDAS'
  planejado NUMERIC,
  realizado NUMERIC,
  semana TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lista de recomendações
CREATE TABLE recomendacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa TEXT,
  nome_pessoa TEXT,
  telefone TEXT,
  quem_passou TEXT,
  observacao TEXT,
  situacao TEXT,
  data DATE,
  mes TEXT,
  timing TEXT,
  conexao TEXT,
  closer TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Farmer (clientes ativos)
CREATE TABLE farmer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente TEXT NOT NULL,
  head_squad TEXT,
  fee_mensal NUMERIC,
  temperatura TEXT,
  tier TEXT,
  mod_vendas TEXT,
  fat_mensal NUMERIC,
  fat_anual NUMERIC,
  produto_servico TEXT,
  escopo TEXT,
  valores NUMERIC,
  reuniao_marcada BOOLEAN DEFAULT FALSE,
  reuniao_acontecida BOOLEAN DEFAULT FALSE,
  no_show BOOLEAN DEFAULT FALSE,
  data_reuniao DATE,
  venda BOOLEAN DEFAULT FALSE,
  mrr_assinado NUMERIC DEFAULT 0,
  onetime_assinado NUMERIC DEFAULT 0,
  data_assinatura DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_leads_temperatura ON leads(temperatura);
CREATE INDEX idx_leads_closer ON leads(closer);
CREATE INDEX idx_leads_situacao_closer ON leads(situacao_closer);
CREATE INDEX idx_leads_data_fup ON leads(data_fup);
CREATE INDEX idx_pipeline_closer ON pipeline(closer);
CREATE INDEX idx_pipeline_mes ON pipeline(mes_referencia);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_leads_updated BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_pipeline_updated BEFORE UPDATE ON pipeline FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_farmer_updated BEFORE UPDATE ON farmer FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_recom_updated BEFORE UPDATE ON recomendacoes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS (Row Level Security) - habilitar após configurar auth
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE metas ENABLE ROW LEVEL SECURITY;
ALTER TABLE atividades_diarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE recomendacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE farmer ENABLE ROW LEVEL SECURITY;

-- Políticas abertas para começar (ajuste com auth depois)
CREATE POLICY "allow_all_leads" ON leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_pipeline" ON pipeline FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_metas" ON metas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_atividades" ON atividades_diarias FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_recom" ON recomendacoes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_farmer" ON farmer FOR ALL USING (true) WITH CHECK (true);
