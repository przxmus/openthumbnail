declare module '@/paraglide/messages.js' {
  export const m: Record<
    string,
    (params?: Record<string, string | number | undefined>) => string
  >
}

declare module '@/paraglide/runtime.js' {
  export function getLocale(): string
  export function setLocale(locale: string, options?: { reload?: boolean }): void
}
