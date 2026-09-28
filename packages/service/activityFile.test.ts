import { describe, expect, it } from 'vitest'
import { Encoder, Profile } from '@garmin/fitsdk'
import { MAX_ACTIVITY_BYTES, parseActivityFile } from './activityFile'

const gpx = `<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk>
<trkseg><trkpt lat="0" lon="13"><time>2026-09-28T10:00:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>120</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
<trkpt lat="0" lon="13.001"><time>2026-09-28T10:00:10Z</time></trkpt></trkseg>
<trkseg><trkpt lat="0" lon="14"><time>2026-09-28T10:00:30Z</time><extensions><gpxtpx:hr>180</gpxtpx:hr></extensions></trkpt>
<trkpt lat="0" lon="14.002"><time>2026-09-28T10:00:50Z</time><extensions><gpxtpx:hr>150</gpxtpx:hr></extensions></trkpt></trkseg>
</trk></gpx>`

function fitFixture(type = 'activity', sessions = 1) {
  const encoder = new Encoder()
  const time = (seconds: number) =>
    new Date(Date.parse('2026-09-28T10:00:00Z') + seconds * 1000)
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.FILE_ID,
    type,
    manufacturer: 'development',
    product: 0,
    timeCreated: time(0),
  })
  const event = (eventType: string, seconds: number) =>
    encoder.writeMesg({
      mesgNum: Profile.MesgNum.EVENT,
      event: 'timer',
      eventType,
      timestamp: time(seconds),
    })
  const record = (longitude: number, seconds: number) =>
    encoder.writeMesg({
      mesgNum: Profile.MesgNum.RECORD,
      timestamp: time(seconds),
      positionLat: 0,
      positionLong: Math.round((longitude * 2 ** 31) / 180),
      heartRate: 120 + seconds,
    })
  event('start', 0)
  record(13, 0)
  record(13.001, 10)
  event('stopAll', 10)
  record(30, 20) // A paused GPS sample must not enter the route or distance.
  event('start', 30)
  record(14, 30)
  record(14.002, 50)
  event('stop', 50)
  for (let i = 0; i < sessions; i++)
    encoder.writeMesg({
      mesgNum: Profile.MesgNum.SESSION,
      startTime: time(0),
      timestamp: time(50),
      sport: 'soccer',
      totalElapsedTime: 50,
      totalTimerTime: 30,
    })
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.ACTIVITY,
    timestamp: time(50),
    numSessions: sessions,
    totalTimerTime: 30,
    type: 'manual',
  })
  return encoder.close()
}

const parseGpx = (text: string) =>
  parseActivityFile(new TextEncoder().encode(text), 'activity.GPX')

describe('activity file normalization', () => {
  it('accounts for latitude and timezone offsets', () => {
    const activity = parseGpx(
      gpx
        .replaceAll('lat="0"', 'lat="60"')
        .replaceAll('Z</time>', '+02:00</time>'),
    )
    expect(activity.totalDistance).toBeCloseTo(166.79262, 3)
    expect(activity.startTime.toISOString()).toBe('2026-09-28T08:00:00.000Z')
    expect(activity.geoJson.features[0]!.geometry.coordinates[0]).toEqual([
      13, 60,
    ])
  })

  it('preserves lon/lat order, aligned optional heart rates, timestamps, and segment gaps', () => {
    const activity = parseGpx(gpx)
    expect(activity.startTime.toISOString()).toBe('2026-09-28T10:00:00.000Z')
    expect(activity.elapsedTime).toBe(50)
    expect(
      activity.geoJson.features.map((f) => f.geometry.coordinates),
    ).toEqual([
      [
        [13, 0],
        [13.001, 0],
      ],
      [
        [14, 0],
        [14.002, 0],
      ],
    ])
    expect(
      activity.geoJson.features.map((f) => f.properties?.heartRates),
    ).toEqual([
      [120, null],
      [180, 150],
    ])
    // Three thousandths of a degree on the equator: approximately 333.585 m.
    // The 0.999 degree discontinuity between segments must not count.
    expect(activity.totalDistance).toBeCloseTo(333.58524, 3)
    expect(activity.maxSpeed).toBeCloseTo(11.119508, 4)
    expect(activity.averageSpeed).toBeCloseTo(6.671705, 4)
  })

  it('decodes real FIT binary, semicircles and timer pauses without joining gaps', () => {
    const activity = parseActivityFile(fitFixture(), 'match.fit')
    expect(activity.geoJson.features).toHaveLength(2)
    expect(
      activity.geoJson.features[0]!.geometry.coordinates[0]![0],
    ).toBeCloseTo(13, 5)
    expect(activity.geoJson.features[0]!.geometry.coordinates[0]![1]).toBe(0)
    expect(activity.elapsedTime).toBe(50)
    expect(activity.totalDistance).toBeCloseTo(333.58524, 1)
    expect(activity.averageSpeed).toBeCloseTo(6.671705, 2)
    expect(activity.geoJson.features[1]!.properties?.heartRates).toEqual([
      150, 170,
    ])
  })

  it('rejects truncated, corrupt, non-activity and multisport FIT data', () => {
    const bytes = fitFixture()
    expect(() => parseActivityFile(bytes.slice(0, -1), 'match.fit')).toThrow(
      /CRC/,
    )
    const corrupt = bytes.slice()
    corrupt[25] ^= 1
    expect(() => parseActivityFile(corrupt, 'match.fit')).toThrow(/CRC/)
    expect(() => parseActivityFile(fitFixture('course'), 'match.fit')).toThrow(
      /activity file/,
    )
    expect(() =>
      parseActivityFile(fitFixture('activity', 2), 'match.fit'),
    ).toThrow(/single-session/)
  })

  it.each([
    [
      'missing time',
      gpx.replace('<time>2026-09-28T10:00:10Z</time>', ''),
      /timestamp/,
    ],
    ['duplicate time', gpx.replace('10:00:10Z', '10:00:00Z'), /increasing/],
    ['backwards time', gpx.replace('10:00:10Z', '09:00:00Z'), /increasing/],
    [
      'invalid calendar date',
      gpx.replaceAll('2026-09-28', '2026-02-30'),
      /calendar/,
    ],
    ['invalid coordinate', gpx.replace('lat="0"', 'lat="91"'), /coordinates/],
    ['missing coordinate', gpx.replace('lat="0"', ''), /latitude/],
    [
      'nonfinite coordinate',
      gpx.replace('lat="0"', 'lat="NaN"'),
      /coordinates/,
    ],
    [
      'entity declaration',
      '<!DOCTYPE gpx [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + gpx,
      /DTD/,
    ],
    ['malformed xml', gpx.replace('</trk>', ''), /malformed/],
    [
      'planned route',
      '<gpx><rte><rtept lat="0" lon="1" /></rte></gpx>',
      /track/,
    ],
  ])('rejects %s', (_, text, message) =>
    expect(() => parseGpx(text)).toThrow(message),
  )

  it('enforces file, point and segment limits', () => {
    expect(() => parseActivityFile(new Uint8Array(), 'x.fit')).toThrow(
      /non-empty/,
    )
    expect(() =>
      parseActivityFile(new Uint8Array(MAX_ACTIVITY_BYTES + 1), 'x.fit'),
    ).toThrow(/5 MiB/)
    expect(() => parseActivityFile(new Uint8Array([1]), 'x.zip')).toThrow(
      /\.fit or .gpx/,
    )
    const point =
      '<trkpt lat="0" lon="1"><time>2026-09-28T10:00:00Z</time></trkpt>'
    expect(() =>
      parseGpx(
        `<gpx><trk><trkseg>${point.repeat(50_001)}</trkseg></trk></gpx>`,
      ),
    ).toThrow(/50,000/)
    const validPoints = Array.from(
      { length: 50_000 },
      (_, i) =>
        `<trkpt lat="0" lon="1"><time>${new Date(Date.parse('2026-09-28T00:00:00Z') + i * 1000).toISOString()}</time></trkpt>`,
    ).join('')
    expect(
      parseGpx(`<gpx><trk><trkseg>${validPoints}</trkseg></trk></gpx>`).geoJson
        .features[0]!.geometry.coordinates,
    ).toHaveLength(50_000)
    expect(() =>
      parseGpx(
        `<gpx><trk>${('<trkseg>' + point.repeat(2) + '</trkseg>').repeat(101)}</trk></gpx>`,
      ),
    ).toThrow(/100 track/)
  })
})
