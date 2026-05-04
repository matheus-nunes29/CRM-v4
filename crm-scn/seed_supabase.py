"""
seed_supabase.py — Importa dados da planilha para o Supabase
Uso: python seed_supabase.py

Antes: pip install supabase pandas openpyxl
Preencha SUPABASE_URL e SUPABASE_KEY abaixo.
"""

import pandas as pd
from supabase import create_client
import math, sys

SUPABASE_URL = "https://xxxxxxxxxxxxxxxxxxxx.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
EXCEL_PATH   = "Dash_RECEITAS_SCN___Co.xlsx"

def fix_encoding(s):
    """Corrige dupla codificação UTF-8→Latin-1 (ex: 'RecomendaÃ§Ã£o' → 'Recomendação')."""
    if not isinstance(s, str):
        return s
    try:
        return s.encode('latin-1').decode('utf-8')
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s

def clean(v):
    """Converte NaN / Timestamp para tipos Python limpos."""
    if v is None: return None
    if isinstance(v, float) and math.isnan(v): return None
    if hasattr(v, 'strftime'): return v.strftime('%Y-%m-%d')
    if isinstance(v, str): return fix_encoding(v)
    return v

def row_to_dict(row, mapping):
    return {k: clean(row.get(v)) for k, v in mapping.items()}

def chunk(lst, n=100):
    for i in range(0, len(lst), n):
        yield lst[i:i+n]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

print("📂 Lendo planilha…")
xl = pd.ExcelFile(EXCEL_PATH)

# ─── Acompanhamento → leads ──────────────────────────────────────────────────
print("⬆️  Importando leads (Acompanhamento)…")
df = pd.read_excel(EXCEL_PATH, sheet_name='Acompanhamento', header=None)
df.columns = df.iloc[0]
df = df.iloc[1:].reset_index(drop=True)
df = df.dropna(subset=['EMPRESA'])

mapping = {
    'empresa':          'EMPRESA',
    'origem':           'Origem',
    'mes_entrada':      'MÊS ENTRADA',
    'broker':           '💸 BROKER',
    'tier':             'TIER',
    'faturamento':      'FATURAMENTO',
    'cargo':            'CARGO',
    'urgencia':         'URGÊNCIA',
    'segmento':         'SEGMENTO',
    'conexao':          'CONEXÃO',
    'mes_ra':           'MÊS RA',
    'situacao_bdr':     'SITUAÇÃO BDR',
    'mes_rr':           'MÊS RR',
    'budget':           'BUDGET',
    'autority':         'AUTORITY',
    'need':             'NEED',
    'timing':           'TIMING',
    'closer':           'CLOSER',
    'temperatura':      'TEMPERATURA',
    'situacao_closer':  'SITUAÇÃO CLOSER',
    'proximos_passos':  'PRÓXIMOS PASSOS',
    'tcv':              'TCV',
    'venda':            'VENDA?',
    'mes_assinatura':   'MÊS ASSINATURA',
    'produto_vendido':  'PRODUTO VENDIDO',
    'handover':         'HANDOVER',
}
date_mapping = {
    'data_entrada': 'DATA ENTRADA',
    'data_ra':      'DATA RA',
    'data_rr':      'DATA RR',
    'data_fup':     'DATA FUP',
    'data_assinatura': 'DATA ASSINATURA',
    'data_ativacao':   'DATA ATIVAÇÃO',
    'inicio_projeto':  'INÍCIO PROJETO',
    'primeiro_pagamento': '1º PAGAMENTO',
}
bant_col = 'BANT'

records = []
for _, row in df.iterrows():
    d = row_to_dict(row, mapping)
    for k, col in date_mapping.items():
        v = clean(row.get(col))
        d[k] = v
    # BANT como int
    bv = clean(row.get(bant_col))
    try: d['bant'] = int(bv) if bv is not None else None
    except: d['bant'] = None
    # TCV como float
    try: d['tcv'] = float(d['tcv']) if d['tcv'] is not None else None
    except: d['tcv'] = None
    # BROKER como float
    try: d['broker'] = float(d['broker']) if d['broker'] is not None else None
    except: d['broker'] = None
    records.append(d)

inserted = 0
for batch in chunk(records):
    supabase.table('leads').insert(batch).execute()
    inserted += len(batch)
    print(f"  {inserted}/{len(records)} leads…")

print(f"✅ {inserted} leads importados")

# ─── Cockpit ABR → pipeline ──────────────────────────────────────────────────
print("⬆️  Importando pipeline (Cockpit ABR)…")
df2 = pd.read_excel(EXCEL_PATH, sheet_name='Cockpit ABR', header=None)
pipe_rows = df2.iloc[5:50, 25:31].copy()
pipe_rows.columns = ['lead', 'closer', 'temperatura', 'status', 'proximos_passos', 'data_fup']
pipe_rows = pipe_rows.dropna(subset=['lead'])
pipe_rows = pipe_rows[pipe_rows['lead'].astype(str).str.strip() != '']

pipe_records = []
for _, row in pipe_rows.iterrows():
    pipe_records.append({
        'lead':            clean(row['lead']),
        'closer':          clean(row['closer']),
        'temperatura':     clean(row['temperatura']),
        'status':          clean(row['status']),
        'proximos_passos': clean(row['proximos_passos']),
        'data_fup':        clean(row['data_fup']),
        'mes_referencia':  '2026-04',
    })

if pipe_records:
    supabase.table('pipeline').insert(pipe_records).execute()
    print(f"✅ {len(pipe_records)} itens de pipeline importados")

# ─── Lista Recomendações ──────────────────────────────────────────────────────
print("⬆️  Importando recomendações…")
df3 = pd.read_excel(EXCEL_PATH, sheet_name='Lista Recomindica', header=None)
df3.columns = df3.iloc[0]
df3 = df3.iloc[1:].reset_index(drop=True)

rec_records = []
for _, row in df3.iterrows():
    emp = clean(row.get('Empresa'))
    if not emp: continue
    rec_records.append({
        'empresa':     emp,
        'nome_pessoa': clean(row.get('Nome da Pessoa')),
        'telefone':    clean(row.get('Telefone')),
        'quem_passou': clean(row.get('Quem Passou')),
        'observacao':  clean(row.get('Observação')),
        'situacao':    clean(row.get('Situação')),
        'mes':         clean(row.get('Mês')),
        'closer':      clean(row.get('Closer')),
    })

if rec_records:
    for batch in chunk(rec_records):
        supabase.table('recomendacoes').insert(batch).execute()
    print(f"✅ {len(rec_records)} recomendações importadas")

print("\n🎉 Seed concluído com sucesso!")
