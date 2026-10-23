import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('缺少根节点 #root')
createRoot(container).render(<App />)
