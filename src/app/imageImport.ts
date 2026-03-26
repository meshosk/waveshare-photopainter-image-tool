import { createImageEntry } from './imageEntries'
import type { ImageEntry } from './types'
import { loadImageFile, releaseImage } from '../image'

export const importImageFiles = async (
  files: File[],
  existingHashes: Iterable<string>,
): Promise<{
  loadedEntries: ImageEntry[]
  failures: string[]
  duplicates: number
}> => {
  const loadedEntries: ImageEntry[] = []
  const failures: string[] = []
  let duplicates = 0
  const knownHashes = new Set(existingHashes)

  for (const file of files) {
    try {
      const loaded = await loadImageFile(file)

      if (knownHashes.has(loaded.hash)) {
        duplicates += 1
        releaseImage(loaded.src)
        continue
      }

      knownHashes.add(loaded.hash)
      loadedEntries.push(createImageEntry(loaded))
    } catch (error) {
      console.error('[import-images]', error)
      failures.push(error instanceof Error ? error.message : 'Unknown problem while loading file.')
    }
  }

  return {
    loadedEntries,
    failures,
    duplicates,
  }
}