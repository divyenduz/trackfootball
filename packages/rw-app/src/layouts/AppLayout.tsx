import { LayoutProps } from 'rwsdk/router'
import { Footer } from '@/components/organisms/Footer'
import { AppBar } from '@/components/organisms/AppBar'

export function AppLayout({ children, requestInfo }: LayoutProps) {
  const user = requestInfo?.ctx.user || null

  return (
    <div className="app flex min-h-dvh flex-col bg-gray-50 text-gray-900">
      <title>
        TrackFootball.app - Track, Analyse and Improve Your Football Game
      </title>
      <meta
        name="description"
        content="TrackFootball is a social network for casual Football players. Record your game with any GPS watch/phone and upload it to TrackFootball to track, analyse and improve your performance."
      />
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AppBar pageName="TrackFootball" user={user} />

      <main id="main-content" tabIndex={-1} className="w-full flex-1">
        {children}
      </main>

      <footer>
        <Footer />
      </footer>
    </div>
  )
}
