import Logo from '@/components/atoms/brand/core/Logo'

export function Footer() {
  return (
    <div className="bg-oynx py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-center px-4 sm:px-6">
        <div className="mb-6">
          <div className="flex items-center justify-center">
            <Logo size={'xs'} />
          </div>
          <span className="flex items-center justify-center text-center text-sm font-light text-gray-300">
            Made for players looking to improve their games
          </span>
        </div>
        <nav
          aria-label="Footer navigation"
          className="flex flex-wrap items-center justify-center gap-1 text-sm"
        >
          <a
            className="rounded px-3 py-2 text-gray-300 underline decoration-gray-600 underline-offset-4 hover:text-white"
            href="/privacy"
          >
            Privacy Policy
          </a>
          <a
            className="rounded px-3 py-2 text-gray-300 underline decoration-gray-600 underline-offset-4 hover:text-white"
            href="/terms"
          >
            Terms
          </a>
          <a
            className="rounded px-3 py-2 text-gray-300 underline decoration-gray-600 underline-offset-4 hover:text-white"
            href="mailto:hello@trackfootball.app"
          >
            Contact Us
          </a>
        </nav>
      </div>
    </div>
  )
}
