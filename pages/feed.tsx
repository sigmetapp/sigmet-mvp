import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Post = { id: number; author_id: string; text: string; created_at: string }

export default function Feed() {
  const [userId, setUserId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [posts, setPosts] = useState<Post[]>([])

  async function load() {
    const { data } = await supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(50)
    setPosts(data ?? [])
  }

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)
      await load()
    })()
  }, [])

  async function createPost() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { alert('Sign in first'); return }
    const { error } = await supabase.from('posts').insert({ author_id: user.id, text })
    if (error) alert(error.message)
    else { setText(''); await load() }
  }

  return (
    <main style={{padding:24,fontFamily:'system-ui'}}>
      <h1>Feed</h1>
      {!userId && <p>Please <a href="/login">sign in</a>.</p>}
      <div style={{maxWidth:640}}>
        <textarea value={text} onChange={e=>setText(e.target.value)} rows={3}
          placeholder="Share something..." style={{width:'100%',padding:8}} />
        <button onClick={createPost} style={{marginTop:8,padding:'8px 12px'}}>Post</button>
      </div>
      <div style={{marginTop:16}}>
        {posts.map(p => (
          <div key={p.id} style={{padding:12,border:'1px solid #eee',borderRadius:8,marginBottom:8}}>
            <div style={{fontSize:12,opacity:.7}}>{new Date(p.created_at).toLocaleString()}</div>
            <div style={{whiteSpace:'pre-wrap',marginTop:6}}>{p.text}</div>
          </div>
        ))}
      </div>
    </main>
  )
}
