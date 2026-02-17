import { useEffect } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '@/lib/utils'
import { lockBodyScroll, unlockBodyScroll } from '@/lib/services/scroll-lock'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  closeLabel?: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'md' | 'lg' | 'xl'
}

const sizeClassMap: Record<NonNullable<ModalProps['size']>, string> = {
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
}

export function Modal({
  open,
  onClose,
  title,
  description,
  closeLabel = 'Close',
  children,
  footer,
  size = 'lg',
}: ModalProps) {
  useEffect(() => {
    if (!open) {
      return
    }

    lockBodyScroll()

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onEscape)

    return () => {
      unlockBodyScroll()
      window.removeEventListener('keydown', onEscape)
    }
  }, [onClose, open])

  if (!open || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={closeLabel}
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        className={cn(
          'bg-card text-card-foreground ring-border relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-3xl ring-1',
          sizeClassMap[size],
        )}
      >
        <header className="border-border/70 flex items-start justify-between gap-4 border-b px-6 py-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{title}</h2>
            {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
          </div>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground rounded-full px-2 py-1 text-sm"
            onClick={onClose}
          >
            {closeLabel}
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-6 py-5">{children}</div>
        {footer ? <footer className="border-border/70 border-t px-6 py-4">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  )
}
