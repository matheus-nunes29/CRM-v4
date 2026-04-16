'use client'
import React from 'react'
import { Snowflake, ThermometerSun, Flame, CheckCircle2 } from 'lucide-react'
import { TEMP_COLORS, SPV_COLORS, GRAY2, BLUE, YELLOW, R, GREEN } from './crm-constants'

export function TempBadge({ temp }: { temp: string | null }) {
  if (!temp) return <span style={{ color: GRAY2, fontSize: 11 }}>—</span>
  const icons: Record<string, React.ReactNode> = {
    FRIO: <Snowflake size={9} />, MORNO: <ThermometerSun size={9} />,
    QUENTE: <Flame size={9} />, FECHADO: <CheckCircle2 size={9} />,
  }
  const c = TEMP_COLORS[temp] || GRAY2
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: `${c}18`, color: c, border: `1px solid ${c}33` }}>
      {icons[temp]} {temp}
    </span>
  )
}

export function SitBadge({ s }: { s: string | null }) {
  if (!s) return <span style={{ color: GRAY2, fontSize: 11 }}>—</span>
  const map: Record<string, string> = { 'EM FOLLOW UP': BLUE, 'REUNIAO EXTRA AGENDADA': YELLOW, 'AGENDA FUTURA': '#7C3AED', 'PERDIDO CLOSER': R, 'FECHADO': GREEN }
  const c = map[s] || GRAY2
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: `${c}18`, color: c, border: `1px solid ${c}33` }}>{s}</span>
}

export function SpvBadge({ s }: { s: string | null }) {
  if (!s) return <span style={{ color: GRAY2, fontSize: 11 }}>—</span>
  const c = SPV_COLORS[s] || GRAY2
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: `${c}22`, color: c, border: `1px solid ${c}44`, whiteSpace: 'nowrap' }}>{s}</span>
}
