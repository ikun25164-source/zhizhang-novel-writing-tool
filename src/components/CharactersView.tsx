import { useMemo, useState } from 'react'
import { Plus, Search, UserRound, Users } from 'lucide-react'
import { useApp } from '../store'
import { isNavActivation } from '../lib/arrowNav'
import { cx, mediaUrl } from '../lib/utils'
import { CharacterDetail } from './details'
import PanelEdge from './PanelEdge'
import { Empty } from './ui'

export default function CharactersView() {
  const characters = useApp((s) => s.characters)
  const selectedCharacterId = useApp((s) => s.selectedCharacterId)
  const selectCharacter = useApp((s) => s.selectCharacter)
  const addCharacter = useApp((s) => s.addCharacter)
  const mobileSheet = useApp((s) => s.mobileSheet)
  const leftOpen = useApp((s) => s.leftOpen)
  const setMobileSheet = useApp((s) => s.setMobileSheet)
  const [query, setQuery] = useState('')

  const selected = characters.find((character) => character.id === selectedCharacterId) || characters[0] || null

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return characters
    return characters.filter((character) =>
      `${character.name} ${character.aliases.join(' ')} ${character.role} ${character.identity} ${character.tags.join(' ')}`
        .toLowerCase()
        .includes(keyword),
    )
  }, [characters, query])

  const pick = (id: string) => {
    selectCharacter(id)
    if (!isNavActivation()) setMobileSheet('none')
  }

  return (
    <div className="view-root">
      <aside
        className={cx(
          'side-panel left-panel',
          !leftOpen && 'is-collapsed',
          mobileSheet === 'left' && 'mobile-open',
        )}
      >
        <div className="panel-head">
          <div className="panel-title">
            <Users size={14} /> 人物栏
          </div>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => {
              const id = addCharacter()
              if (id) {
                selectCharacter(id)
                setMobileSheet('none')
              }
            }}
          >
            <Plus size={13} /> 人物
          </button>
        </div>
        <div style={{ padding: '8px 10px 4px' }}>
          <div className="search-box">
            <Search size={13} />
            <input
              value={query}
              placeholder="搜索姓名、身份、标签"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <div className="panel-body flush scroll-thin">
          <div className="char-list">
            {filtered.map((character) => (
              <button
                key={character.id}
                className={cx('char-row', selected?.id === character.id && 'active')}
                data-nav-switch
                onClick={() => pick(character.id)}
              >
                <span className="char-avatar">
                  {character.avatar ? <img src={mediaUrl(character.avatar)} alt="" /> : character.name.slice(0, 1) || <UserRound size={16} />}
                </span>
                <span className="char-name-box">
                  <b>{character.name}</b>
                  <span>{[character.role, character.faction].filter(Boolean).join(' · ') || character.identity || '尚未填写设定'}</span>
                </span>
                {character.relationships?.length > 0 && <span className="badge">{character.relationships.length}</span>}
              </button>
            ))}
            {filtered.length === 0 && (
              <Empty icon={<Users size={22} />}>
                {characters.length === 0 ? '还没有人物，点击右上角新建。' : '没有匹配的人物'}
              </Empty>
            )}
          </div>
        </div>
        <div className="panel-foot">
          <div className="spread small muted">
            <span>{characters.length} 位人物</span>
            <span>{characters.filter((character) => character.role).length} 位已定位</span>
          </div>
        </div>
      </aside>
      <PanelEdge side="left" label="人物栏" />

      <main className="center-pane">
        <div className="center-scroll scroll-thin">
          {selected ? (
            <CharacterDetail key={selected.id} id={selected.id} />
          ) : (
            <Empty
              icon={<Users size={30} />}
              title="建立你的人物阵容"
              action={
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const id = addCharacter()
                    if (id) selectCharacter(id)
                  }}
                >
                  <Plus size={14} /> 新建人物
                </button>
              }
            >
              人物会自动与正文中出现的姓名、事件、纲目和地点关联。
            </Empty>
          )}
        </div>
      </main>
    </div>
  )
}
