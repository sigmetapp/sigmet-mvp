export default function Index() {
  return (
    <main style={{padding:24,fontFamily:'system-ui',lineHeight:1.6}}>
      <h1>Sigmet MVP — it works ✅</h1>
      <p>Главная страница отдается через Pages Router. Дальше подключаем Supabase и ленту.</p>
      <p>
        <a href="/profile">Profile</a> • <a href="/directions">Directions</a> • <a href="/messages">Messages</a>
      </p>
    </main>
  );
}
