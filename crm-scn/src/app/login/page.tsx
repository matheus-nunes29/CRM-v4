'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ShieldCheck, AlertCircle } from 'lucide-react'

const R = '#E8001C'
const GRAY1 = '#1A1A1A'
const GRAY2 = '#6B7280'
const WHITE = '#FFFFFF'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleGoogleLogin() {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) {
      setError('Erro ao conectar com Google. Tente novamente.')
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#EFEFEF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Plus Jakarta Sans', 'DM Sans', system-ui, sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 420, padding: 40 }}>
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 40 }}>
          <img src="/LOGO VERMELHO.png" alt="V4 Company" style={{ height: 52, width: 'auto', display: 'block', marginBottom: 20 }} />
          <div style={{ fontSize: 15, color: GRAY2, lineHeight: 1.5 }}>
            Faça login para acessar o CRM
          </div>
        </div>

        {/* Card */}
        <div style={{ background: WHITE, borderRadius: 16, padding: 32, border: '1px solid #E8E8F4', boxShadow: '0 8px 40px rgba(124,58,237,0.08), 0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: GRAY1, marginBottom: 6 }}>Bem-vindo</div>
            <div style={{ fontSize: 13, color: GRAY2 }}>Acesso restrito a usuários autorizados.</div>
          </div>

          {error && (
            <div style={{ background: `${R}18`, border: `1px solid ${R}44`, borderRadius: 10, padding: '12px 14px', fontSize: 13, color: R, marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
              <AlertCircle size={15} color={R} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            style={{
              width: '100%', padding: '14px 20px', borderRadius: 10, border: '1px solid #E5E7EB',
              background: loading ? '#F3F4F6' : WHITE, color: loading ? '#9CA3AF' : GRAY1,
              fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              transition: 'all .15s',
            }}
          >
            {loading ? (
              <>
                <div style={{ width: 18, height: 18, border: '2px solid #E5E7EB', borderTopColor: '#7C3AED', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                Conectando...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
                  <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                Entrar com Google
              </>
            )}
          </button>

          <div style={{ marginTop: 20, padding: '13px 16px', background: '#F8F9FB', border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 12, color: '#6B7280', lineHeight: 1.6, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <ShieldCheck size={15} color="#6B7280" style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Apenas usuários cadastrados pelo administrador podem acessar. Entre em contato se não conseguir acesso.</span>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
