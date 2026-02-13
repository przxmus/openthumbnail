import type { OutputAsset } from '@/types/workshop'
import { useObjectUrl } from '@/lib/hooks/use-object-url'
import { cn } from '@/lib/utils'

interface AssetThumbProps {
  asset: OutputAsset
  alt: string
  className?: string
}

export function AssetThumb({ asset, alt, className }: AssetThumbProps) {
  const src = useObjectUrl(asset.blob)

  if (!src) {
    return (
      <div
        className={cn(
          'bg-muted text-muted-foreground flex aspect-video items-center justify-center rounded-xl text-xs',
          className,
        )}
      >
        Preview unavailable
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={cn('h-full w-full rounded-xl object-cover', className)}
    />
  )
}
