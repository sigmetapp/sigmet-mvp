import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function Profile() {
  const [userId, setUserId] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [country, setCountry] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle()
      if (data) {
        setUsername(data.username ?? '')
        setBio(data.bio ?? '')
        setCountry(data.country ?? '')
      }
    })()
  }, [])

  async function save() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { alert('Sign in first'); return }
    const { error } = await supabase.from('profiles').upsert({
      user_id: user.id, username, bio, country
    })
    if (error) alert(error.message); else alert('Saved')
  }

  return (
    <main style={{padding:24,fontFamily:'system-ui'}}>
      <h1>Profile</h1>
      {!userId && <p>Please <a href="/login">sign in</a>.</p>}
      {userId && (
        <div style={{maxWidth:520}}>
          <label>Username</label>
          <input value={username} onChange={e=>setUsername(e.target.value)} style={{display:'block',width:'100%',padding:8,margin:'6px 0 16px'}}/>
          <label>Bio</label>
          <textarea value={bio} onChange={e=>setBio(e.target.value)} rows={3} style={{display:'block',width:'100%',padding:8,margin:'6px 0 16px'}}/>
          <label>Country</label>
          <input value={country} onChange={e=>setCountry(e.target.value)} style={{display:'block',width:'100%',padding:8,margin:'6px 0 16px'}}/>
          <button onClick={save} style={{padding:'8px 12px'}}>Save</button>
        </div>
      )}
    </main>
  )
}
