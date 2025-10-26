export default function Index() {
  return (
    <main style={{padding:20,fontFamily:'system-ui'}}>
      <h1>Sigmet MVP — fallback</h1>
      <p>Если вы видите эту страницу — App Router ещё не подхватился, но проект работает.</p>
      <p><a href="/dashboard">Открыть Feed</a> • <a href="/profile">Профиль</a> • <a href="/directions">Направления</a></p>
    </main>
  );
}
