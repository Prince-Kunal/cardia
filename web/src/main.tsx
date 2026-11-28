import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled, so the app looks the same offline (PLAN.md D3).
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/fraunces/full-italic.css'
import '@fontsource-variable/instrument-sans/index.css'
import '@fontsource-variable/jetbrains-mono/index.css'
import '@fontsource-variable/bricolage-grotesque/standard.css'
// The lab notebook look's type (looks/notebook.css); a browser fetches only the faces a page uses.
import '@fontsource-variable/source-serif-4/opsz.css'
import '@fontsource-variable/ibm-plex-sans/index.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './index.css'
import './looks/notebook.css'
import './looks/eggs.css'
import App from './App.tsx'
import { startBloom } from './lib/bloom'
import { startEggs } from './lib/eggs'
import { startLook } from './lib/look'
import { startScrolling } from './lib/scroll'

startLook()
startScrolling()
startBloom()
startEggs()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
