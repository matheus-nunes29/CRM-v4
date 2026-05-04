'use client'
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type CloserUser = { nome: string; avatar_url?: string | null }

export function useCloserUsers(): CloserUser[] {
  const [closerUsers, setCloserUsers] = useState<CloserUser[]>([])

  useEffect(() => {
    async function load() {
      const [{ data: rpcData }, { data: directData }] = await Promise.all([
        supabase.rpc('get_usuarios_com_ultimo_login'),
        supabase.from('usuarios_permitidos').select('id, papel, avatar_url'),
      ])
      if (!rpcData) return
      const extra = Object.fromEntries((directData || []).map((u: any) => [u.id, u]))
      const merged = (rpcData as any[]).map(u => ({
        ...u,
        papel: extra[u.id]?.papel ?? null,
        avatar_url: extra[u.id]?.avatar_url ?? u.avatar_url,
      }))
      setCloserUsers(merged.filter(u => u.ativo && ['admin', 'closer'].includes(u.papel)))
    }
    load()
  }, [])

  return closerUsers
}
