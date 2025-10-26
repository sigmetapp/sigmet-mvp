export default function Home() {
  return (
    <main style={{padding:24,fontFamily:'system-ui',lineHeight:1.5}}>
      <h1>Sigmet MVP — root route OK</h1>
      <p>Если вы видите это, App Router работает. Дальше подключаем Supabase.</p>
      <p><a href="/dashboard">Feed</a> • <a href="/profile">Profile</a> • <a href="/directions">Directions</a></p>
    </main>
  );
}
