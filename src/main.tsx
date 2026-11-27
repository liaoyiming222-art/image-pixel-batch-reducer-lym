import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import AnalyticsAdmin from './AnalyticsAdmin'
import { initializeAnalytics } from './analytics'
import './styles.css'
import './folder-upload.css'

initializeAnalytics()
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{location.pathname.startsWith('/admin') ? <AnalyticsAdmin /> : <App />}</React.StrictMode>,
)
