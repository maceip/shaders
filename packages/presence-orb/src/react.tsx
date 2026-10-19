import {createElement, useEffect, useRef} from 'react'
import type {CSSProperties} from 'react'
import {createPresenceOrb} from './index.js'
import type {PresenceOrbInstance, PresenceOrbOptions} from './index.js'
export type {Attractor, PresenceOrbInstance, PresenceOrbOptions} from './index.js'
export interface PresenceOrbProps extends PresenceOrbOptions {className?: string; style?: CSSProperties}
/** Controlled React wrapper; the GPU scene is created only after mount (SSR-safe). */
export function PresenceOrb(props: PresenceOrbProps) {
    const host = useRef<HTMLDivElement>(null)
    const scene = useRef<PresenceOrbInstance | null>(null)
    const current = useRef(props); current.current = props
    useEffect(() => {
        if (!host.current) return
        const instance = createPresenceOrb(host.current, {...current.current,
            onSelect: item => current.current.onSelect?.(item),
            onAttractorsChange: items => current.current.onAttractorsChange?.(items),
            onError: reason => current.current.onError?.(reason),
        })
        scene.current = instance
        return () => {scene.current = null; instance.destroy()}
    }, [props.capacity, props.draggable, props.removable, props.respectReducedMotion])
    useEffect(() => {scene.current?.setLabel(props.label)}, [props.label])
    useEffect(() => {scene.current?.setAttractors(props.attractors ?? [])}, [props.attractors])
    useEffect(() => {scene.current?.setAppearance({energy: props.energy ?? .7, formation: props.formation ?? 1, speed: props.speed ?? 1})}, [props.energy, props.formation, props.speed])
    useEffect(() => {if (props.paused) scene.current?.pause(); else scene.current?.resume()}, [props.paused])
    return createElement('div', {ref: host, className: props.className, style: props.style})
}
