import './globals.css';
import Link from 'next/link';

export const metadata = {
  title: 'Sigmet MVP',
  description: 'Social weight - MVP',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <header className="flex items-center justify-between mb-6">
            <Link href="/" className="text-xl font-semibold">Sigmet</Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/dashboard">Feed</Link>
              <Link href="/profile">Profile</Link>
              <Link href="/directions">Directions</Link>
              <Link href="/messages">Messages</Link>
              <Link href="/invites">Invites</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
