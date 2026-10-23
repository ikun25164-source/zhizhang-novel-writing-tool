import { useState } from 'react'
import { AlertTriangle, ArrowRight, Cloud } from 'lucide-react'
import { useApp } from '../store'
import { cx, truncate } from '../lib/utils'
import TopBar from './TopBar'
import BottomNav from './BottomNav'
import WriteView from './WriteView'
import StructureView from './StructureView'
import TimelineView from './TimelineView'
import CharactersView from './CharactersView'
import MapsView from './MapsView'
import { PeekPanel, SearchDialog } from './overlays'
import SettingsDialog from './SettingsDialog'
import { Modal } from './ui'

export default function AppShell() {
  const view = useApp((s) => s.view)
  const mobileSheet = useApp((s) => s.mobileSheet)
  const setMobileSheet = useApp((s) => s.setMobileSheet)
  const notice = useApp((s) => s.notice)
  const conflict = useApp((s) => s.conflict)
  const contents = useApp((s) => s.contents)
  const resolveConflict = useApp((s) => s.resolveConflict)
  const [resolving, setResolving] = useState(false)

  const localText = conflict ? contents[conflict.chapterId]?.plainText || '' : ''

  return (
    <div className="app-shell">
      <TopBar />
      <div className="workspace">
        {view === 'write' && <WriteView />}
        {view === 'structure' && <StructureView />}
        {view === 'timeline' && <TimelineView />}
        {view === 'characters' && <CharactersView />}
        {view === 'maps' && <MapsView />}
      </div>
      <BottomNav />

      {mobileSheet !== 'none' && !(mobileSheet === 'right' && view === 'write') && (
        <div className="sheet-backdrop" onClick={() => setMobileSheet('none')} />
      )}

      <PeekPanel />
      <SearchDialog />
      <SettingsDialog />

      <Modal
        open={Boolean(conflict)}
        title="保存冲突"
        onClose={() => undefined}
        icon={<AlertTriangle size={17} color="var(--danger)" />}
        footer={
          <>
            <button
              className="btn"
              disabled={resolving}
              onClick={async () => {
                setResolving(true)
                await resolveConflict('server')
                setResolving(false)
              }}
            >
              使用其他设备的版本
            </button>
            <button
              className="btn btn-primary"
              disabled={resolving}
              onClick={async () => {
                setResolving(true)
                await resolveConflict('mine')
                setResolving(false)
              }}
            >
              保留我的并覆盖
            </button>
          </>
        }
        wide
      >
        <div className="col gap-10">
          <div className="hint-box">
            同一章节在其他设备上也被修改了。请选择保留哪个版本。为避免丢失内容，可以先复制需要保留的段落。
          </div>
          <div className="form-grid">
            <div>
              <div className="field-label" style={{ marginBottom: 5 }}>
                <Cloud size={12} /> 其他设备的版本
              </div>
              <div
                className="hint-box"
                style={{ maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap', color: 'var(--ink-2)' }}
              >
                {truncate(conflict?.server.plainText || '（空）', 600)}
              </div>
            </div>
            <div>
              <div className="field-label" style={{ marginBottom: 5 }}>
                <span className={cx('status-dot', 'draft')} /> 我当前的版本
              </div>
              <div
                className="hint-box"
                style={{ maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap', color: 'var(--ink-2)' }}
              >
                {truncate(localText || '（空）', 600)}
              </div>
            </div>
          </div>
          <div className="row gap-6 small muted">
            <ArrowRight size={13} />
            无论选择哪个，另一份内容都会保留在每日备份里，可请技术人员协助找回。
          </div>
        </div>
      </Modal>

      {notice && <div className="toast">{notice}</div>}
    </div>
  )
}
