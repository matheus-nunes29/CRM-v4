'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()
  useEffect(() => {
    const handle = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const email = session.user.email
      const { data } = await supabase
        .from('usuarios_permitidos')
        .select('id, ativo')
        .eq('email', email)
        .eq('ativo', true)
        .single()
      if (!data) {
        await supabase.auth.signOut()
        router.push('/login?erro=nao_autorizado')
        return
      }
      router.push('/')
    }
    handle()
  }, [router])

  return (
    <div style={{ minHeight:'100vh', background:'#161616', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16, fontFamily:"'Inter', system-ui" }}>
      <div style={{ width:36, height:36, border:'3px solid #333', borderTopColor:'#E8001C', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
      <div style={{ color:'#666', fontSize:14 }}>Verificando acesso...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
