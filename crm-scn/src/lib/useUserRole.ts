'use client'
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Papel = 'admin' | 'sdr' | 'closer' | 'viewer'

type UserRole = {
  papel: Papel | null
  isAdmin: boolean
  canEdit: boolean
  isLoading: boolean
  email: string | null
}

const ADMIN_EMAIL = 'matheus.nunes@v4company.com'

export function useUserRole(): UserRole {
  const [papel, setPapel] = useState<Papel | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setIsLoading(false); return }
      const userEmail = session.user.email ?? null
      setEmail(userEmail)

      // Busca papel direto da tabela (RPC não inclui essa coluna)
      const { data } = await supabase
        .from('usuarios_permitidos')
        .select('papel')
        .eq('email', userEmail)
        .single()
      setPapel(data?.papel ?? (userEmail === ADMIN_EMAIL ? 'admin' : 'viewer'))
      setIsLoading(false)
    })
  }, [])

  const isAdmin = papel === 'admin' || email === ADMIN_EMAIL
  const canEdit = isAdmin || papel === 'sdr' || papel === 'closer'

  return { papel, isAdmin, canEdit, isLoading, email }
}

export const PAPEL_LABELS: Record<Papel, string> = {
  admin: 'Administrador',
  sdr: 'SDR',
  closer: 'Closer',
  viewer: 'Visualização',
}

export const PAPEL_COLORS: Record<Papel, { bg: string; text: string }> = {
  admin: { bg: '#FEF3C7', text: '#92400E' },
  sdr:   { bg: '#EDE9FE', text: '#5B21B6' },
  closer: { bg: '#DCFCE7', text: '#166534' },
  viewer: { bg: '#F3F4F6', text: '#6B7280' },
}
