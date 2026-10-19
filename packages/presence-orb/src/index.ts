import {shaderRendererGPU, createGpuUniformsMap, rootPassthrough} from 'shaders-core'
import {createPresenceOrbDefinition} from 'shaders-core/PresenceOrb'
import {DEFAULT_CAPACITY, MAX_ATTRACTORS, normalizeAttractors, validateCapacity} from './model.js'
import type {Attractor, PositionedAttractor} from './model.js'
import styles from './style.css?inline'
export {DEFAULT_CAPACITY, MAX_ATTRACTORS}
export type {Attractor, PositionedAttractor}

export interface PresenceOrbOptions {
    /** The heading above the orb. It never creates a stream or consumes a slot. */
    label: string
    attractors?: readonly Attractor[]
    /** Explicit simultaneous-stream budget, 1–32; default 16. */
    capacity?: number
    energy?: number
    formation?: number
    speed?: number
    paused?: boolean
    draggable?: boolean
    removable?: boolean
    respectReducedMotion?: boolean
    onSelect?: (attractor: PositionedAttractor) => void
    onAttractorsChange?: (attractors: PositionedAttractor[]) => void
    onError?: (reason: string) => void
}
export interface PresenceOrbInstance {
    readonly element: HTMLElement
    readonly ready: Promise<void>
    setLabel(label: string): void
    setAttractors(items: readonly Attractor[]): void
    addAttractor(item: Attractor): void
    updateAttractor(id: string, update: Partial<Omit<Attractor, 'id'>>): void
    removeAttractor(id: string): void
    getAttractors(): PositionedAttractor[]
    setAppearance(values: Partial<Pick<PresenceOrbOptions, 'energy' | 'formation' | 'speed'>>): void
    pause(): void
    resume(): void
    retry(): Promise<void>
    destroy(): void
}
function numeric(name: string, value: number, max = 1): number {
    if (!Number.isFinite(value) || value < 0 || value > max) throw new RangeError(`${name} must be between 0 and ${max}`)
    return value
}
function checkedLabel(value: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError('The orb label must be nonempty text')
    return value
}

/** Mount one self-contained, accessible scene. No telemetry, external assets or network requests. */
export function createPresenceOrb(host: HTMLElement, options: PresenceOrbOptions): PresenceOrbInstance {
    const capacity = validateCapacity(options.capacity ?? DEFAULT_CAPACITY)
    let labelText = checkedLabel(options.label)
    let items = normalizeAttractors(options.attractors ?? [], capacity)
    const appearance = {energy: numeric('energy', options.energy ?? .7), formation: numeric('formation', options.formation ?? 1), speed: numeric('speed', options.speed ?? 1, 3)}
    let disposed = false, paused = options.paused ?? false, inView = true, generation = 0
    let renderer: ReturnType<typeof shaderRendererGPU> | null = null
    let initialized = false, failed = false
    const element = document.createElement('section')
    element.className = 'presence-orb'
    element.setAttribute('aria-label', labelText)
    const shadow = element.attachShadow({mode: 'open'})
    const style = document.createElement('style'); style.textContent = styles
    const scene = document.createElement('div'); scene.className = 'scene'; scene.setAttribute('part', 'scene')
    const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true'); canvas.style.width = '100%'; canvas.style.height = '100%'
    const label = document.createElement('h2'); label.className = 'label'; label.setAttribute('part', 'label'); label.textContent = labelText
    const controls = document.createElement('div'); controls.className = 'attractors'; controls.setAttribute('aria-label', 'Attractors')
    const status = document.createElement('p'); status.className = 'status'; status.setAttribute('role', 'status'); status.textContent = 'Starting orb…'
    scene.append(canvas, label, controls, status); shadow.append(style, scene); host.append(element)
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const buttons = new Map<string, {container: HTMLElement; button: HTMLButtonElement; remove: HTMLButtonElement}>()
    const uniformValues = new Map<string, unknown>()
    const snapshot = () => items.map(item => ({...item}))
    const emit = () => options.onAttractorsChange?.(snapshot())
    const assertAlive = () => {if (disposed) throw new Error('PresenceOrb was destroyed')}
    function write(name: string, value: unknown) {
        if (!initialized || !renderer) return
        const previous = uniformValues.get(name)
        const vector = typeof value === 'object' && value !== null
        if (vector ? (previous as any)?.x === (value as any).x && (previous as any)?.y === (value as any).y : previous === value) return
        uniformValues.set(name, vector ? {...value as object} : value)
        renderer.updateUniformValue('orb', name, value)
    }
    function syncAnimation() {
        if (!initialized || !renderer || failed) return
        const reduced = options.respectReducedMotion !== false && media.matches
        write('speed', paused || reduced ? 0 : appearance.speed)
        if (paused || reduced || document.hidden || !inView || appearance.speed === 0) renderer.stopAnimation()
        else renderer.startAnimation()
    }
    function syncUniforms() {
        write('attractorCount', items.length)
        items.forEach((item, index) => {
            write(`target${index}`, {x: item.x, y: item.y})
            write(`strength${index}`, item.strength)
            write(`light${index}`, item.light)
        })
        write('energy', appearance.energy); write('formation', appearance.formation)
        syncAnimation()
    }
    function move(id: string, x: number, y: number) {
        const index = items.findIndex(item => item.id === id)
        if (index < 0) return
        items[index] = {...items[index], x: Math.max(.04, Math.min(.96, x)), y: Math.max(.2, Math.min(.94, y))}
        renderControls(); syncUniforms(); emit()
    }
    function makeControl(id: string) {
        const container = document.createElement('div'); container.className = 'attractor'; container.dataset.attractorId = id; container.setAttribute('part', 'attractor')
        const button = document.createElement('button'); button.type = 'button'; button.className = 'target'; button.setAttribute('part', 'target')
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove'; remove.textContent = '×'; remove.setAttribute('part', 'remove')
        remove.hidden = options.removable === false
        remove.onclick = () => {api.removeAttractor(id); emit()}
        let drag: {x: number; y: number; offsetX: number; offsetY: number; moved: boolean} | null = null
        let suppressClick = false
        button.onpointerdown = event => {
            if (options.draggable === false || event.button !== 0) return
            const item = items.find(item => item.id === id)!
            const bounds = scene.getBoundingClientRect()
            drag = {x: event.clientX, y: event.clientY, offsetX: event.clientX - bounds.left - item.x * bounds.width, offsetY: event.clientY - bounds.top - item.y * bounds.height, moved: false}
            suppressClick = false
            button.setPointerCapture(event.pointerId)
        }
        button.onpointermove = event => {
            if (!drag) return
            if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 3 && !drag.moved) return
            drag.moved = true
            const bounds = scene.getBoundingClientRect()
            move(id, (event.clientX - bounds.left - drag.offsetX) / bounds.width, (event.clientY - bounds.top - drag.offsetY) / bounds.height)
        }
        button.onpointerup = event => {
            suppressClick = drag?.moved ?? false; drag = null
            if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId)
        }
        button.onpointercancel = () => {drag = null; suppressClick = true}
        button.onclick = () => {if (suppressClick) {suppressClick = false; return}; const item = items.find(item => item.id === id); if (item) options.onSelect?.({...item})}
        button.onkeydown = event => {
            const item = items.find(item => item.id === id)
            if (!item || options.draggable === false) return
            const delta = event.shiftKey ? .05 : .01
            const axes: Record<string, [number, number]> = {ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta]}
            if (axes[event.key]) {event.preventDefault(); move(id, item.x + axes[event.key][0], item.y + axes[event.key][1])}
        }
        container.append(button, remove); controls.append(container)
        const control = {container, button, remove}; buttons.set(id, control); return control
    }
    function renderControls() {
        const active = new Set(items.map(item => item.id))
        for (const [id, control] of buttons) if (!active.has(id)) {control.container.remove(); buttons.delete(id)}
        for (const [index, item] of items.entries()) {
            const control = buttons.get(item.id) ?? makeControl(item.id)
            if (controls.children[index] !== control.container) controls.insertBefore(control.container, controls.children[index] ?? null)
            control.button.textContent = item.label
            control.button.title = item.label
            control.button.setAttribute('aria-label', item.label)
            control.button.setAttribute('aria-description', options.draggable === false ? 'Select attractor' : 'Drag or use arrow keys to move; activate to select')
            control.remove.setAttribute('aria-label', `Remove ${item.label}`)
            control.container.style.left = `${item.x * 100}%`; control.container.style.top = `${item.y * 100}%`
        }
        element.dataset.attractorCount = String(items.length)
    }
    function failure(reason: string) {
        if (disposed || failed) return
        failed = true; renderer?.stopAnimation(); element.dataset.state = 'unavailable'
        status.hidden = false; status.textContent = `Orb rendering unavailable: ${reason}`
        options.onError?.(reason)
    }
    async function start() {
        const attempt = ++generation
        initialized = false; failed = false; uniformValues.clear()
        renderer?.cleanup()
        const next = shaderRendererGPU(); renderer = next
        element.dataset.state = 'loading'; status.hidden = false; status.textContent = 'Starting orb…'
        next.setOnUnavailable(reason => {if (attempt === generation) failure(reason)})
        try {
            await next.initialize({canvas})
            if (disposed || attempt !== generation) {next.cleanup(); return}
            if (next.getFailureReason()) throw new Error(next.getFailureReason()!)
            const definition = createPresenceOrbDefinition(capacity)
            const props = Object.fromEntries(Object.entries(definition.props).map(([key, config]) => [key, config.default]))
            Object.assign(props, {center: {x: .5, y: .55}, radius: .16, ...appearance, speed: 0})
            const metadata = {blendMode: 'normal' as const, opacity: 1, renderOrder: 0}
            next.registerNode('root', rootPassthrough.fragment, null, metadata, {}, rootPassthrough)
            next.registerNode('orb', definition.fragment, 'root', metadata, createGpuUniformsMap(definition, props, 'orb'), definition)
            initialized = true; syncUniforms()
            await next.renderAndWait()
            if (disposed || attempt !== generation) return
            if (next.getFailureReason()) throw new Error(next.getFailureReason()!)
            element.dataset.state = 'ready'; status.hidden = true; syncAnimation()
        } catch (error) {
            if (disposed || attempt !== generation) return
            failure(error instanceof Error ? error.message : String(error))
        }
    }
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
        inView = entries[0]?.isIntersecting ?? true; syncAnimation()
    })
    observer?.observe(element)
    media.addEventListener('change', syncAnimation)
    document.addEventListener('visibilitychange', syncAnimation)
    let ready: Promise<void>
    const api: PresenceOrbInstance = {
        element, get ready() {return ready},
        setLabel(value) {assertAlive(); labelText = checkedLabel(value); label.textContent = labelText; element.setAttribute('aria-label', labelText)},
        setAttractors(value) {assertAlive(); const next = normalizeAttractors(value, capacity); items = next; renderControls(); syncUniforms()},
        addAttractor(item) {api.setAttractors([...items, item])},
        updateAttractor(id, update) {assertAlive(); if (!items.some(item => item.id === id)) throw new Error(`Unknown attractor: ${id}`); api.setAttractors(items.map(item => item.id === id ? {...item, ...update, id} : item))},
        removeAttractor(id) {api.setAttractors(items.filter(item => item.id !== id))},
        getAttractors() {return snapshot()},
        setAppearance(values) {
            assertAlive()
            const next = {...appearance}
            for (const key of ['energy', 'formation', 'speed'] as const) if (values[key] !== undefined) next[key] = numeric(key, values[key]!, key === 'speed' ? 3 : 1)
            Object.assign(appearance, next); syncUniforms()
        },
        pause() {assertAlive(); paused = true; syncAnimation()},
        resume() {assertAlive(); paused = false; syncAnimation()},
        retry() {assertAlive(); return start()},
        destroy() {
            if (disposed) return
            disposed = true; generation++; observer?.disconnect(); media.removeEventListener('change', syncAnimation)
            document.removeEventListener('visibilitychange', syncAnimation); renderer?.cleanup(); renderer = null
            buttons.clear(); element.remove()
        },
    }
    renderControls(); ready = start()
    return api
}
