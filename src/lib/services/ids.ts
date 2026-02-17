export function newId(prefix: string) {
  const hasWebCrypto = typeof crypto !== 'undefined'
  if (hasWebCrypto && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`
  }

  if (hasWebCrypto && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    const hex = Array.from(bytes)
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
    return `${prefix}_${hex}`
  }

  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}
