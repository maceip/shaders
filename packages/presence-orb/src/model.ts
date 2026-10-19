export interface Attractor {
    /** Stable application identity. Labels are display text, never identity. */
    id: string
    label: string
    /** Normalized coordinates in the scene, with y increasing downward. */
    x?: number
    y?: number
    strength?: number
    light?: number
}
export interface PositionedAttractor extends Attractor {x: number; y: number; strength: number; light: number}
export const MAX_ATTRACTORS = 32
export const DEFAULT_CAPACITY = 16
export function validateCapacity(value: number): number {
    if (!Number.isInteger(value) || value < 1 || value > MAX_ATTRACTORS) throw new RangeError(`capacity must be 1–${MAX_ATTRACTORS}`)
    return value
}
export function normalizeAttractors(items: readonly Attractor[], capacity: number): PositionedAttractor[] {
    if (items.length > capacity) throw new RangeError(`Attractor capacity is ${capacity}; received ${items.length}. No items were dropped.`)
    const ids = new Set<string>()
    return items.map((item, index) => {
        if (!item || typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id)) throw new TypeError('Attractor IDs must be nonempty and unique')
        if (typeof item.label !== 'string' || !item.label.trim()) throw new TypeError('Every attractor needs a nonempty label')
        ids.add(item.id)
        const angle = (index / Math.max(items.length, 1)) * Math.PI * 2 - Math.PI / 4
        const x = item.x ?? .5 + Math.cos(angle) * .34
        const y = item.y ?? .55 + Math.sin(angle) * .31
        const strength = item.strength ?? 1, light = item.light ?? 1
        for (const [name, value] of Object.entries({x, y, strength, light})) {
            if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`${item.id}.${name} must be finite and between 0 and 1`)
        }
        return {...item, x, y, strength, light}
    })
}

/** Pseudorandom beam identity: independent of labels, array slots and wall time. */
export function beamProfile(id: string) {
    let state = 2166136261
    for (let i = 0; i < id.length; i++) state = Math.imul(state ^ id.charCodeAt(i), 16777619)
    const random = () => {
        state = (state + 0x6D2B79F5) | 0
        let value = Math.imul(state ^ state >>> 15, 1 | state)
        value ^= value + Math.imul(value ^ value >>> 7, 61 | value)
        return ((value ^ value >>> 14) >>> 0) / 4294967296
    }
    return {beamPhase: random() * Math.PI * 2, beamRate: .25 + random() * .35,
        beamWidth: .45 + random() * 1.2, beamBend: (random() * 2 - 1) * .35,
        beamCurl: .4 + random() * 1.2}
}
