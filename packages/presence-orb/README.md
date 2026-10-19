# @maceip/presence-orb

A continuously animated WebGPU orb with a separate heading and named, fixed-position
energy attractors. Vanilla JavaScript and React APIs, TypeScript declarations,
isolated styles, and the renderer are included. No sibling checkout, asset server,
GIF, telemetry, runtime CDN, or other package is needed by the vanilla entry.
React is an optional peer dependency for `/react` only.

```js
import {createPresenceOrb} from '@maceip/presence-orb'

const orb = createPresenceOrb(document.querySelector('#presence'), {
  label: 'Encounter evidence', // Heading only: never an attractor.
  attractors: [
    {id: 'http-17', label: 'HTTP contact', x: .2, y: .5},
    {id: 'mcp-22', label: 'MCP interaction', x: .8, y: .4},
  ],
  onSelect: record => openSourceRecord(record.id),
  onAttractorsChange: records => saveRemainingRecords(records),
  onError: reason => console.error(reason),
})
await orb.ready
orb.setLabel('Selected encounter')
orb.addAttractor({id: 'mail-4', label: 'SMTP message', x: .55, y: .85})
orb.updateAttractor('mail-4', {label: 'Retrieved message', strength: .8})
orb.removeAttractor('http-17')
// On route/unmount:
orb.destroy()
```

The heading is ordinary text above the orb. It cannot be dragged, removed as an
attractor, or counted as a stream. IDs identify records; changing a label never
changes identity. Labels use text nodes, so user-provided text is not HTML.

```tsx
import {PresenceOrb, type Attractor} from '@maceip/presence-orb/react'
import {useState} from 'react'

export function Encounter({title}: {title: string}) {
  const [records, setRecords] = useState<Attractor[]>([])
  return <PresenceOrb label={title} attractors={records}
    onAttractorsChange={setRecords} onSelect={record => console.log(record.id)} />
}
```

React mounts after hydration and cleans up on unmount, including Strict Mode.
Replace the controlled array to add, rename, move, reorder, or remove attractors.
Its change callback reports user removal. Programmatic
setters do not echo this callback, preventing update loops.

## Contract

- `label`: required, nonempty text. `setLabel()` updates it independently.
- `attractors`: array of `{id, label, x?, y?, strength?, light?}`. Coordinates are
  normalized 0–1, y downward. Omitted coordinates receive a circular layout.
  `strength` and `light` are 0–1 and default to 1. Stable IDs must be unique.
- `capacity`: simultaneous stream budget, default 16, explicitly configurable
  from 1 to 32 at creation. Exceeding it throws atomically; no silent truncation.
  This is not a 1,000-stream renderer. Large tables should pass the records the
  researcher is currently inspecting. Explicit positions suit dense layouts.
- `energy`, `formation`: 0–1; `speed`: 0–3. Set with `setAppearance()`.
- Attractors stay anchored. Hover triggers a brief damped wobble; click, tap,
  Enter or Space retriggers a stronger wobble and calls `onSelect`. The same
  displacement modulates that attractor's energy extraction and slightly shifts
  its stream color. The removal button wobbles with the object. Dragging and arrow keys do not reposition it. Layout changes
  are programmatic only (`x`/`y`). The short interaction loop stops when settled.
- Each beam has a pseudorandom profile seeded by its stable ID: independent
  particle births, speed, width, curvature and turbulence. Renaming or reordering
  records preserves their beam identity. Six GPU parcels per active beam keep
  the existing particle budget. Packets share a continuous curved streamline
  and overlap along it; random density does not introduce angular path joins.
- Attractor pill surfaces, rims and glow receive the incoming beam's current
  emission color in the same GPU pass. Their text remains readable and accessible
  in the DOM. Layout measurements update only on resize/label changes; there is
  no GPU readback or extra CPU color-animation loop. Zero strength/light gives a
  neutral surface. Pausing freezes both the beam and its label illumination.
- `removable`: default true; controls accessible removal.
- `paused`: initial state. `pause()`/`resume()` control animation. The component
  stops animating offscreen, in a hidden document, and for reduced-motion users.
  Set `respectReducedMotion: false` only if the application supplies its own policy.
- `ready`: settles after the initialization attempt. Check
  `element.dataset.state` (`loading`, `ready`, `unavailable`) or `onError`.
  WebGPU requires a secure context (HTTPS or localhost). Unsupported/device-loss
  states show an explicit message and stop animation; `retry()` explicitly
  attempts initialization again. No alternate visual is silently substituted.
- `setAttractors`, `addAttractor`, `updateAttractor`, `removeAttractor`,
  `getAttractors`: copied, validated data. Removing an unknown ID is harmless;
  updating one throws. `destroy()` is idempotent and cancels observers/listeners
  and releases scene resources, including during pending initialization.

Use a container with a real width. Default scene aspect ratio is 710/640. Styles
live in a shadow root, so dashboard button/reset styles cannot alter the scene.
Customize inherited CSS variables `--presence-background`, `--presence-text`,
`--presence-accent` (neutral loading/unavailable surface), `--presence-radius`, `--presence-aspect-ratio`, and
`--presence-font`, or `::part(label)`, `::part(target)`, `::part(remove)`.
The canvas follows the displayed size and device pixel ratio. Rendering quality
is not automatically degraded when attractors are added.

## Build and distribution

From the shaders repository: `pnpm install`, then `pnpm presence:build`.
Run `pnpm --filter @maceip/presence-orb test`, then run `pnpm pack
--pack-destination ../../artifacts/packages` from `packages/presence-orb`.
Install the resulting `.tgz` with npm/pnpm, or vendor the package contents and
import `dist/index.js` directly in a browser. No npm publication is required.

The GPU visual is the PresenceOrb program in the shared shader library. The
dynamic layout compiles that same program with a configurable slot capacity,
without duplicating the visual. The bundled general renderer currently brings
its catalog dependencies (about 890 KB gzip); the dashboard loads it lazily only
when the scene is opened. Upstream
renderer attribution is retained in LICENSE and THIRD_PARTY_NOTICES.md.
