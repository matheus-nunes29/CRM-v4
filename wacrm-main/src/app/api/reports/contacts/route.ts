import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).single()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })

  const { data: contacts } = await supabase
    .from('contacts')
    .select('name, phone, email, company, utm_source, utm_medium, utm_campaign, utm_content, utm_term, gclid, created_at')
    .eq('account_id', profile.account_id)
    .order('created_at', { ascending: false })

  const header = 'Nome,Telefone,Email,Empresa,Fonte,Mídia,Campanha,Conteúdo,Termo,GCLID,Criado em'
  const rows = (contacts ?? []).map((c) =>
    [
      c.name ?? '',
      c.phone,
      c.email ?? '',
      c.company ?? '',
      c.utm_source ?? '',
      c.utm_medium ?? '',
      c.utm_campaign ?? '',
      c.utm_content ?? '',
      c.utm_term ?? '',
      c.gclid ?? '',
      c.created_at,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  )

  const csv = [header, ...rows].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="contatos_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
