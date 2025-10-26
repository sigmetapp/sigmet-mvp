import { useEffect, useState, ChangeEvent } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function Profile() {
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [country, setCountry] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      setEmail(user.email ?? null)
      const { data } = await supabase
        .from('profiles').select('*').eq('user_id', user.id).maybeSingle()
      if (data) {
        setUsername(data.username ?? '')
        setBio(data.bio ?? '')
        setCountry(data.country ?? '')
        setAvatarUrl(data.avatar_url ?? null)
      }
    })()
  }, [])

  async function save() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { alert('Sign in first'); return }
    const { error } = await supabase.from('profiles').upsert({
      user_id: user.id, username, bio, country, avatar_url: avatarUrl
    })
    if (error) alert(error.message); else alert('Saved')
  }

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!userId) { alert('Sign in first'); return }

    try {
      setLoading(true)
      // имя файла: avatars/<userId>.png (или исходное расширение)
      const ext = file.name.split('.').pop() || 'png'
      const path = `${userId}.${ext}`

      // перезаписываем файл (upsert: true)
      const { error: uploadErr } = await supabase
        .storage.from('avatars')
        .upload(path, file, { upsert: true })
      if (uploadErr) throw uploadErr

      // получаем публичный URL
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      const publicUrl = pub.publicUrl
      setAvatarUrl(publicUrl)

      // сразу апдейтим профиль
      const { error: upErr } = await supabase
        .from('profiles')
        .upsert({ user_id: userId, avatar_url: publicUrl })
      if (upErr) throw upErr
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{padding:24,fontFamily:'system-ui',maxWidth:640}}>
      <h1>Profile</h1>
      {!userId && <p>Please <a href="/login">sign in</a>.</p>}
      {userId && (
        <>
          <div style={{display:'flex',alignItems:'center',gap:16,margin:'12px 0'}}>
            <img
              src={avatarUrl ?? 'https://placehold.co/80x80?text=Avatar'}
              alt="avatar"
              width={80} height={80}
              style={{borderRadius:'50%',objectFit:'cover',border:'1px solid #eee'}}
            />
            <div>
              <input type="file" accept="image/*" onChange={onFileChange} />
              {loading && <div style={{fontSize:12,opacity:.7}}>Uploading...</div>}
            </div>
          </div>

          <label>Username</label>
          <input value={username} onChange={e=>setUsername(e.target.value)}
                 style={{display:'block',width:'100%',padding:8,margin:'6px 0 16px'}}/>

          <label>Bio</label>
          <textarea value={bio} onChange={e=>setBio(e.target.value)} rows={3}
                    style={{display:'block',width:'100%',padding:8,margin:'6px 0 16px'}}/>

          <label>Country</label>
          <input value={country} onChange={e=>setCountry(e.target.value)}
                 style={{display:'block',width:'100%',padding:8,margin:'6px 0 16px'}}/>

          <button onClick={save} style={{padding:'8px 12px'}}>Save</button>
          <div style={{fontSize:12,opacity:.7,marginTop:8}}>Signed in as: {email}</div>
        </>
      )}
    </main>
  )
}
