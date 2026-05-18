'use client'
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Papel = 'admin' | 'sdr' | 'closer' | 'viewer' | 'financeiro' | 'designer' | 'analista_midia' | 'gestor_projetos' | 'coordenador_peg'

type UserRole = {
  papel: Papel | null
  isAdmin: boolean
  canEdit: boolean
  canEditCockpit: boolean
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
  const canEdit = isAdmin || papel === 'sdr' || papel === 'closer' || papel === 'financeiro' || papel === 'coordenador_peg'
  const canEditCockpit = isAdmin || papel === 'financeiro' || papel === 'coordenador_peg' || papel === 'designer' || papel === 'analista_midia' || papel === 'gestor_projetos'

  return { papel, isAdmin, canEdit, canEditCockpit, isLoading, email }
}

export const PAPEL_LABELS: Record<Papel, string> = {
  admin:             'Administrador',
  sdr:               'SDR',
  closer:            'Closer',
  viewer:            'Visualização',
  financeiro:        'Financeiro',
  designer:          'Designer',
  analista_midia:    'Analista de Mídia',
  gestor_projetos:   'Gestor de Projetos',
  coordenador_peg:   'Coordenador de PE&G',
}

export const PAPEL_COLORS: Record<Papel, { bg: string; text: string }> = {
  admin:           { bg: '#FEF3C7', text: '#92400E' },
  sdr:             { bg: '#EDE9FE', text: '#5B21B6' },
  closer:          { bg: '#DCFCE7', text: '#166534' },
  viewer:          { bg: '#F3F4F6', text: '#6B7280' },
  financeiro:      { bg: '#DBEAFE', text: '#1D4ED8' },
  designer:        { bg: '#FCE7F3', text: '#9D174D' },
  analista_midia:  { bg: '#FEF9C3', text: '#854D0E' },
  gestor_projetos: { bg: '#D1FAE5', text: '#065F46' },
  coordenador_peg: { bg: '#F3E8FF', text: '#6B21A8' },
}
