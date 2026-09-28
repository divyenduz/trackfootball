import * as tj from '@tmcw/togeojson'
import type {
  FeatureCollection,
  LineString,
  GeoJsonProperties,
} from 'geojson'
import { DOMParser } from '@xmldom/xmldom'
import { match } from 'ts-pattern'

type DataType = 'gpx' | 'geoJson'

export class GeoData {
  private data: string
  private type: DataType

  constructor(data: string, type: DataType) {
    this.data = data
    this.type = type
  }

  private gpxToGeoJson() {
    const gpx = new DOMParser().parseFromString(this.data, 'text/xml')
    const geoJson = tj.gpx(gpx)
    return geoJson
  }

  toGeoJson(): FeatureCollection<LineString, GeoJsonProperties> {
    const geoJson = match(this.type)
      .with('geoJson', () => JSON.parse(this.data))
      .with('gpx', () => this.gpxToGeoJson())
      .exhaustive()

    return geoJson
  }
}
