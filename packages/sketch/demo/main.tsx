import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Demo } from './Demo'
import './theme.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
)
