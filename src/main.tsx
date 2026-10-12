import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import AnalyticsAdmin from './AnalyticsAdmin'
import { initializeAnalytics } from './analytics'
import './styles.css'
import './folder-upload.css'

if(location.hostname==='pixelfloweverybody.pages.dev'&&location.pathname.startsWith('/admin'))location.replace('https://pixelflow-image-tools.pages.dev/admin?site=pixelfloweverybody')
initializeAnalytics()
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{location.pathname.startsWith('/admin') ? <AnalyticsAdmin /> : <App />}</React.StrictMode>,
)
