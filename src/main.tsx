import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import 'react-easy-crop/react-easy-crop.css'
import './styles.css'

const root = ReactDOM.createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

const splash = document.getElementById('splash')
if (splash) {
  splash.addEventListener('transitionend', () => splash.remove(), { once: true })
  // Small delay so the first React paint is visible before we hide splash
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      splash.classList.add('hiding')
    })
  })
}