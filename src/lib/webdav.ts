export interface WebdavTarget {
  url: string
  username: string
  password: string
  remotePath: string
}

export interface WebdavEntry {
  name: string
  href: string
  mtime: number
  size: number
  isDir: boolean
}

function basic(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return `Basic ${btoa(binary)}`
}

function base(target: WebdavTarget): string {
  return target.url.trim().replace(/\/+$/, '')
}

function folder(target: WebdavTarget): string {
  return target.remotePath.trim().replace(/^\/+|\/+$/g, '')
}

function urlFor(target: WebdavTarget, rel: string): string {
  const parts = [folder(target), rel].join('/').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '')
  return parts ? `${base(target)}/${parts.split('/').map(encodeURIComponent).join('/')}` : `${base(target)}/`
}

const PROPFIND_BODY =
  '<?xml version="1.0"?>' +
  '<d:propfind xmlns:d="DAV:">' +
  '<d:prop><d:resourcetype/><d:getlastmodified/><d:getcontentlength/></d:prop>' +
  '</d:propfind>'

async function raw(target: WebdavTarget, url: string, method: string, body?: string, headers?: Record<string, string>): Promise<Response> {
  return await fetch(url, {
    method,
    body,
    headers: {
      Authorization: basic(target.username, target.password),
      Accept: '*/*',
      ...(method === 'PROPFIND' ? { 'Content-Type': 'application/xml; charset=utf-8', Depth: '1' } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
      ...(headers || {}),
    },
  })
}

function childValue(root: Element | Document, name: string): string {
  const node = root.getElementsByTagName(name)[0] || root.getElementsByTagNameNS('*', name)[0]
  return node?.textContent?.trim() || ''
}

function parseMultistatus(xml: Document): WebdavEntry[] {
  const list = xml.getElementsByTagName('response').length
    ? Array.from(xml.getElementsByTagName('response'))
    : Array.from(xml.getElementsByTagNameNS('*', 'response'))
  const out: WebdavEntry[] = []
  for (const response of list) {
    const href = childValue(response, 'href')
    if (!href) continue
    const isDir = /collection/i.test(childValue(response, 'resourcetype'))
    const mtimeText = childValue(response, 'getlastmodified')
    const parsed = mtimeText ? Date.parse(mtimeText) : NaN
    out.push({
      name: decodeURIComponent(href.replace(/\/+$/, '').split('/').pop() || ''),
      href,
      mtime: Number.isNaN(parsed) ? 0 : parsed,
      size: Number(childValue(response, 'getcontentlength')) || 0,
      isDir,
    })
  }
  return out
}

/** 逐级创建远程目录链（WebDAV 要求父目录先存在） */
export async function webdavEnsure(target: WebdavTarget, rel = ''): Promise<void> {
  const segments = [...folder(target).split('/'), ...rel.split('/')].filter(Boolean)
  const chain: string[] = []
  for (const segment of segments) {
    chain.push(segment)
    const url = `${base(target)}/${chain.join('/')}`
    const res = await raw(target, url, 'MKCOL')
    if (res.ok || res.status === 405 || res.status === 301 || res.status === 102) continue
    const check = await raw(target, `${url}/`, 'PROPFIND', PROPFIND_BODY)
    if (!check.ok && check.status !== 207) throw new Error(`无法创建远程目录 ${chain.join('/')}（${res.status}）`)
  }
}

export async function webdavList(target: WebdavTarget, rel = ''): Promise<WebdavEntry[]> {
  const url = urlFor(target, rel)
  const res = await raw(target, url.endsWith('/') ? url : `${url}/`, 'PROPFIND', PROPFIND_BODY)
  if (res.status === 404 || res.status === 409) return []
  if (!res.ok && res.status !== 207) throw new Error(`WebDAV 列目录失败（${res.status}）`)
  const xml = new DOMParser().parseFromString(await res.text(), 'application/xml')
  if (xml.getElementsByTagName('parsererror').length) throw new Error('WebDAV 返回的目录列表无法解析')
  const self = url.replace(/\/+$/, '')
  return parseMultistatus(xml).filter((entry) => entry.href.replace(/\/+$/, '') !== self)
}

export async function webdavGet(target: WebdavTarget, rel: string): Promise<string | null> {
  const res = await raw(target, urlFor(target, rel), 'GET')
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`读取 ${rel} 失败（${res.status}）`)
  return await res.text()
}

export async function webdavPut(target: WebdavTarget, rel: string, data: string): Promise<void> {
  await webdavEnsure(target, rel.split('/').slice(0, -1).join('/'))
  const res = await raw(target, urlFor(target, rel), 'PUT', data)
  if (!res.ok && res.status !== 201 && res.status !== 204) throw new Error(`上传 ${rel} 失败（${res.status}）`)
}
