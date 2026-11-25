import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled, so the app looks the same offline (PLAN.md D3).
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/fraunces/full-italic.css'
import '@fontsource-variable/instrument-sans/index.css'
import '@fontsource-variable/jetbrains-mono/index.css'
import '@fontsource-variable/bricolage-grotesque/standard.css'
import './index.css'
import App from './App.tsx'
import { startBloom } from './lib/bloom'
import { startScrolling } from './lib/scroll'

startScrolling()
startBloom()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
