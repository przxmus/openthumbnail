import { YOUTUBE_THUMBNAIL_CANDIDATES } from '@/lib/constants/workshop'

function extractVideoIdFromWatch(url: URL) {
  return url.searchParams.get('v')
}

function extractVideoIdFromShortUrl(url: URL) {
  const path = url.pathname.replace(/^\//, '')
  return path || null
}

function extractVideoIdFromShorts(url: URL) {
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments[0] !== 'shorts' || !segments[1]) {
    return null
  }

  return segments[1]
}

export function extractYoutubeVideoId(rawUrl: string) {
  try {
    const url = new URL(rawUrl.trim())
    const host = url.hostname.replace(/^www\./, '')

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (url.pathname === '/watch') {
        return extractVideoIdFromWatch(url)
      }

      if (url.pathname.startsWith('/shorts/')) {
        return extractVideoIdFromShorts(url)
      }
    }

    if (host === 'youtu.be') {
      return extractVideoIdFromShortUrl(url)
    }

    return null
  } catch {
    return null
  }
}

export async function fetchBestYoutubeThumbnail(videoId: string) {
  for (const candidate of YOUTUBE_THUMBNAIL_CANDIDATES) {
    const url = `https://i.ytimg.com/vi/${videoId}/${candidate}`
    const response = await fetch(url)

    if (!response.ok) {
      continue
    }

    const blob = await response.blob()

    if (blob.size < 1500) {
      continue
    }

    return {
      blob,
      sourceUrl: url,
    }
  }

  throw new Error('Unable to fetch a thumbnail for this YouTube URL')
}
