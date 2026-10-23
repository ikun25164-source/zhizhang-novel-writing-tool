import { ClipboardCopy, ExternalLink, Send } from 'lucide-react'
import { useApp } from '../store'
import { copyText, formatNumber } from '../lib/utils'
import { buildManuscript, openExternal, PUBLISH_PLATFORMS } from '../lib/publish'
import { Dropdown } from './ui'

export default function PublishMenu() {
  const project = useApp((s) => s.project)
  const volumes = useApp((s) => s.volumes)
  const chapters = useApp((s) => s.chapters)
  const contents = useApp((s) => s.contents)
  const native = useApp((s) => s.native)
  const toast = useApp((s) => s.toast)

  if (!project) return null

  const copyFull = async () => {
    const { text, count, words } = buildManuscript(project, volumes, chapters, contents)
    if (!count) {
      toast('还没有写好的正文，无法复制')
      return false
    }
    if (!(await copyText(text))) {
      toast('复制失败，请在编辑器里手动选择正文')
      return false
    }
    toast(`已复制 ${count} 章 · ${formatNumber(words)} 字，可粘贴到作家后台`)
    return true
  }

  const openPlatform = async (platform: { name: string; url: string }) => {
    const copied = await copyFull()
    toast(copied ? `正在打开${platform.name}，登录后粘贴` : `正在打开${platform.name}`)
    try {
      await openExternal(platform.url, native)
    } catch {
      toast('无法打开浏览器，请手动访问 ' + platform.url)
    }
  }

  return (
    <Dropdown
      className="publish-wrap"
      trigger={
        <button className="top-icon publish-btn" title="发布投稿：复制全文并打开作家后台">
          <Send size={15} />
          <span>投稿</span>
        </button>
      }
    >
      <div className="publish-pop">
        <div className="publish-pop-head">
          <b>发布投稿</b>
          <span>先复制全文，再打开作家后台粘贴</span>
        </div>
        <button className="menu-item" onClick={() => void copyFull()}>
          <ClipboardCopy size={13} /> 一键复制全文
        </button>
        <div className="menu-sep" />
        {PUBLISH_PLATFORMS.map((platform) => (
          <button key={platform.name} className="menu-item publish-item" onClick={() => void openPlatform(platform)}>
            <span>
              <b>{platform.name}</b>
              <i>{platform.url.replace(/^https?:\/\//, '')}</i>
            </span>
            <ExternalLink size={12} />
          </button>
        ))}
      </div>
    </Dropdown>
  )
}
