import type { Artifact, RouteArtifact } from '../protocol/index.js'
import type { ArtifactList } from './state/catalog.js'

export type DisplayedArtifact = Artifact | RouteArtifact | import('../protocol/entities.js').ObservedArtifact

/** 展示时合并，生成事实仍只在 artifacts 中，不给路线引用捏造 Run。 */
export function artifactEntries(data: ArtifactList | undefined): DisplayedArtifact[] {
  const entries = new Map<string, DisplayedArtifact>()
  for (const file of data?.artifacts ?? []) entries.set(file.path, file)
  for (const file of data?.observedArtifacts ?? []) if (!entries.has(file.path)) entries.set(file.path,file)
  for (const file of data?.routeArtifacts ?? []) if (!entries.has(file.path)) entries.set(file.path, file)
  return [...entries.values()]
}
