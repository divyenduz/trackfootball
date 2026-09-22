// TODO: share tsconfig.json and global.d.ts in monorepo
declare namespace NodeJS {
  // Merge the existing `ProcessEnv` definition with ours
  // https://www.typescriptlang.org/docs/handbook/declaration-merging.html#merging-interfaces
  export interface ProcessEnv {
    DATABASE_URL: string
  }
}
