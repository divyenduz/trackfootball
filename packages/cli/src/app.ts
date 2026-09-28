import { buildApplication, buildRouteMap } from '@stricli/core'
import { CompletionsRoute } from './commands/completions'

const routes = buildRouteMap({
  routes: {
    completions: CompletionsRoute,
  },
  aliases: {},
  docs: {
    brief: 'CLI for managing TrackFootball',
    hideRoute: {},
  },
})

export const app = buildApplication(routes, {
  name: 'TrackFootball CLI',
  versionInfo: {
    currentVersion: '0.0.0',
    getLatestVersion: () => Promise.resolve('0.0.0'),
    upgradeCommand: 'dbdev upgrade',
  },
  documentation: {},
})
