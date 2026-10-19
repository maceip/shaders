import {shaderRendererGPU, createGpuUniformsMap, rootPassthrough} from 'shaders-core'
import {createPresenceOrbDefinition} from 'shaders-core/PresenceOrb'
import {DEFAULT_CAPACITY, MAX_ATTRACTORS, beamProfile, normalizeAttractors, validateCapacity} from './model.js'
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
    const buttons = new Map<string, {container: HTMLElement; motion: HTMLElement; button: HTMLButtonElement; remove: HTMLButtonElement}>()
    const uniformValues = new Map<string, unknown>()
    // Only interacting controls get a short-lived host animation. Idle motion
    // stays on the GPU; positions and source records are never changed.
    const wobbles = new Map<string, {start: number; amplitude: number; response: number}>()
    let interactionFrame = 0
    const canAnimate = () => !disposed && initialized && !failed && !paused && !document.hidden && inView && appearance.speed > 0 && !(options.respectReducedMotion !== false && media.matches)
    function resetWobble(id: string) {
        const motion = buttons.get(id)?.motion
        if (motion) {motion.style.removeProperty('transform'); motion.style.removeProperty('filter')}
        const index = items.findIndex(item => item.id === id)
        if (index >= 0) write(`response${index}`, 0)
        wobbles.delete(id)
    }
    function stopInteractions() {
        cancelAnimationFrame(interactionFrame); interactionFrame = 0
        for (const id of wobbles.keys()) resetWobble(id)
    }
    function animateInteractions(now: number) {
        interactionFrame = 0
        if (!canAnimate()) {stopInteractions(); return}
        for (const [id, wobble] of wobbles) {
            const elapsed = (now - wobble.start) / 1000
            const index = items.findIndex(item => item.id === id)
            const motion = buttons.get(id)?.motion
            if (elapsed >= .9 || index < 0 || !motion) {resetWobble(id); continue}
            // A damped oscillation turns, compresses and relaxes around a fixed
            // center. Its signed displacement also modulates that stream only.
            const response = Math.sin(elapsed * 25) * Math.exp(-elapsed * 5) * wobble.amplitude
            wobble.response = response
            motion.style.transform = `rotate(${response * 7}deg) scale(${1 + response * .065},${1 - response * .045})`
            motion.style.filter = `brightness(${1 + Math.abs(response) * .18}) hue-rotate(${response * 7}deg)`
            write(`response${index}`, response)
        }
        if (wobbles.size) interactionFrame = requestAnimationFrame(animateInteractions)
    }
    function wobble(id: string, amplitude: number) {
        if (!canAnimate()) return
        wobbles.set(id, {start: performance.now(), amplitude, response: wobbles.get(id)?.response ?? 0})
        if (!interactionFrame) interactionFrame = requestAnimationFrame(animateInteractions)
    }
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
        if (!canAnimate()) stopInteractions()
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
            write(`response${index}`, wobbles.get(item.id)?.response ?? 0)
            for (const [name, value] of Object.entries(beamProfile(item.id))) write(`${name}${index}`, value)
        })
        write('energy', appearance.energy); write('formation', appearance.formation)
        syncAnimation()
    }
    function makeControl(id: string) {
        const container = document.createElement('div'); container.className = 'attractor'; container.dataset.attractorId = id; container.setAttribute('part', 'attractor')
        const motion = document.createElement('div'); motion.className = 'attractor-motion'; motion.setAttribute('part', 'attractor-motion')
        const button = document.createElement('button'); button.type = 'button'; button.className = 'target'; button.setAttribute('part', 'target')
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove'; remove.textContent = '×'; remove.setAttribute('part', 'remove')
        remove.hidden = options.removable === false
        remove.onclick = () => {api.removeAttractor(id); emit()}
        // The stable container is the hover hit area, avoiding enter/leave
        // retriggers as its child wobbles. Touch uses the native click event.
        container.onpointerenter = event => {if (event.pointerType !== 'touch' && event.target !== remove) wobble(id, .65)}
        button.onclick = () => {
            wobble(id, 1)
            const item = items.find(item => item.id === id)
            if (item) options.onSelect?.({...item})
        }
        motion.append(button, remove); container.append(motion); controls.append(container)
        const control = {container, motion, button, remove}; buttons.set(id, control); return control
    }
    function renderControls() {
        const active = new Set(items.map(item => item.id))
        for (const [id, control] of buttons) if (!active.has(id)) {resetWobble(id); control.container.remove(); buttons.delete(id)}
        for (const [index, item] of items.entries()) {
            const control = buttons.get(item.id) ?? makeControl(item.id)
            if (controls.children[index] !== control.container) controls.insertBefore(control.container, controls.children[index] ?? null)
            control.button.textContent = item.label
            control.button.title = item.label
            control.button.setAttribute('aria-label', item.label)
            control.button.setAttribute('aria-description', 'Hover or activate to wobble and respond; position is fixed')
            control.remove.setAttribute('aria-label', `Remove ${item.label}`)
            control.container.style.left = `${item.x * 100}%`; control.container.style.top = `${item.y * 100}%`
        }
        element.dataset.attractorCount = String(items.length)
    }
    function failure(reason: string) {
        if (disposed || failed) return
        failed = true; stopInteractions(); renderer?.stopAnimation(); element.dataset.state = 'unavailable'
        status.hidden = false; status.textContent = `Orb rendering unavailable: ${reason}`
        options.onError?.(reason)
    }
    async function start() {
        stopInteractions()
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
            stopInteractions(); disposed = true; generation++; observer?.disconnect(); media.removeEventListener('change', syncAnimation)
            document.removeEventListener('visibilitychange', syncAnimation); renderer?.cleanup(); renderer = null
            buttons.clear(); element.remove()
        },
    }
    renderControls(); ready = start()
    return api
}
