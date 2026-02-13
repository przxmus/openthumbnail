import type { OutputAsset } from '@/types/workshop'
import { m } from '@/paraglide/messages.js'
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
        {m.asset_preview_unavailable()}
      </div>
    )
  }

  return (
    <div className={cn('relative h-full w-full overflow-hidden rounded-xl bg-muted/20', className)}>
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-xl opacity-45"
      />
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="relative z-10 h-full w-full object-contain"
      />
    </div>
  )
}
