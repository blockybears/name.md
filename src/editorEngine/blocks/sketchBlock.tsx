/* eslint-disable react-refresh/only-export-components --
   Block-renderer module (mounted imperatively by a CM6 widget). */
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { parseScene, serializeScene, type Scene } from '@namemd/sketch'
import { registerBlock } from './registry'
import { replaceBlock, type ReactBlockRenderArgs } from './reactWidget'

// The interactive canvas code-splits out of the main bundle (as in the TipTap
// integration); the block shows a light placeholder while it loads.
const SketchCanvas = lazy(() => import('@namemd/sketch/react/canvas').then((mod) => ({ default: mod.SketchCanvas })))

function isEmptyScene(scene: Scene): boolean {
  return scene.elements.length === 0 && (scene.diagrams?.length ?? 0) === 0
}

function SketchBlock({ view, pos, source }: ReactBlockRenderArgs) {
  // Uncontrolled: parse the scene once, then own it locally so doc write-backs
  // (which rebuild this widget) never reset the canvas mid-interaction.
  const [scene, setScene] = useState<Scene>(() => parseScene(source))
  const writeTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(writeTimer.current), [])

  const onChange = useCallback(
    (next: Scene) => {
      setScene(next)
      window.clearTimeout(writeTimer.current)
      writeTimer.current = window.setTimeout(() => replaceBlock(view, pos, '```sketch\n' + serializeScene(next) + '\n```'), 400)
    },
    [view, pos],
  )

  return (
    <div className="sketch-drawing-block" contentEditable={false}>
      <div className="sketch-drawing-stage">
        <Suspense fallback={<div className="sketch-drawing-loading">Loading editor…</div>}>
          <SketchCanvas scene={scene} onChange={onChange} defaultMode={isEmptyScene(scene) ? 'edit' : 'read'} style={{ height: 420 }} />
        </Suspense>
      </div>
    </div>
  )
}

let registered = false
export function registerSketchBlock() {
  if (registered) return
  registered = true
  registerBlock('sketch', (args) => <SketchBlock {...args} />)
}
