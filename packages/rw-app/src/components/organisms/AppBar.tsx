'use client'

import React, { useEffect, useRef, useState } from 'react'
import { match } from 'ts-pattern'

import Logo from '@/components/atoms/brand/core/Logo'
import { LoginButton } from '@/components/atoms/LoginButton'
import { Photo } from '@/components/atoms/Photo'
import { signOut } from '@/auth/auth-client'
import type { User } from '@trackfootball/postgres'

interface Props {
  user: User | null
  pageName: string
}

export const AppBar: React.FC<Props> = ({
  pageName = 'TrackFootball',
  user,
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const open = Boolean(anchorEl)

  const accountRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAnchorEl(null)
        accountRef.current?.focus()
      }
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [open])

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto w-full max-w-6xl px-4 py-2 sm:px-6">
        <div className="flex items-center justify-between">
          <a
            href="/home"
            className="flex min-h-11 items-center gap-2 rounded-lg text-gray-900"
          >
            <Logo size={'xs'} />
            <span className="hidden text-xl font-semibold tracking-tight md:block">
              {pageName}
            </span>
          </a>

          <div className="flex items-center gap-2">
            {match(user)
              .with(null, () => {
                return (
                  <div className="app-bar-login">
                    <LoginButton />
                  </div>
                )
              })
              .otherwise((user) => {
                return (
                  <>
                    <a
                      href="/dashboard"
                      className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-950"
                    >
                      Dashboard
                    </a>
                    <div className="relative">
                      <button
                        ref={accountRef}
                        type="button"
                        aria-label="Account"
                        aria-controls="menu-appbar"
                        aria-expanded={open}
                        onClick={(event) => {
                          setAnchorEl(open ? null : event.currentTarget)
                        }}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-full p-0.5 transition-colors hover:bg-gray-100"
                      >
                        <Photo photo={user?.picture}></Photo>
                      </button>
                      {open && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setAnchorEl(null)}
                          />
                          <div
                            id="menu-appbar"
                            className="absolute right-0 top-full mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-20"
                          >
                            <div className="py-1">
                              <a
                                href={`/athlete/${user?.id}`}
                                className="flex min-h-11 items-center px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100"
                                onClick={() => setAnchorEl(null)}
                              >
                                <span className="mr-3">👤</span>
                                Profile
                              </a>

                              <hr className="my-1 border-gray-200" />

                              <button
                                type="button"
                                className="flex min-h-11 w-full items-center px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100"
                                onClick={async () => {
                                  setAnchorEl(null)
                                  await signOut({
                                    fetchOptions: {
                                      onSuccess: () => {
                                        window.location.href = '/home'
                                      },
                                    },
                                  })
                                }}
                              >
                                <span className="mr-3">😵</span>
                                Logout
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )
              })}
          </div>
        </div>
      </div>
    </header>
  )
}
