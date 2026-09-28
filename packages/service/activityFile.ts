import {
  Decoder,
  Profile,
  Stream,
  type EventMesg,
  type RecordMesg,
} from '@garmin/fitsdk'
import { DOMParser } from '@xmldom/xmldom'
import type { FeatureCollection, LineString } from 'geojson'

export const MAX_ACTIVITY_BYTES = 5 * 1024 * 1024
export const MAX_ACTIVITY_POINTS = 50_000

export class ActivityFileError extends Error {}

type Sample = {
  longitude: number
  latitude: number
  time: number
  heartRate: number | null
}

export type ParsedActivity = {
  geoJson: FeatureCollection<LineString>
  startTime: Date
  elapsedTime: number
  totalDistance: number
  averageSpeed: number
  maxSpeed: number
}

function fail(message: string): never {
  throw new ActivityFileError(message)
}

function heartRate(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    value < 255
    ? value
    : null
}

function parseGpx(bytes: Uint8Array): Sample[][] {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    fail('GPX must not contain DTDs or entity declarations.')
  const document = new DOMParser({
    onError: () => fail('The GPX XML is malformed.'),
  }).parseFromString(text, 'application/xml')
  const root = document.documentElement
  if (!root || root.localName !== 'gpx') fail('Choose a GPX activity file.')
  const tracks = Array.from(root.getElementsByTagNameNS('*', 'trk'))
  if (tracks.length !== 1) fail('Upload one GPX track at a time.')
  const segments = Array.from(tracks[0]!.getElementsByTagNameNS('*', 'trkseg'))
  let count = 0
  return segments.map((segment) =>
    Array.from(segment.getElementsByTagNameNS('*', 'trkpt')).map((point) => {
      if (++count > MAX_ACTIVITY_POINTS)
        fail('The activity exceeds 50,000 GPS samples.')
      const time = Array.from(point.childNodes)
        .find((node) => node.localName === 'time')
        ?.textContent?.trim()
      if (
        !time ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
          time,
        )
      ) {
        fail(
          'Every GPX point needs a timestamp with a timezone. Export a recorded activity, not a planned route.',
        )
      }
      const calendar = new Date(`${time.slice(0, 19)}Z`)
      if (
        !Number.isFinite(calendar.getTime()) ||
        calendar.toISOString().slice(0, 19) !== time.slice(0, 19)
      ) {
        fail('The activity contains an invalid calendar timestamp.')
      }
      const lat = point.getAttribute('lat')
      const lon = point.getAttribute('lon')
      if (!lat?.trim() || !lon?.trim())
        fail('Every GPS point needs latitude and longitude.')
      const hr = point.getElementsByTagNameNS('*', 'hr')[0]?.textContent
      return {
        latitude: Number(lat),
        longitude: Number(lon),
        time: Date.parse(time),
        heartRate: heartRate(hr ? Number(hr) : null),
      }
    }),
  )
}

function parseFit(bytes: Uint8Array): Sample[][] {
  const decoder = new Decoder(Stream.fromByteArray(bytes))
  if (!decoder.isFIT() || !decoder.checkIntegrity())
    fail('The FIT file is corrupt or incomplete (header/CRC check failed).')
  const segments: Sample[][] = []
  let segment: Sample[] = []
  let paused = false
  let count = 0
  const split = () => {
    if (segment.length) segments.push(segment)
    segment = []
  }
  const { messages, errors } = decoder.read({
    mesgListener: (number, decoded) => {
      const message = decoded as EventMesg & RecordMesg
      if (++count > 100_000) fail('The FIT file contains too many messages.')
      if (number === Profile.MesgNum.EVENT && message.event === 'timer') {
        if (
          typeof message.eventType === 'string' &&
          message.eventType.startsWith('stop')
        ) {
          split()
          paused = true
        }
        if (message.eventType === 'start') {
          split()
          paused = false
        }
      }
      if (number !== Profile.MesgNum.RECORD || paused) return
      const lat = message.positionLat
      const lon = message.positionLong
      if (lat == null || lon == null) {
        split()
        return
      }
      if (typeof lat !== 'number' || typeof lon !== 'number')
        fail('Invalid FIT coordinates.')
      if (!(message.timestamp instanceof Date))
        fail('Every FIT GPS sample needs a timestamp.')
      segment.push({
        latitude: (lat * 180) / 2 ** 31,
        longitude: (lon * 180) / 2 ** 31,
        time: message.timestamp.getTime(),
        heartRate: heartRate(message.heartRate),
      })
    },
  })
  if (errors.length) fail('The FIT file could not be decoded safely.')
  if (
    messages.fileIdMesgs?.length !== 1 ||
    messages.fileIdMesgs[0]?.type !== 'activity'
  )
    fail('Choose a FIT activity file, not a course or workout plan.')
  if ((messages.sessionMesgs?.length ?? 0) > 1)
    fail('Upload a single-session FIT activity, not a multisport file.')
  split()
  return segments
}

function distance(a: Sample, b: Sample) {
  const radians = Math.PI / 180
  const h =
    Math.sin(((b.latitude - a.latitude) * radians) / 2) ** 2 +
    Math.cos(a.latitude * radians) *
      Math.cos(b.latitude * radians) *
      Math.sin(((b.longitude - a.longitude) * radians) / 2) ** 2
  return 2 * 6_371_008.8 * Math.asin(Math.sqrt(Math.min(1, h)))
}

export function parseActivityFile(
  bytes: Uint8Array,
  filename: string,
): ParsedActivity {
  if (!bytes.length || bytes.length > MAX_ACTIVITY_BYTES)
    fail('Choose a non-empty file up to 5 MiB.')
  const extension = filename.split('.').pop()?.toLowerCase()
  if (extension !== 'fit' && extension !== 'gpx')
    fail('Choose a .fit or .gpx file.')
  let segments: Sample[][]
  try {
    segments = extension === 'fit' ? parseFit(bytes) : parseGpx(bytes)
  } catch (error) {
    if (error instanceof ActivityFileError) throw error
    fail(
      'The activity file is malformed. Export it again from your recording device.',
    )
  }
  const samples = segments.flat()
  if (segments.length > 100) fail('The activity exceeds 100 track segments.')
  if (samples.length < 2 || segments.some((segment) => segment.length < 2))
    fail('Each track segment needs at least two timestamped GPS points.')
  if (samples.length > MAX_ACTIVITY_POINTS)
    fail('The activity exceeds 50,000 GPS samples.')
  let previousTime = -Infinity
  for (const sample of samples) {
    if (
      !Number.isFinite(sample.longitude) ||
      Math.abs(sample.longitude) > 180 ||
      !Number.isFinite(sample.latitude) ||
      Math.abs(sample.latitude) > 90
    )
      fail('The activity contains invalid GPS coordinates.')
    if (!Number.isFinite(sample.time) || sample.time <= previousTime)
      fail('GPS timestamps must be valid and strictly increasing.')
    previousTime = sample.time
  }
  const startTime = new Date(samples[0]!.time)
  const seconds = (samples.at(-1)!.time - startTime.getTime()) / 1000
  if (seconds < 1 || seconds > 7 * 24 * 3600)
    fail('Activity duration must be between one second and seven days.')
  let totalDistance = 0
  let maxSpeed = 0
  for (const segment of segments) {
    for (let i = 1; i < segment.length; i++) {
      const previous = segment[i - 1]!
      const current = segment[i]!
      const meters = distance(previous, current)
      totalDistance += meters
      maxSpeed = Math.max(
        maxSpeed,
        meters / ((current.time - previous.time) / 1000),
      )
    }
  }
  return {
    startTime,
    elapsedTime: Math.round(seconds),
    totalDistance,
    maxSpeed,
    averageSpeed: totalDistance / seconds,
    geoJson: {
      type: 'FeatureCollection',
      features: segments.map((segment) => ({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: segment.map((sample) => [
            sample.longitude,
            sample.latitude,
          ]),
        },
        properties: {
          coordTimes: segment.map((sample) =>
            new Date(sample.time).toISOString(),
          ),
          heartRates: segment.map((sample) => sample.heartRate),
        },
      })),
    },
  }
}
