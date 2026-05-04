"""
fix_encoding_db.py — Corrige dupla codificação (UTF-8→Latin-1) nos registros do Supabase.
Uso: python fix_encoding_db.py

Antes: pip install supabase
Preencha SUPABASE_URL e SUPABASE_KEY com as mesmas credenciais do seed_supabase.py.
"""

from supabase import create_client

SUPABASE_URL = "https://fkbwxhjjlsjgpwttgbdw.supabase.co"
SUPABASE_KEY = "sb_publishable_TkOUstnZ_GGSsUIO4WTI6g_eKaUaJQS"

# Campos de texto que podem estar com encoding errado
CAMPOS_TEXTO = [
    'empresa', 'origem', 'nome_lead', 'cargo', 'segmento', 'faturamento',
    'urgencia', 'conexao', 'situacao_bdr', 'situacao_pre_vendas',
    'situacao_closer', 'temperatura', 'proximos_passos', 'produto_vendido',
    'closer', 'tier', 'broker', 'observacao',
]

def fix_encoding(s):
    """Reverte dupla codificação: 'RecomendaÃ§Ã£o' → 'Recomendação'"""
    if not isinstance(s, str):
        return s
    try:
        return s.encode('latin-1').decode('utf-8')
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s

def needs_fix(s):
    """Verifica se a string tem caracteres típicos de dupla codificação."""
    if not isinstance(s, str):
        return False
    garbled = ['Ã§', 'Ã£', 'Ã¡', 'Ã©', 'Ã³', 'Ãº', 'Ã ', 'Ã­', 'Ã\x83', 'Â']
    return any(g in s for g in garbled)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

print("🔍 Buscando leads no banco...")
response = supabase.table('leads').select('*').execute()
leads = response.data
print(f"   {len(leads)} leads encontrados")

corrigidos = 0
for lead in leads:
    updates = {}
    for campo in CAMPOS_TEXTO:
        valor = lead.get(campo)
        if needs_fix(valor):
            updates[campo] = fix_encoding(valor)

    if updates:
        supabase.table('leads').update(updates).eq('id', lead['id']).execute()
        corrigidos += 1
        empresa = updates.get('empresa') or lead.get('empresa', lead['id'])
        print(f"   ✅ Corrigido: {empresa} — campos: {list(updates.keys())}")

print(f"\n🎉 {corrigidos} leads corrigidos de {len(leads)} total.")
