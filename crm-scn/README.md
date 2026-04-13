# CRM SCN & Co — V4

Sistema de CRM comercial para gestão de leads, pipeline e farmer.

## Stack

- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Banco de dados**: Supabase (PostgreSQL)
- **Deploy**: Vercel
- **Repositório**: GitHub

---

## 1. Configurar o Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um projeto
2. Vá em **SQL Editor** e execute o arquivo `supabase/migrations/001_initial_schema.sql`
3. Copie sua **Project URL** e **anon/public key** (em Settings → API)

---

## 2. Clonar e configurar o projeto

```bash
git clone https://github.com/SEU_USUARIO/crm-scn.git
cd crm-scn

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env.local
# Edite .env.local com suas credenciais do Supabase
```

Edite o `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

---

## 3. Importar dados da planilha (seed)

```bash
# Instalar dependências Python
pip install supabase pandas openpyxl

# Editar seed_supabase.py com suas credenciais
# e o caminho correto para a planilha
python seed_supabase.py
```

---

## 4. Rodar localmente

```bash
npm run dev
# Acesse http://localhost:3000
```

---

## 5. Deploy na Vercel

1. Faça push para o GitHub:
```bash
git add .
git commit -m "initial commit"
git push origin main
```

2. Acesse [vercel.com](https://vercel.com) → Import Project → selecione o repositório
3. Em **Environment Variables**, adicione:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Clique em **Deploy**

---

## Funcionalidades

### Dashboard
- KPIs: TCV fechado, Pipeline ativo, Total de leads, FUPs do dia
- Gráfico de temperatura dos leads (Frio / Morno / Quente / Fechado)
- Performance por closer (leads e vendas)
- Distribuição por origem e segmento
- Próximos follow ups

### Leads
- Tabela completa com todos os leads
- Filtros por closer, temperatura e situação
- Busca por empresa
- Criar, editar e excluir leads
- Todos os campos do acompanhamento: BANT, BUDGET, AUTORITY, NEED, TIMING...

### Pipeline (Kanban)
- Visualização Kanban por temperatura
- TCV por coluna
- Cards com próximos passos e data de FUP
- Clique para editar direto no card

### Farmer
- Seção para gestão de clientes ativos (monetização)
- Importação via seed script

---

## Estrutura do Projeto

```
crm-scn/
├── src/
│   ├── app/
│   │   ├── page.tsx          # App principal (CRM)
│   │   ├── layout.tsx
│   │   └── globals.css
│   └── lib/
│       └── supabase.ts       # Cliente Supabase + Types
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── seed_supabase.py           # Importação da planilha
├── .env.example
├── package.json
└── README.md
```

---

## Tabelas no Supabase

| Tabela | Descrição |
|--------|-----------|
| `leads` | Todos os leads do Acompanhamento |
| `pipeline` | Pipeline do Closer (Cockpit) |
| `metas` | Metas por período |
| `atividades_diarias` | Daily de atividades |
| `recomendacoes` | Lista de indicações |
| `farmer` | Clientes ativos / monetização |
