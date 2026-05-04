'use client'
import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { ChevronDown } from 'lucide-react'

type Usuario = { id: string; nome: string; email: string; avatar_url?: string | null; ativo: boolean }

type Props = {
  value: string | null
  onChange: (nome: string) => void
  placeholder?: string
  borderColor?: string
}

export function UserSelect({ value, onChange, placeholder = 'Selecione', borderColor = '#EEEEF5' }: Props) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      // Tenta query direta primeiro (funciona quando a SELECT policy estiver ativa)
      const { data: direct } = await supabase
        .from('usuarios_permitidos')
        .select('id, nome, email, avatar_url, ativo')
        .eq('ativo', true)
        .order('nome')

      if (direct && direct.length > 0) {
        setUsuarios(direct)
        return
      }

      // Fallback: RPC SECURITY DEFINER (sem avatar_url)
      const { data: rpc } = await supabase.rpc('get_usuarios_com_ultimo_login')
      if (rpc) setUsuarios((rpc as Usuario[]).filter(u => u.ativo))
    }
    load()
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selected = usuarios.find(u => u.nome === value)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 10px', borderRadius: 8, border: `1px solid ${borderColor}`,
          background: '#fff', cursor: 'pointer', fontSize: 13, color: '#1A1A1A',
          fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        {selected ? (
          <>
            <Avatar url={selected.avatar_url ?? null} name={selected.nome} size={22} />
            <span style={{ flex: 1, fontWeight: 600 }}>{selected.nome}</span>
          </>
        ) : (
          <span style={{ flex: 1, color: '#9CA3AF' }}>{placeholder}</span>
        )}
        <ChevronDown size={14} color="#9CA3AF" />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          marginTop: 4, background: '#fff', borderRadius: 10,
          border: '1px solid #EEEEF5', boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
          overflow: 'hidden',
        }}>
          <div
            onClick={() => { onChange(''); setOpen(false) }}
            style={{ padding: '9px 12px', fontSize: 12, color: '#9CA3AF', cursor: 'pointer', borderBottom: '1px solid #F3F4F6' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}
          >
            {placeholder}
          </div>
          {usuarios.map(u => (
            <div
              key={u.id}
              onClick={() => { onChange(u.nome); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', cursor: 'pointer',
                background: value === u.nome ? '#FFF5F5' : '#fff',
                borderBottom: '1px solid #F3F4F6',
              }}
              onMouseEnter={e => { if (value !== u.nome) e.currentTarget.style.background = '#F9FAFB' }}
              onMouseLeave={e => { if (value !== u.nome) e.currentTarget.style.background = '#fff' }}
            >
              <Avatar url={u.avatar_url ?? null} name={u.nome} size={28} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{u.nome}</div>
                <div style={{ fontSize: 10, color: '#9CA3AF' }}>{u.email}</div>
              </div>
              {value === u.nome && (
                <div style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: '#E8001C', flexShrink: 0 }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Avatar({ url, name, size }: { url: string | null; name: string; size: number }) {
  const [failed, setFailed] = useState(false)
  const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()

  if (url && !failed) {
    return (
      <img
        src={url} alt={name} width={size} height={size}
        style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: '#E8001C', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 800, color: '#fff',
    }}>
      {initials}
    </div>
  )
}
