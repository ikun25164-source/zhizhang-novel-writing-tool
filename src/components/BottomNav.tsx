import { useApp } from '../store'
import { cx } from '../lib/utils'
import { VIEWS } from './TopBar'

export default function BottomNav() {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)

  return (
    <nav className="bottom-nav">
      {VIEWS.map((item) => (
        <button
          key={item.key}
          className={cx('bottom-btn', view === item.key && 'active')}
          data-nav-switch
          onClick={() => setView(item.key)}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
