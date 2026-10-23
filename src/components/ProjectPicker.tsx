import { useEffect, useState } from 'react'
import { BookOpen, Cloud, Loader2, Palette, Plus, RefreshCw, Settings2, Trash2 } from 'lucide-react'
import { useApp } from '../store'
import { api } from '../lib/api'
import { formatDate, formatNumber } from '../lib/utils'
import { Confirm, Field, Modal } from './ui'

export default function ProjectPicker() {
  const projects = useApp((s) => s.projects)
  const ready = useApp((s) => s.ready)
  const loading = useApp((s) => s.loading)
  const native = useApp((s) => s.native)
  const error = useApp((s) => s.error)
  const network = useApp((s) => s.network)
  const createProject = useApp((s) => s.createProject)
  const deleteProject = useApp((s) => s.deleteProject)
  const openProject = useApp((s) => s.openProject)
  const loadProjects = useApp((s) => s.loadProjects)
  const refreshNetwork = useApp((s) => s.refreshNetwork)

  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState(localStorage.getItem('zhizhang.author') || '')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [syncForm, setSyncForm] = useState({ url: '', username: '', password: '', remotePath: 'zhizhang' })
  const [syncBusy, setSyncBusy] = useState<'test' | 'run' | null>(null)
  const [syncStatus, setSyncStatus] = useState('')
  const toast = useApp((s) => s.toast)
  const uiStyle = useApp((s) => s.uiStyle)
  const setUiStyle = useApp((s) => s.setUiStyle)

  useEffect(() => {
    if (!native) void refreshNetwork()
  }, [native, refreshNetwork])

  const submit = async () => {
    if (!title.trim() || submitting) return
    setSubmitting(true)
    localStorage.setItem('zhizhang.author', author.trim())
    const id = await createProject(title.trim(), author.trim(), description.trim())
    setSubmitting(false)
    if (id) {
      setCreateOpen(false)
      setTitle('')
      setDescription('')
    }
  }

  const closeCreate = () => {
    if (submitting) return
    setCreateOpen(false)
  }

  const openSync = () => {
    setSyncOpen(true)
    void api
      .syncConfig()
      .then((cfg) => {
        setSyncForm((prev) => ({
          url: prev.url || cfg.webdav.url,
          username: prev.username || cfg.webdav.username,
          remotePath: prev.remotePath || cfg.webdav.remotePath,
          password: prev.password,
        }))
        setSyncStatus(cfg.lastResult ? `上次同步：${formatDate(cfg.lastSyncAt || '')}` : '')
      })
      .catch(() => undefined)
  }

  const runSync = async (mode: 'test' | 'run') => {
    setSyncBusy(mode)
    setSyncStatus(mode === 'test' ? '正在连接…' : '正在同步…')
    try {
      const input = {
        method: 'webdav' as const,
        webdav: {
          url: syncForm.url.trim(),
          username: syncForm.username.trim(),
          remotePath: syncForm.remotePath.trim() || 'zhizhang',
          ...(syncForm.password ? { password: syncForm.password } : {}),
        },
      }
      if (mode === 'test') {
        const result = await api.testSync(input)
        setSyncStatus(result.message)
        return
      }
      await api.saveSyncConfig(input)
      const result = await api.runSync()
      setSyncStatus(`同步完成：上传 ${result.uploaded}，下载 ${result.downloaded}，跳过 ${result.skipped}${result.conflicts ? `，冲突备份 ${result.conflicts}` : ''}`)
      await loadProjects()
      toast('WebDAV 同步完成')
    } catch (err) {
      setSyncStatus(err instanceof Error ? err.message : '同步失败')
    } finally {
      setSyncBusy(null)
    }
  }

  return (
    <div className="picker-screen scroll-thin">
      <div className="picker-wrap">
        <div className="picker-hero">
          <div>
            <div className="hero-brand">
              <span className="brand-seal">织</span>
              <span>ZHIZHANG · 小说创作工作台</span>
            </div>
            <h1>织章</h1>
            <p>
              正文、总纲、大纲、章纲、事件线、人物与世界观地图相互联动。
              {native ? '所有作品保存在这台设备里，断网也能继续写。' : '所有作品保存在这台电脑里，随时打开，随时继续写。'}
            </p>
          </div>
          <div className="picker-actions">
            <button
              className="btn"
              onClick={() => setUiStyle(uiStyle === 'glass' ? 'paper' : 'glass')}
              title="切换界面风格"
            >
              <Palette size={14} /> {uiStyle === 'glass' ? '玻璃拟态' : '素纸原版'}
            </button>
            <button
              className="btn"
              onClick={async () => {
                setRefreshing(true)
                await loadProjects()
                if (!native) await refreshNetwork()
                window.setTimeout(() => setRefreshing(false), 300)
              }}
              title="刷新作品列表"
            >
              <RefreshCw size={14} className={refreshing ? 'spin' : ''} /> 刷新
            </button>
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus size={15} /> 新建作品
            </button>
            <button className="btn" onClick={openSync} title="从 WebDAV 拉取其它设备的作品">
              <Cloud size={14} /> 同步 / 恢复
            </button>
          </div>
        </div>

        {error && (
          <div className="hint-box" style={{ marginBottom: 14, color: 'var(--danger)' }}>
            {error}
            <button className="btn btn-sm" style={{ marginLeft: 10 }} onClick={() => void loadProjects()}>
              重试
            </button>
          </div>
        )}

        <div className="picker-toolbar">
          <div className="view-title" style={{ fontSize: 15 }}>
            我的作品 <span className="small muted" style={{ fontFamily: 'var(--sans)' }}>{projects.length}</span>
          </div>
          <div className="grow" />
          {loading && (
            <span className="row gap-6 small muted">
              <Loader2 size={13} className="spin" /> 正在打开…
            </span>
          )}
          {native && <span className="badge badge-jade">本机存储</span>}
        </div>

        {!ready && (
          <div className="empty">
            <span className="spinner" />
            正在读取作品…
          </div>
        )}

        {ready && projects.length === 0 && (
          <div className="empty" style={{ padding: '48px 16px' }}>
            <BookOpen size={30} />
            <b style={{ fontWeight: 500, color: 'var(--ink-2)' }}>还没有作品</b>
            <div>创建第一部作品，从一张空白的纸开始。</div>
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus size={15} /> 新建作品
            </button>
          </div>
        )}

        <div className="picker-list">
          {projects.map((project) => (
            <div
              key={project.id}
              className="project-card"
              role="button"
              tabIndex={0}
              onClick={() => !loading && void openProject(project.id)}
              onKeyDown={(event) => event.key === 'Enter' && !loading && void openProject(project.id)}
            >
              <div className="project-cover">{project.title.slice(0, 1)}</div>
              <div className="project-card-main">
                <h3>{project.title}</h3>
                <div className="meta">
                  {project.author && <span>{project.author}</span>}
                  <span>{formatNumber(project.wordCount)} 字</span>
                  <span>更新于 {formatDate(project.updatedAt)}</span>
                </div>
                {project.description && <div className="desc">{project.description}</div>}
              </div>
              <div className="project-card-actions">
                <button
                  className="top-icon"
                  title="删除作品"
                  onClick={(event) => {
                    event.stopPropagation()
                    setDeleteId(project.id)
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="picker-foot">
          <span className="row gap-6">
            <Cloud size={13} />
            {native
              ? '数据保存在这台设备，卸载前请先导出备份'
              : network?.dataRoot
                ? `数据保存在本机：${network.dataRoot}`
                : '数据保存在本机，自动备份'}
          </span>
          <span className="row gap-6">
            <Settings2 size={13} /> 织章 v1.0 · 本地优先
          </span>
        </div>
      </div>

      <Modal
        open={createOpen}
        title="新建作品"
        onClose={closeCreate}
        icon={<BookOpen size={17} />}
        footer={
          <>
            <button className="btn btn-ghost" onClick={closeCreate}>
              取消
            </button>
            <button className="btn btn-primary" onClick={() => void submit()} disabled={!title.trim() || submitting}>
              {submitting ? '创建中…' : '开始创作'}
            </button>
          </>
        }
      >
        <div className="new-project-form">
          <div className="cover-preview">
            <div className="project-cover" style={{ width: 40, height: 52, fontSize: 18 }}>
              {title.slice(0, 1) || '书'}
            </div>
            <div>
              新作品会自动创建第一卷、第一章、总纲、卷大纲、章纲与主线事件线。
              <br />
              之后可以随时调整分卷与结构。
            </div>
          </div>
          <Field label="作品名称">
            <input
              className="input"
              autoFocus
              value={title}
              placeholder="给故事起一个名字"
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && void submit()}
            />
          </Field>
          <div className="new-project-row">
            <Field label="作者">
              <input className="input" value={author} onChange={(event) => setAuthor(event.target.value)} />
            </Field>
            <Field label="一句话简介">
              <input className="input" value={description} onChange={(event) => setDescription(event.target.value)} />
            </Field>
          </div>
        </div>
      </Modal>

      <Modal
        open={syncOpen}
        title="WebDAV 同步 / 恢复"
        onClose={() => setSyncOpen(false)}
        icon={<Cloud size={17} />}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setSyncOpen(false)}>
              关闭
            </button>
            <button className="btn" disabled={syncBusy !== null} onClick={() => void runSync('test')}>
              测试连接
            </button>
            <button className="btn btn-primary" disabled={syncBusy !== null} onClick={() => void runSync('run')}>
              {syncBusy === 'run' ? '同步中…' : '立即同步'}
            </button>
          </>
        }
      >
        <div className="col gap-10">
          <div className="small muted" style={{ lineHeight: 1.7 }}>
            填写你在电脑端使用的同一个 WebDAV 与远程目录，同步后即可把电脑上的作品拉到这台设备；本机更新的作品也会上传回去。
          </div>
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
                onChange={(event) => setSyncForm({ ...syncForm, password: event.target.value })}
              />
            </Field>
          </div>
          {syncStatus && <div className="hint-box small">{syncStatus}</div>}
        </div>
      </Modal>

      <Confirm
        open={Boolean(deleteId)}
        title="删除作品"
        message={
          native
            ? '删除后作品将从这台设备移除，无法恢复。确定继续吗？'
            : '删除后作品会被移到数据目录的回收站（trash）中，可在电脑上找回。确定继续吗？'
        }
        confirmText="删除作品"
        onConfirm={() => {
          if (deleteId) void deleteProject(deleteId)
          setDeleteId(null)
        }}
        onClose={() => setDeleteId(null)}
      />
    </div>
  )
}
