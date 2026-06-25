import { useEffect, useState } from 'react'
import { createElement, createScene, literal, token, type DrawStyle, type Scene } from '../src'
import { SketchView } from '../src/react'
import { SketchCanvas } from '../src/react/SketchCanvas'

type Theme = 'light' | 'warm' | 'dark'

function sampleScene(style: DrawStyle) {
  const elements = [
    createElement({ type: 'rectangle', x: 40, y: 40, width: 170, height: 96, roundness: 14, fillStyle: 'solid', fill: token('surface') }, style),
    createElement({ type: 'ellipse', x: 280, y: 48, width: 150, height: 92, stroke: token('accent') }, style),
    createElement({ type: 'diamond', x: 110, y: 200, width: 150, height: 104 }, style),
    createElement({ type: 'arrow', x: 210, y: 88, width: 70, height: 0, points: [{ x: 0, y: 0 }, { x: 70, y: 0 }] }, style),
    createElement({ type: 'text', x: 44, y: 330, width: 360, height: 32, text: 'Sketch engine — read view', fontSize: 24 }, style),
    createElement({ type: 'rectangle', x: 320, y: 210, width: 130, height: 78, stroke: literal('#e11d48'), fillStyle: 'solid', fill: literal('#fecdd3') }, style),
  ]
  return createScene({ elements, defaultStyle: style })
}

export function Demo() {
  const [theme, setTheme] = useState<Theme>('light')
  const [mode, setMode] = useState<'read' | 'edit'>('edit')
  const [scene, setScene] = useState<Scene>(() => sampleScene('soft'))

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return (
    <div className="demo">
      <header>
        <h1>@namemd/sketch</h1>
        <div className="controls">
          {(['light', 'warm', 'dark'] as Theme[]).map((option) => (
            <button key={option} aria-pressed={theme === option} onClick={() => setTheme(option)}>
              {option}
            </button>
          ))}
          <button aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}>
            edit
          </button>
          <button aria-pressed={mode === 'read'} onClick={() => setMode('read')}>
            read
          </button>
        </div>
      </header>
      <div className="demo-card">
        {mode === 'edit' ? (
          <SketchCanvas scene={scene} onChange={setScene} onExit={() => setMode('read')} style={{ height: 480 }} />
        ) : (
          <SketchView scene={scene} className="sketch-read-view" />
        )}
      </div>
    </div>
  )
}
