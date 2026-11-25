import type { ReactNode } from 'react'

const paths = {
  mark: 'M12 2 3 20h18L12 2Zm0 6v14m0-7-4 3m4-6 4 3',
  sword: 'm4 20 5-5m-3-3 6 6m-4-4 9-10 4-1-1 4-10 9M3 21l2-2',
  cleave: 'M3 18c7 2 14-3 17-9M5 13c5 0 9-3 11-8m0 0 4-2-1 5',
  pack: 'M8 7V5a4 4 0 0 1 8 0v2M6 9l-2 3v9h16v-9l-2-3H6Zm-2 5h16m-8-2v4',
  talent: 'M12 2v20m0-15L6 3m6 9 6-5m-6 10-6-4m6 6 6-4M4 2l2 1-1 2m15 0-2 2 2 1',
  controls: 'M9 8a3 3 0 1 1 4 2.8c-.7.3-1 .8-1 1.7v1.2m0 3v.4M12 2a10 10 0 1 0 .1 0Z',
  close: 'm6 6 12 12M18 6 6 18',
  arrow: 'M4 12h16m-7-6 7 6-7 6',
  chevron: 'm9 6 6 6-6 6',
  heart: 'M12 20 4.5 12.8C-.8 7.4 6.9 1.7 12 8c5.1-6.3 12.8-.6 7.5 4.8L12 20Z',
  pickup: 'm12 3 7 8-7 8-7-8 7-8Zm-9 16h18',
  shield: 'M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6l-8-3Z',
  spark: 'm13 2-7 11h5l-1 9 8-12h-5l1-8Z',
  head: 'M5 19V9a7 7 0 0 1 14 0v10h-5v-6h-4v6H5Zm0-9h14m-7-7v7',
  chest: 'm8 4-5 4 1 6 3-2v9h10v-9l3 2 1-6-5-4-4 3-4-3Z',
  hands: 'M7 19 4 13l2-2 3 3V6a1 1 0 0 1 2 0v4-6a1 1 0 0 1 2 0v6-5a1 1 0 0 1 2 0v6-3a1 1 0 0 1 2 0v7l-3 4H7Z',
  feet: 'M9 3h7v11l4 3v4H5v-5l4-3V3Zm0 6h7m-7 4h7M5 18h15',
  accessory: 'm12 3 4 4-4 4-4-4 4-4Zm-4 7a6 6 0 1 0 8 0',
  coin: 'M12 3a9 9 0 1 0 .1 0ZM12 7l4 5-4 5-4-5 4-5Z',
  check: 'm5 12 5 5 9-10',
  lock: 'M5 10h14v11H5V10Zm3 0V7a4 4 0 0 1 8 0v3m-4 4v3',
  camp: 'M2 20h20M4 19 12 4l8 15M8 19l4-7 4 7M12 4V2',
  warning: 'M12 3 2 21h20L12 3Zm0 6v5m0 3v.2',
} as const

export type IconName = keyof typeof paths

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}

export function Key({ children }: { children: ReactNode }) {
  return <kbd className="eo-key">{children}</kbd>
}

export function Meter({ label, value, max, className = '' }: { label: string; value: number; max: number; className?: string }) {
  const maximum = Math.max(1, max)
  const current = Math.min(Math.max(0, value), maximum)
  return <div className={`eo-meter ${className}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={Math.round(current)}><div style={{ width: `${100 * current / maximum}%` }} /></div>
}
