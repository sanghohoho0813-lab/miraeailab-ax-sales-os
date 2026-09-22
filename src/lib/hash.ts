/** SHA-256 (Web Crypto — 브라우저·Node 공용) + 키 순서에 안정적인 JSON 직렬화 */

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(data: Uint8Array | ArrayBuffer | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data)
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    // 아주 오래된 환경 — 충돌 위험이 있으나 캐시 키 용도로만 쓴다
    let h = 0
    for (const b of bytes) h = (h * 31 + b) >>> 0
    return `fallback-${h.toString(16)}`
  }
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return toHex(await subtle.digest('SHA-256', copy))
}

/** 키를 정렬해 직렬화 — 같은 내용이면 같은 문자열 */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o)
    .sort()
    .filter((k) => o[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`
}
