'use client'

import { useState, type FormEvent } from 'react'

export function Upload() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = new FormData(event.currentTarget)
    const file = form.get('file')
    if (!(file instanceof File) || !file.size) {
      setError('Choose a non-empty FIT or GPX file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('The file exceeds 5 MiB.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const query = new URLSearchParams({
        filename: file.name,
        title: String(form.get('title') ?? ''),
      })
      const response = await fetch(`/api/activities/upload?${query}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: file,
      })
      const result = (await response.json()) as {
        id?: number
        duplicate?: boolean
        error?: string
      }
      if (!response.ok || !result.id) {
        setError(result.error || 'Upload failed. Please try again.')
        return
      }
      window.location.assign(
        `/activity/${result.id}${result.duplicate ? '?upload=existing' : ''}`,
      )
    } catch {
      setError(
        'Upload failed. Check your connection and try again. Re-uploading the same file will not create a duplicate.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <title>Upload an activity | TrackFootball.app</title>
      <a
        href="/dashboard"
        className="inline-flex min-h-11 items-center font-semibold text-gray-700 underline underline-offset-4"
      >
        ← Back to dashboard
      </a>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-gray-950">
        Upload an activity
      </h1>
      <p className="mt-3 text-gray-600">
        Bring your football recording from your watch or GPS app. No connected
        fitness account needed.
      </p>
      <form
        onSubmit={submit}
        className="mt-6 space-y-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8"
      >
        <fieldset
          disabled={busy}
          className="min-w-0 space-y-6 disabled:opacity-60"
        >
          <div>
            <label
              htmlFor="activity-title"
              className="block text-sm font-semibold text-gray-900"
            >
              Activity title
            </label>
            <input
              id="activity-title"
              name="title"
              maxLength={200}
              required
              defaultValue="Football activity"
              className="mt-2 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label
              htmlFor="activity-file"
              className="block text-sm font-semibold text-gray-900"
            >
              FIT or GPX file
            </label>
            <input
              id="activity-file"
              name="file"
              type="file"
              accept=".fit,.gpx"
              required
              className="mt-2 block min-h-11 w-full min-w-0 rounded-lg border border-gray-300 p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:font-semibold"
            />
          </div>
          <button
            type="submit"
            className="min-h-11 w-full rounded-lg bg-cardinal-900 px-5 py-3 font-semibold text-white disabled:cursor-wait sm:w-auto"
          >
            {busy ? 'Uploading…' : 'Upload activity'}
          </button>
        </fieldset>
        {busy && (
          <p role="status" className="text-sm text-gray-600">
            Reading your recording and saving the activity…
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="break-words rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </p>
        )}
      </form>
    </div>
  )
}
