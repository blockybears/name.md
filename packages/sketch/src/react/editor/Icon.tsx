import type { SVGProps } from 'react'

export type IconName =
  | 'select'
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'arrow'
  | 'line'
  | 'freedraw'
  | 'text'
  | 'fill-none'
  | 'fill-hachure'
  | 'fill-solid'
  | 'width-thin'
  | 'width-medium'
  | 'width-bold'
  | 'dash-solid'
  | 'dash-dashed'
  | 'dash-dotted'
  | 'style-clean'
  | 'style-soft'
  | 'style-sketchy'
  | 'edge-sharp'
  | 'edge-round'
  | 'head-none'
  | 'head-arrow'
  | 'head-triangle'
  | 'head-dot'
  | 'layer-front'
  | 'layer-forward'
  | 'layer-backward'
  | 'layer-back'
  | 'duplicate'
  | 'delete'
  | 'zoom-in'
  | 'zoom-out'
  | 'fit'
  | 'undo'
  | 'redo'
  | 'diagram'
  | 'set-view'
  | 'code'
  | 'reshape'
  | 'snap'

// 24x24 viewBox, stroke = currentColor. Each entry returns the inner markup.
function paths(name: IconName) {
  switch (name) {
    case 'select':
      return <path d="M5 3l6 16 2-6 6-2z" fill="currentColor" stroke="none" />
    case 'rectangle':
      return <rect x="4" y="6" width="16" height="12" rx="2" />
    case 'ellipse':
      return <ellipse cx="12" cy="12" rx="8" ry="6" />
    case 'diamond':
      return <path d="M12 4l8 8-8 8-8-8z" />
    case 'arrow':
      return (
        <>
          <path d="M4 12h14" />
          <path d="M13 7l5 5-5 5" />
        </>
      )
    case 'line':
      return <path d="M5 19L19 5" />
    case 'freedraw':
      return <path d="M4 18c3 0 3-8 6-8s3 6 6 4 0-7 4-7" />
    case 'text':
      return (
        <>
          <path d="M6 6h12" />
          <path d="M12 6v12" />
        </>
      )
    case 'fill-none':
      return (
        <>
          <rect x="5" y="5" width="14" height="14" rx="2" />
          <path d="M6 18L18 6" />
        </>
      )
    case 'fill-hachure':
      return (
        <>
          <rect x="5" y="5" width="14" height="14" rx="2" />
          <path d="M7 13l6-6M9 17l8-8M13 17l4-4" strokeWidth="1.2" />
        </>
      )
    case 'fill-solid':
      return <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" />
    case 'width-thin':
      return <path d="M4 12h16" strokeWidth="1" />
    case 'width-medium':
      return <path d="M4 12h16" strokeWidth="2.4" />
    case 'width-bold':
      return <path d="M4 12h16" strokeWidth="4" />
    case 'dash-solid':
      return <path d="M4 12h16" />
    case 'dash-dashed':
      return <path d="M4 12h4M11 12h4M18 12h2" />
    case 'dash-dotted':
      return <path d="M5 12h.5M9 12h.5M13 12h.5M17 12h.5" strokeWidth="2.2" strokeLinecap="round" />
    case 'style-clean':
      return <path d="M5 8h14M5 12h14M5 16h14" strokeWidth="1.4" />
    case 'style-soft':
      return <path d="M5 8q3.5 1 7 0t7 0M5 13q3.5 1 7 0t7 0" strokeWidth="1.4" />
    case 'style-sketchy':
      return <path d="M5 8q2 2 4 0t4 0 4 0M5 13q2 2 4 0t4 0 4 0M5 18q2 2 4 0t4 0 4 0" strokeWidth="1.4" />
    case 'edge-sharp':
      return <path d="M6 18V8a2 2 0 0 1 2-2h10" />
    case 'edge-round':
      return <path d="M6 18V12a6 6 0 0 1 6-6h6" />
    case 'head-none':
      return <path d="M4 12h16" />
    case 'head-arrow':
      return (
        <>
          <path d="M4 12h14" />
          <path d="M13 7l5 5-5 5" />
        </>
      )
    case 'head-triangle':
      return (
        <>
          <path d="M4 12h11" />
          <path d="M14 7l6 5-6 5z" fill="currentColor" />
        </>
      )
    case 'head-dot':
      return (
        <>
          <path d="M4 12h11" />
          <circle cx="17" cy="12" r="3" fill="currentColor" />
        </>
      )
    case 'layer-front':
      return (
        <>
          <rect x="7" y="7" width="11" height="11" rx="1.5" fill="currentColor" stroke="none" opacity="0.5" />
          <rect x="4" y="4" width="9" height="9" rx="1.5" fill="currentColor" />
        </>
      )
    case 'layer-back':
      return (
        <>
          <rect x="4" y="4" width="9" height="9" rx="1.5" fill="currentColor" stroke="none" opacity="0.5" />
          <rect x="7" y="7" width="11" height="11" rx="1.5" fill="currentColor" />
        </>
      )
    case 'layer-forward':
      return (
        <>
          <rect x="6" y="6" width="12" height="12" rx="1.5" />
          <path d="M12 14V9M9.5 11.5L12 9l2.5 2.5" />
        </>
      )
    case 'layer-backward':
      return (
        <>
          <rect x="6" y="6" width="12" height="12" rx="1.5" />
          <path d="M12 9v5M9.5 11.5L12 14l2.5-2.5" />
        </>
      )
    case 'duplicate':
      return (
        <>
          <rect x="8" y="8" width="11" height="11" rx="2" />
          <path d="M5 15V6a1 1 0 0 1 1-1h9" />
        </>
      )
    case 'delete':
      return (
        <>
          <path d="M5 7h14" />
          <path d="M9 7V5h6v2" />
          <path d="M7 7l1 12h8l1-12" />
        </>
      )
    case 'zoom-in':
      return <path d="M12 6v12M6 12h12" />
    case 'zoom-out':
      return <path d="M6 12h12" />
    case 'fit':
      return <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    case 'undo':
      return (
        <>
          <path d="M9 7L4 12l5 5" />
          <path d="M4 12h11a5 5 0 0 1 0 10h-2" />
        </>
      )
    case 'redo':
      return (
        <>
          <path d="M15 7l5 5-5 5" />
          <path d="M20 12H9a5 5 0 0 0 0 10h2" />
        </>
      )
    case 'diagram':
      return (
        <>
          <rect x="4" y="4" width="7" height="5" rx="1" />
          <rect x="13" y="15" width="7" height="5" rx="1" />
          <path d="M7.5 9v4a2 2 0 0 0 2 2h3.5" />
        </>
      )
    case 'set-view':
      return (
        <>
          <ellipse cx="12" cy="12" rx="9" ry="5.5" />
          <circle cx="12" cy="12" r="2.2" fill="currentColor" />
        </>
      )
    case 'code':
      return <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />
    case 'snap':
      return (
        <>
          <path d="M7 4v7a5 5 0 0 0 10 0V4" />
          <path d="M5 4h4M15 4h4" />
        </>
      )
    case 'reshape':
      return (
        <>
          <path d="M6 18l6-12 6 12z" />
          <rect x="4.5" y="16.5" width="3" height="3" fill="currentColor" stroke="none" />
          <rect x="16.5" y="16.5" width="3" height="3" fill="currentColor" stroke="none" />
          <rect x="10.5" y="4.5" width="3" height="3" fill="currentColor" stroke="none" />
        </>
      )
  }
}

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 18, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {paths(name)}
    </svg>
  )
}
