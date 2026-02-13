import JSZip from 'jszip'

import type { OutputAsset } from '@/types/workshop'
import { convertBlobToJpg } from '@/lib/services/image-utils'

export async function exportAssetAsJpg(asset: OutputAsset) {
  const jpgBlob = await convertBlobToJpg(asset.blob, 0.92)
  return {
    filename: `${asset.id}.jpg`,
    blob: jpgBlob,
  }
}

export async function exportAssetsAsZip(projectName: string, assets: Array<OutputAsset>) {
  const zip = new JSZip()

  await Promise.all(
    assets.map(async (asset) => {
      const jpg = await convertBlobToJpg(asset.blob, 0.92)
      zip.file(`${asset.id}.jpg`, jpg)
    }),
  )

  const blob = await zip.generateAsync({ type: 'blob' })

  return {
    filename: `${projectName.replace(/\s+/g, '-').toLowerCase()}-batch.zip`,
    blob,
  }
}
