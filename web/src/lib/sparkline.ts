// Build an SVG sparkline (polyline + filled area) from a numeric series.
// Returns null when there aren't enough points to draw a line.

export interface Sparkline {
  line: string
  area: string
  last: [number, number]
}

export function sparkline(series: number[], w = 300, h = 90): Sparkline | null {
  if (series.length < 2) return null
  const min = Math.min(...series)
  const max = Math.max(...series)
  const span = max - min || 1
  const step = w / (series.length - 1)
  const pts = series.map((v, i) => [
    Math.round(i * step),
    Math.round(h - 6 - ((v - min) / span) * (h - 16)),
  ]) as [number, number][]
  const line = pts.map((p) => p.join(',')).join(' ')
  const area = `M${pts[0][0]},${pts[0][1]} L${line.replace(/ /g, ' L')} L${w},${h} L0,${h} Z`
  return { line, area, last: pts[pts.length - 1] }
}
