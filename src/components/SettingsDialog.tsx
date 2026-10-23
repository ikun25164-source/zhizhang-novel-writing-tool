import { useEffect, useState } from 'react'
import {
  CalendarDays,
  ClipboardCopy,
  Cloud,
  Database,
  Download,
  ExternalLink,
  LogOut,
  Palette,
  RefreshCw,
  Send,
  Trash2,
  Type,
  Wifi,
} from 'lucide-react'
import { useApp } from '../store'
import { api } from '../lib/api'
import { copyText, formatNumber, saveBlob } from '../lib/utils'
import { buildManuscript, openExternal, PUBLISH_PLATFORMS } from '../lib/publish'
import type { SyncConfig, SyncInput, SyncMethod, SyncResult } from '../types'
import { Confirm, Field, Modal, Segmented, Toggle } from './ui'

function readFileAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : '')
    }
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'))
    reader.readAsDataURL(blob)
  })
}

function safeFileName(title: string): string {
  return title.trim().replace(/[\\/:*?"<>|\s]/g, '_').slice(0, 60) || '作品'
}

function formatSyncTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function syncSummary(result: SyncResult) {
  const parts = [`上传 ${result.uploaded}`, `下载 ${result.downloaded}`, `跳过 ${result.skipped}`]
  if (result.conflicts) parts.push(`冲突副本 ${result.conflicts}`)
  return `同步完成：${parts.join('，')}`
}

export default function SettingsDialog() {
  const open = useApp((s) => s.settingsOpen)
  const setOpen = useApp((s) => s.setSettingsOpen)
  const project = useApp((s) => s.project)
  const network = useApp((s) => s.network)
  const native = useApp((s) => s.native)
  const updateMeta = useApp((s) => s.updateMeta)
  const closeProject = useApp((s) => s.closeProject)
  const deleteProject = useApp((s) => s.deleteProject)
  const toast = useApp((s) => s.toast)
  const uiStyle = useApp((s) => s.uiStyle)
  const setUiStyle = useApp((s) => s.setUiStyle)
  const drawerWide = useApp((s) => s.drawerWide)
  const setDrawerWide = useApp((s) => s.setDrawerWide)
  const volumes = useApp((s) => s.volumes)
  const chapters = useApp((s) => s.chapters)
  const contents = useApp((s) => s.contents)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copiedText, setCopiedText] = useState('')
  const [sync, setSync] = useState<SyncConfig | null>(null)
  const [syncMethod, setSyncMethod] = useState<SyncMethod>('local')
  const [syncForm, setSyncForm] = useState({ url: '', username: '', password: '', remotePath: 'zhizhang' })
  const [syncBusy, setSyncBusy] = useState<'test' | 'save' | 'run' | null>(null)
  const [syncStatus, setSyncStatus] = useState('')

  const applySyncConfig = (cfg: SyncConfig) => {
    setSync(cfg)
    setSyncMethod(cfg.method)
    setSyncForm({
      url: cfg.webdav.url,
      username: cfg.webdav.username,
      password: '',
      remotePath: cfg.webdav.remotePath,
    })
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    api
      .syncConfig()
      .then((cfg) => {
        if (!cancelled) applySyncConfig(cfg)
      })
      .catch((err) => {
        if (!cancelled) setSyncStatus(err instanceof Error ? err.message : '无法读取同步设置')
      })
    return () => {
      cancelled = true
    }
  }, [open, native])

  if (!project) return null
  const settings = project.settings
  const calendar = project.calendar

  const exportAs = async (format: 'txt' | 'md' | 'json') => {
    try {
      const blob = await api.exportProject(project.id, format)
      const name = `${safeFileName(project.title)}.${format}`
      if (!native) {
        saveBlob(blob, name)
        return
      }
      const base64 = await readFileAsBase64(blob)
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      const { Share } = await import('@capacitor/share')
      let uri: string
      try {
        uri = (await Filesystem.writeFile({ path: name, data: base64, directory: Directory.Documents, recursive: true })).uri
      } catch {
        uri = (await Filesystem.writeFile({ path: name, data: base64, directory: Directory.Data, recursive: true })).uri
      }
      await Share.share({ title: project.title, text: name, url: uri, dialogTitle: '分享作品文件' })
    } catch (err) {
      const message = err instanceof Error ? err.message : '导出失败'
      if (!/cancel/i.test(message)) toast(message)
    }
  }

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
    setCopiedText(`已复制 ${count} 章 · ${formatNumber(words)} 字，可直接粘贴到投稿页`)
    toast('全文已复制到剪贴板')
    return true
  }

  const openPlatform = async (platform: { name: string; url: string }) => {
    const copied = await copyFull()
    toast(copied ? `正在打开${platform.name}，登录作家专区后粘贴` : `正在打开${platform.name}`)
    try {
      await openExternal(platform.url, native)
    } catch {
      toast('无法打开浏览器，请手动访问 ' + platform.url)
    }
  }

  const setSettings = (patch: Partial<typeof settings>) => updateMeta({ settings: { ...settings, ...patch } })
  const setCalendar = (patch: Partial<typeof calendar>) => updateMeta({ calendar: { ...calendar, ...patch } })

  const syncInput = (): SyncInput => ({
    method: syncMethod,
    webdav: {
      url: syncForm.url.trim(),
      username: syncForm.username.trim(),
      remotePath: syncForm.remotePath.trim() || 'zhizhang',
      ...(syncForm.password ? { password: syncForm.password } : {}),
    },
  })

  const persistSync = async () => {
    const cfg = await api.saveSyncConfig(syncInput())
    applySyncConfig(cfg)
    return cfg
  }

  const handleSaveSync = async () => {
    setSyncBusy('save')
    setSyncStatus('')
    try {
      await persistSync()
      setSyncStatus('同步设置已保存')
      toast('同步设置已保存')
    } catch (err) {
      setSyncStatus(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSyncBusy(null)
    }
  }

  const handleTestSync = async () => {
    setSyncBusy('test')
    setSyncStatus('正在连接…')
    try {
      const result = await api.testSync(syncInput())
      setSyncStatus(result.message)
    } catch (err) {
      setSyncStatus(err instanceof Error ? err.message : '连接失败')
    } finally {
      setSyncBusy(null)
    }
  }

  const handleRunSync = async () => {
    setSyncBusy('run')
    setSyncStatus('正在同步…')
    try {
      await useApp.getState().flushAll()
      const cfg = await persistSync()
      if (cfg.method !== 'webdav' || !cfg.webdav.url) {
        setSyncStatus('请先填写 WebDAV 地址')
        return
      }
      const result = await api.runSync()
      applySyncConfig(await api.syncConfig())
      setSyncStatus(syncSummary(result))
      toast('WebDAV 同步完成')
      if (result.downloaded > 0) {
        await useApp.getState().openProject(project.id)
        toast('云端有更新，作品已重新载入')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '同步失败'
      setSyncStatus(message)
      toast(message)
    } finally {
      setSyncBusy(null)
    }
  }

  const lastSyncText = sync?.lastResult
    ? `上次同步 ${formatSyncTime(sync.lastResult.at)} · 上传 ${sync.lastResult.uploaded}，下载 ${sync.lastResult.downloaded}，跳过 ${sync.lastResult.skipped}${
        sync.lastResult.conflicts ? `，冲突副本 ${sync.lastResult.conflicts}` : ''
      }${sync.lastResult.error ? ` · ${sync.lastResult.error}` : ''}`
    : ''

  return (
    <>
      <Modal
        open={open}
        wide
        title="作品设置"
        onClose={() => setOpen(false)}
        icon={<Palette size={17} />}
        footer={
          <button className="btn btn-primary" onClick={() => setOpen(false)}>
            完成
          </button>
        }
      >
        <div className="settings-grid">
          <section className="settings-section full">
            <h4>
              <Type size={13} /> 作品信息
            </h4>
            <div className="col gap-8">
              <Field label="作品名称">
                <input className="input" value={project.title} onChange={(event) => updateMeta({ title: event.target.value })} />
              </Field>
              <div className="form-grid">
                <Field label="作者">
                  <input className="input" value={project.author} onChange={(event) => updateMeta({ author: event.target.value })} />
                </Field>
                <Field label="累计字数">
                  <div className="input" style={{ display: 'flex', alignItems: 'center', color: 'var(--muted)' }}>
                    {formatNumber(Object.values(useApp.getState().contents).reduce((sum, c) => sum + (c.wordCount || 0), 0))} 字
                  </div>
                </Field>
              </div>
              <Field label="简介">
                <textarea
                  className="textarea"
                  rows={2}
                  value={project.description}
                  onChange={(event) => updateMeta({ description: event.target.value })}
                />
              </Field>
            </div>
          </section>

          <section className="settings-section full">
            <h4>
              <Palette size={13} /> 界面风格
            </h4>
            <div className="col gap-8">
              <Segmented
                value={uiStyle}
                onChange={(style) => setUiStyle(style)}
                options={[
                  { value: 'glass', label: '玻璃拟态' },
                  { value: 'paper', label: '素纸原版' },
                ]}
              />
              <div className="small muted">
                {uiStyle === 'glass'
                  ? '浅色磨砂玻璃界面，黑白灰单色层次，适合长时间专注写作。'
                  : '原版纸感界面，可在下方选择素纸浅色或夜墨深色。'}
              </div>
              <Field label="手机端目录抽屉">
                <Segmented
                  value={drawerWide ? 'wide' : 'narrow'}
                  onChange={(value) => setDrawerWide(value === 'wide')}
                  options={[
                    { value: 'narrow', label: '窄版覆盖' },
                    { value: 'wide', label: '整屏展开' },
                  ]}
                />
              </Field>
              <div className="small muted">
                窄版覆盖只占屏幕约 3/4，能边看目录边看正文；整屏展开适合章节很多时快速翻找。
              </div>
            </div>
          </section>

          <section className="settings-section">
            <h4>
              <Type size={13} /> 正文排版
            </h4>
            <div className="col gap-10">
              <Field label="正文字体">
                <Segmented
                  value={settings.font}
                  onChange={(font) => setSettings({ font })}
                  options={[
                    { value: 'serif', label: '宋体 / 衬线' },
                    { value: 'sans', label: '黑体 / 无衬线' },
                  ]}
                />
              </Field>
              <Field label={`字号 · ${settings.fontSize}px`}>
                <input
                  type="range"
                  min={14}
                  max={26}
                  step={1}
                  value={settings.fontSize}
                  onChange={(event) => setSettings({ fontSize: Number(event.target.value) })}
                />
              </Field>
              <Field label={`行距 · ${settings.lineHeight.toFixed(2)}`}>
                <input
                  type="range"
                  min={1.4}
                  max={2.4}
                  step={0.05}
                  value={settings.lineHeight}
                  onChange={(event) => setSettings({ lineHeight: Number(event.target.value) })}
                />
              </Field>
              <Field label={`版心宽度 · ${settings.editorWidth}px`}>
                <input
                  type="range"
                  min={560}
                  max={980}
                  step={20}
                  value={settings.editorWidth}
                  onChange={(event) => setSettings({ editorWidth: Number(event.target.value) })}
                />
              </Field>
              <Toggle checked={settings.indent} onChange={(indent) => setSettings({ indent })} label="段首缩进两字" />
              {uiStyle === 'paper' ? (
                <Field label="主题">
                  <Segmented
                    value={settings.theme}
                    onChange={(theme) => setSettings({ theme })}
                    options={[
                      { value: 'light', label: '素纸' },
                      { value: 'dark', label: '夜墨' },
                    ]}
                  />
                </Field>
              ) : (
                <Field label="主题">
                  <div className="small muted">玻璃拟态固定为浅色模式；切回素纸原版后可选择夜墨。</div>
                </Field>
              )}
            </div>
          </section>

          <section className="settings-section">
            <h4>
              <CalendarDays size={13} /> 时间体系
            </h4>
            <div className="col gap-10">
              <Field label="时间模式">
                <Segmented
                  value={calendar.mode}
                  onChange={(mode) => setCalendar({ mode })}
                  options={[
                    { value: 'date', label: '年月日' },
                    { value: 'day', label: '第 N 天' },
                    { value: 'free', label: '自由' },
                  ]}
                />
              </Field>
              {calendar.mode === 'date' && (
                <>
                  <Field label="纪年前缀">
                    <input
                      className="input"
                      value={calendar.era}
                      placeholder="如：玄历、公元"
                      onChange={(event) => setCalendar({ era: event.target.value })}
                    />
                  </Field>
                  <div className="form-grid">
                    <Field label="每年月数">
                      <input
                        className="input"
                        type="number"
                        min={1}
                        max={24}
                        value={calendar.monthsPerYear}
                        onChange={(event) => setCalendar({ monthsPerYear: Math.max(1, Number(event.target.value) || 1) })}
                      />
                    </Field>
                    <Field label="每月天数">
                      <input
                        className="input"
                        type="number"
                        min={1}
                        max={60}
                        value={calendar.daysPerMonth}
                        onChange={(event) => setCalendar({ daysPerMonth: Math.max(1, Number(event.target.value) || 1) })}
                      />
                    </Field>
                  </div>
                </>
              )}
              <Field label="每天小时数（影响同一时刻排序）">
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={48}
                  value={calendar.hoursPerDay}
                  onChange={(event) => setCalendar({ hoursPerDay: Math.max(1, Number(event.target.value) || 24) })}
                />
              </Field>
              <div className="hint-box">事件线会按这里的历法计算时间顺序；修改后会自动重排。</div>
            </div>
          </section>

          <section className="settings-section full">
            <h4>
              <Cloud size={13} /> 同步
            </h4>
            <div className="col gap-10">
              <Field label="同步方式">
                <Segmented
                  value={syncMethod}
                  onChange={(method) => {
                    setSyncMethod(method)
                    setSyncStatus('')
                  }}
                  options={[
                    { value: 'local', label: '仅本机' },
                    { value: 'webdav', label: 'WebDAV' },
                  ]}
                />
              </Field>
              <div className="small muted" style={{ lineHeight: 1.7 }}>
                作品始终保存在本机数据目录。选择 WebDAV 后，只在本机与你自己的远程目录之间双向合并文件，不经过任何第三方托管。
              </div>

              {syncMethod === 'webdav' ? (
                <>
                  <div className="form-grid">
                    <Field label="WebDAV 地址">
                      <input
                        className="input"
                        value={syncForm.url}
                        placeholder="https://dav.example.com/remote.php/dav/files/用户名"
                        onChange={(event) => setSyncForm({ ...syncForm, url: event.target.value })}
                      />
                    </Field>
                    <Field label="远程目录">
                      <input
                        className="input"
                        value={syncForm.remotePath}
                        placeholder="zhizhang"
                        onChange={(event) => setSyncForm({ ...syncForm, remotePath: event.target.value })}
                      />
                    </Field>
                    <Field label="用户名">
                      <input
                        className="input"
                        autoComplete="username"
                        value={syncForm.username}
                        onChange={(event) => setSyncForm({ ...syncForm, username: event.target.value })}
                      />
                    </Field>
                    <Field label="密码 / 应用授权码">
                      <input
                        className="input"
                        type="password"
                        autoComplete="current-password"
                        value={syncForm.password}
                        placeholder={sync?.webdav.hasPassword ? '已保存，留空保持不变' : '填写你的密码或授权码'}
                        onChange={(event) => setSyncForm({ ...syncForm, password: event.target.value })}
                      />
                    </Field>
                  </div>

                  <div className="row wrap gap-6">
                    <button className="btn btn-sm" disabled={syncBusy !== null} onClick={handleTestSync}>
                      <Wifi size={13} /> 测试连接
                    </button>
                    <button className="btn btn-sm" disabled={syncBusy !== null} onClick={handleSaveSync}>
                      保存设置
                    </button>
                    <button className="btn btn-sm btn-primary" disabled={syncBusy !== null} onClick={handleRunSync}>
                      <RefreshCw size={13} className={syncBusy === 'run' ? 'spin' : undefined} />
                      {syncBusy === 'run' ? '同步中…' : '立即同步'}
                    </button>
                  </div>

                  <div className="hint-box small" style={{ lineHeight: 1.7 }}>
                    {syncStatus || lastSyncText || '首次同步会先合并作品列表，再逐个文件比较修改时间，保留较新的版本。'}
                  </div>
                  <div className="small muted" style={{ lineHeight: 1.7 }}>
                    {native
                      ? '账号密码只保存在这台设备里。云端版本覆盖本地前，旧文件会先上传到远程的 conflicts 目录备份。若提示跨域被拦截，请换用支持 CORS 的 WebDAV（如 Nextcloud）或让网盘服务商开启跨域。'
                      : '账号密码只保存在本机 data 目录的 sync.json 中。云端版本覆盖本地前，旧文件会留存在 sync-conflicts 文件夹，便于找回。'}
                  </div>
                </>
              ) : (
                <div className="hint-box small">
                  {native
                    ? '仅使用本机数据，不进行云端同步。切换到 WebDAV 后，手机与电脑可以共用同一个作品库。'
                    : '仅使用本机数据，不进行云端同步。切换到 WebDAV 后，可在多台电脑之间同步同一个作品库。'}
                </div>
              )}
            </div>
          </section>

          <section className="settings-section">
            <h4>
              <Download size={13} /> 导出作品
            </h4>
            <div className="col gap-8">
              <div className="row wrap gap-6">
                <button className="btn btn-sm" onClick={() => void exportAs('txt')}>
                  TXT 全文
                </button>
                <button className="btn btn-sm" onClick={() => void exportAs('md')}>
                  Markdown
                </button>
                <button className="btn btn-sm" onClick={() => void exportAs('json')}>
                  完整 JSON
                </button>
              </div>
              <div className="hint-box">
                {native
                  ? '导出会生成文件并调用系统分享，可存到手机或发送到电脑；JSON 用于备份迁移。'
                  : '导出包含正文与设定附录；JSON 可用于备份迁移，不会影响现有数据。'}
              </div>
            </div>
          </section>

          <section className="settings-section full">
            <h4>
              <Send size={13} /> 发布投稿
            </h4>
            <div className="col gap-10">
              <div className="row wrap gap-8">
                <button className="btn btn-sm btn-primary" onClick={() => void copyFull()}>
                  <ClipboardCopy size={13} /> 一键复制全文
                </button>
                <span className="small muted">
                  仅按分卷与章节顺序拼接正文，包含书名、作者行，不含章纲与设定。
                </span>
              </div>
              {copiedText && <div className="hint-box small">{copiedText}</div>}
              <div className="pub-links">
                {PUBLISH_PLATFORMS.map((platform) => (
                  <button key={platform.name} className="pub-link" onClick={() => void openPlatform(platform)}>
                    <span>
                      <b>{platform.name}</b>
                      <i>{platform.url.replace(/^https?:\/\//, '')}</i>
                    </span>
                    <ExternalLink size={12} />
                  </button>
                ))}
              </div>
              <div className="small muted" style={{ lineHeight: 1.7 }}>
                这里放的是各站的作家专区 / 作者后台入口，不是阅读站。点击后会先把全文放进剪贴板，再打开对应后台；新建作品或章节后直接粘贴。投稿一般需要先注册作者号并选择编辑，正文以平台编辑审核通过为准。
              </div>
            </div>
          </section>

          <section className="settings-section">
            <h4>
              <Database size={13} /> 数据与设备
            </h4>
            <div className="col gap-8">
              <div className="small muted" style={{ lineHeight: 1.7, wordBreak: 'break-all' }}>
                {native ? (
                  <>
                    数据位置：这台设备的本地存储
                    <br />
                    卸载 App 会一并删除作品，建议定期在下方导出完整 JSON 备份；删除作品后无法恢复。
                  </>
                ) : (
                  <>
                    数据目录：{network?.dataRoot || '本机作品数据目录'}
                    <br />
                    每日自动备份，至少保留 30 份；删除作品会进入回收站。
                  </>
                )}
              </div>
              <button
                className="btn btn-sm"
                onClick={async () => {
                  await useApp.getState().flushAll()
                  await closeProject()
                  setOpen(false)
                }}
              >
                <LogOut size={13} /> 返回作品列表
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={13} /> 删除本作品
              </button>
            </div>
          </section>
        </div>
      </Modal>

      <Confirm
        open={confirmDelete}
        title="删除作品"
        message={
          native
            ? `确定删除「${project.title}」吗？作品会从这台设备移除，无法恢复。`
            : `确定删除「${project.title}」吗？作品文件夹会被移动到数据目录的回收站中。`
        }
        confirmText="删除作品"
        onConfirm={async () => {
          await deleteProject(project.id)
          setOpen(false)
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  )
}
