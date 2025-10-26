import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  async function sendMagic() {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined }
    })
    if (error) alert(error.message); else setSent(true)
  }

  return (
    <main style={{padding:24,fontFamily:'system-ui'}}>
      <h1>Sign in</h1>
      <input type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}
             style={{padding:8,width:'100%',marginTop:12}}/>
      <button onClick={sendMagic} style={{marginTop:12,padding:'8px 12px'}}>Send magic link</button>
      {sent && <p>Check your inbox.</p>}
    </main>
  )
}
