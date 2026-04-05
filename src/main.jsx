import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// StrictMode is intentionally removed — it mounts components twice in dev which
// breaks WebRTC (camera grabbed twice, socket connected twice, peers duplicated).
createRoot(document.getElementById('root')).render(<App />)
