'use client'
export const dynamic = 'force-dynamic'
import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import CRMLayout from '../_components/CRMLayout'
import { R, WHITE, GRAY1, GRAY2, GRAY3, GRAY4, GREEN } from '@/lib/crm-constants'

const BORDER = '#E5E7EB'
const BLUE   = '#3B82F6'
const PURPLE = '#8B5CF6'

const TOOLS = [
  {
    id: 'scripts',
    href: '/scripts',
    icon: '📋',
    color: R,
    bg: `#FFF1F2`,
    border: `#FECDD3`,
    label: 'Scripts & Playbook',
    subtitle: 'SPICED · Pré-Vendas',
    description: 'Scripts interativos por tipo de lead (Inbound, Recovery, Recomendação, Prospecção). Busca inteligente de objeções, checklist de call e edição colaborativa.',
    tags: ['Inbound', 'Recovery', 'Objeções', 'Checklist'],
  },
  {
    id: 'roi',
    href: '/calculadoras/roi',
    icon: '📈',
    color: GREEN,
    bg: '#F0FDF4',
    border: '#BBF7D0',
    label: 'Calculadora de Ganho',
    subtitle: 'ROI · CAC · ROAS',
    description: 'Simule o retorno sobre investimento com base no faturamento atual, ticket médio, margem e investimento. Calcula ROI, ROAS e CAC automaticamente.',
    tags: ['ROI', 'ROAS', 'CAC', 'Simulação'],
  },
  {
    id: 'executar',
    href: '/calculadoras/executar',
    icon: '⚙️',
    color: BLUE,
    bg: '#EFF6FF',
    border: '#BFDBFE',
    label: 'Calculadora Executar',
    subtitle: 'Planejamento · Metas',
    description: 'Ferramenta de planejamento para definir metas, calcular capacidade operacional e dimensionar a estrutura necessária para atingir os objetivos.',
    tags: ['Metas', 'Capacidade', 'Planejamento'],
  },
]

export default function FerramentasPage() {
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
    })
  }, [])

  return (
    <CRMLayout title="Ferramentas">
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: R, textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 6 }}>CRM V4</div>
          <h1 style={{ fontSize: 30, fontWeight: 900, color: GRAY1, margin: 0, letterSpacing: '-0.02em' }}>Ferramentas</h1>
          <p style={{ fontSize: 14, color: GRAY2, marginTop: 8, marginBottom: 0 }}>
            Scripts de vendas, calculadoras e recursos para o time comercial.
          </p>
        </div>

        {/* Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {TOOLS.map(tool => (
            <div
              key={tool.id}
              onClick={() => router.push(tool.href)}
              style={{
                background: WHITE,
                border: `1.5px solid ${BORDER}`,
                borderRadius: 18,
                padding: '28px 28px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 22,
                boxShadow: '0 1px 4px rgba(0,0,0,.05)',
                transition: 'all .2s cubic-bezier(.22,1,.36,1)',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLDivElement
                el.style.border = `1.5px solid ${tool.color}50`
                el.style.boxShadow = `0 8px 28px ${tool.color}18`
                el.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLDivElement
                el.style.border = `1.5px solid ${BORDER}`
                el.style.boxShadow = '0 1px 4px rgba(0,0,0,.05)'
                el.style.transform = 'translateY(0)'
              }}
            >
              {/* Ícone */}
              <div style={{
                width: 60, height: 60, borderRadius: 16,
                background: tool.bg,
                border: `1.5px solid ${tool.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26, flexShrink: 0,
              }}>
                {tool.icon}
              </div>

              {/* Conteúdo */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 18, fontWeight: 900, color: GRAY1 }}>{tool.label}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 800, color: tool.color,
                    background: tool.bg, border: `1px solid ${tool.border}`,
                    padding: '2px 9px', borderRadius: 20, letterSpacing: '0.06em',
                  }}>{tool.subtitle}</span>
                </div>
                <p style={{ fontSize: 14, color: GRAY2, lineHeight: 1.6, margin: '0 0 12px 0' }}>
                  {tool.description}
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {tool.tags.map(tag => (
                    <span key={tag} style={{
                      fontSize: 11, fontWeight: 700, color: GRAY2,
                      background: GRAY4, borderRadius: 8,
                      padding: '3px 10px',
                    }}>{tag}</span>
                  ))}
                </div>
              </div>

              {/* Seta */}
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: tool.bg, border: `1px solid ${tool.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: tool.color, fontSize: 18, fontWeight: 900, marginTop: 2,
              }}>
                →
              </div>
            </div>
          ))}
        </div>

        <div style={{ height: 40 }} />
      </div>
    </CRMLayout>
  )
}
