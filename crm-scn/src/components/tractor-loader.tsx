'use client'

export function TractorLoader({ text = 'Carregando...' }: { text?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '56px 20px', gap: 20 }}>
      <style>{`
        @keyframes tractor-bob {
          0%,100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes wheel-turn {
          to { transform: rotate(360deg); }
        }
        @keyframes tree-wobble {
          0%,100% { transform: rotate(-5deg); }
          50% { transform: rotate(5deg); }
        }
        @keyframes puff-up {
          0% { opacity:.75; transform: translateY(0) scale(.9); }
          100% { opacity:0; transform: translateY(-18px) scale(1.6); }
        }
        .t-bob { animation: tractor-bob .75s ease-in-out infinite; }
        .t-rw  { animation: wheel-turn .45s linear infinite; transform-box:fill-box; transform-origin:center; }
        .t-fw  { animation: wheel-turn .45s linear infinite; transform-box:fill-box; transform-origin:center; }
        .t-tree { animation: tree-wobble 1.1s ease-in-out infinite; transform-box:fill-box; transform-origin:50% 100%; }
        .t-p1 { animation: puff-up 1.4s ease-out infinite; }
        .t-p2 { animation: puff-up 1.4s ease-out infinite .55s; }
        .t-p3 { animation: puff-up 1.4s ease-out infinite 1.1s; }
      `}</style>

      <div className="t-bob">
        <svg width="178" height="110" viewBox="0 0 178 110" fill="none" xmlns="http://www.w3.org/2000/svg">

          {/* ── REAR BIG WHEEL ── */}
          <g className="t-rw">
            <circle cx="38" cy="83" r="23" fill="#1F2937"/>
            <circle cx="38" cy="83" r="16" fill="#374151"/>
            <line x1="38" y1="60" x2="38" y2="106" stroke="#6B7280" strokeWidth="3" strokeLinecap="round"/>
            <line x1="15" y1="83" x2="61" y2="83" stroke="#6B7280" strokeWidth="3" strokeLinecap="round"/>
            <line x1="21.7" y1="67.7" x2="54.3" y2="98.3" stroke="#6B7280" strokeWidth="3" strokeLinecap="round"/>
            <line x1="54.3" y1="67.7" x2="21.7" y2="98.3" stroke="#6B7280" strokeWidth="3" strokeLinecap="round"/>
            <circle cx="38" cy="83" r="5.5" fill="#9CA3AF"/>
          </g>

          {/* ── BODY ── */}
          <rect x="22" y="54" width="90" height="29" rx="5" fill="#E8001C"/>
          <rect x="22" y="72" width="90" height="11" rx="0" fill="#C0001A"/>
          <rect x="22" y="79" width="90" height="4"  rx="0" fill="#A80016"/>

          {/* ── CABIN ── */}
          <rect x="57" y="32" width="41" height="26" rx="4" fill="#C0001A"/>
          <rect x="57" y="32" width="41" height="4"  rx="2" fill="#A80016"/>
          {/* window */}
          <rect x="61" y="36" width="17" height="15" rx="2" fill="#BAE6FD"/>
          <rect x="61" y="36" width="4"  height="15" fill="#93C5FD" opacity=".45"/>
          <line x1="62" y1="37" x2="62" y2="50" stroke="white" strokeWidth="1" opacity=".3" strokeLinecap="round"/>

          {/* ── EXHAUST PIPE ── */}
          <rect x="90" y="20" width="6"  height="14" rx="2" fill="#6B7280"/>
          <rect x="88" y="18" width="10" height="5"  rx="2" fill="#4B5563"/>
          {/* smoke */}
          <circle className="t-p1" cx="93" cy="13" r="4"   fill="#D1D5DB"/>
          <circle className="t-p2" cx="96" cy="7"  r="3"   fill="#E5E7EB"/>
          <circle className="t-p3" cx="90" cy="5"  r="2.5" fill="#F3F4F6"/>

          {/* ── FRONT SMALL WHEEL ── */}
          <g className="t-fw">
            <circle cx="104" cy="87" r="14" fill="#1F2937"/>
            <circle cx="104" cy="87" r="9"  fill="#374151"/>
            <line x1="104" y1="73" x2="104" y2="101" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="90"  y1="87" x2="118" y2="87"  stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="94"  y1="77" x2="114" y2="97"  stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="114" y1="77" x2="94"  y2="97"  stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round"/>
            <circle cx="104" cy="87" r="4" fill="#9CA3AF"/>
          </g>

          {/* ── LOADER ARM ── */}
          <line x1="110" y1="68" x2="133" y2="43" stroke="#B5001A" strokeWidth="6" strokeLinecap="round"/>
          <line x1="133" y1="43" x2="141" y2="54" stroke="#B5001A" strokeWidth="5" strokeLinecap="round"/>
          {/* hydraulic detail */}
          <line x1="115" y1="74" x2="131" y2="52" stroke="#8B0011" strokeWidth="2.5" strokeLinecap="round" opacity=".55"/>

          {/* ── BUCKET ── */}
          <path d="M 126 41 L 145 37 L 143 57 L 124 59 Z" fill="#9B1C1C"/>
          <line x1="126" y1="41" x2="145" y2="37" stroke="#7F1D1D" strokeWidth="1.5"/>

          {/* ── TREE ── */}
          <g className="t-tree">
            {/* trunk */}
            <rect x="130" y="25" width="5" height="18" rx="1.5" fill="#92400E"/>
            {/* foliage — 3 layers */}
            <polygon points="132,1  150,25 114,25" fill="#15803D"/>
            <polygon points="132,11 148,30 116,30" fill="#16A34A"/>
            <polygon points="132,19 145,33 119,33" fill="#22C55E"/>
            {/* shine */}
            <line x1="119" y1="28" x2="124" y2="19" stroke="white" strokeWidth="1.5" opacity=".2" strokeLinecap="round"/>
          </g>

        </svg>
      </div>

      <span style={{ fontSize: 13, color: '#9CA3AF', fontWeight: 500, letterSpacing: '0.03em' }}>
        {text}
      </span>
    </div>
  )
}
