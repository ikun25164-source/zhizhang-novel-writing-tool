import type { ChapterContent, ChapterMeta, ProjectMeta, Volume } from '../types'
import { sortByOrder } from './utils'

export const PUBLISH_PLATFORMS = [
  { name: '阅文作家专区', sub: '起点 / QQ阅读 / 创世', url: 'https://write.qq.com/' },
  { name: '番茄作家专区', sub: 'fanqienovel', url: 'https://fanqienovel.com/writer/zone' },
  { name: '七猫作者专区', sub: 'zuozhe.qimao', url: 'https://zuozhe.qimao.com/' },
  { name: '晋江作者专区', sub: 'jjwxc', url: 'https://my.jjwxc.net/' },
  { name: '纵横作者专区', sub: 'zuozhe.zongheng', url: 'https://zuozhe.zongheng.com/' },
  { name: '刺猬猫作者平台', sub: 'author.ciweimao', url: 'https://author.ciweimao.com/' },
]

export function buildManuscript(
  project: Pick<ProjectMeta, 'title' | 'author'>,
  volumes: Volume[],
  chapters: ChapterMeta[],
  contents: Record<string, ChapterContent>,
) {
  const ordered = sortByOrder(chapters)
  const blocks: string[] = [`《${project.title}》${project.author ? `\n作者：${project.author}` : ''}`]
  const emitted = new Set<string>()
  let count = 0
  let words = 0
  const bodyOf = (id: string) => (contents[id]?.plainText || '').trim()
  const push = (chapter: ChapterMeta) => {
    const body = bodyOf(chapter.id)
    if (!body) return
    blocks.push(`${chapter.title}\n\n${body}`)
    emitted.add(chapter.id)
    count += 1
    words += body.replace(/\s+/g, '').length
  }
  for (const volume of sortByOrder(volumes)) {
    const inVolume = ordered.filter((chapter) => chapter.volumeId === volume.id)
    if (!inVolume.some((chapter) => bodyOf(chapter.id))) continue
    blocks.push(volume.title)
    inVolume.forEach(push)
  }
  ordered.filter((chapter) => !emitted.has(chapter.id)).forEach(push)
  return { text: blocks.join('\n\n'), count, words }
}

export async function openExternal(url: string, native: boolean) {
  if (native) {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url, presentationStyle: 'fullscreen' })
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
