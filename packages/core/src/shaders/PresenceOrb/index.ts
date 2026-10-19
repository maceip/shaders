import {defineShader} from '@coreroot/std/lower'
import {wgsl} from '@coreroot/std/wgsl'
import {transformPosition} from '@coreroot/utilities/transformations'
import type {GpuShaderDefinition} from '@coreroot/gpu/contract'

/**
 * Written for this library on 2026-10-19, after 05:40 UTC.
 * The visual program below is new code. It does not compose Blob, ThinFilm,
 * LightEdge, a preset, an image texture, or the earlier Outbox implementation.
 * The library's existing definition, uniform and rendering infrastructure is used.
 */
export interface ComponentProps {
    center: {x: number; y: number}
    radius: number
    formation: number
    energy: number
    deformation: number
    drift: number
    vapor: number
    grain: number
    speed: number
    phase: number
    targetA: {x: number; y: number}
    targetB: {x: number; y: number}
    targetC: {x: number; y: number}
    strengthA: number
    strengthB: number
    strengthC: number
    lightA: number
    lightB: number
    lightC: number
    colorPhase: number
    surfaceGlow: number
    backgroundAlpha: number
}

export const componentDefinition: GpuShaderDefinition<ComponentProps> = defineShader<ComponentProps>({
    name: 'PresenceOrb',
    role: 'generator',
    category: 'Interactive',
    description: 'Continuously moving, shaded organic sphere with a diffuse cloud state and flowing vapor drawn toward up to three targets.',
    animatedTime: {speed: 'speed'},
    props: {
        center: {default: {x: 0.47, y: 0.52}, transform: transformPosition, ui: {type: 'position', label: 'Center', group: 'Position'}},
        radius: {default: 0.16, description: 'Radius as a fraction of canvas height.', ui: {type: 'range', min: 0.01, max: 0.5, step: 0.005, label: 'Radius', group: 'Shape'}},
        formation: {default: 1, description: 'Zero is a diffuse cloud; one is a shaded sphere.', ui: {type: 'range', min: 0, max: 1, step: 0.01, label: 'Formation', group: 'Shape'}},
        energy: {default: 0, description: 'Broad surface illumination and bloom, independent of continuous idle motion.', ui: {type: 'range', min: 0, max: 1, step: 0.01, label: 'Energy', group: 'Light'}},
        deformation: {default: 1, ui: {type: 'range', min: 0, max: 2, step: 0.01, label: 'Undulation', group: 'Shape'}},
        drift: {default: 1, ui: {type: 'range', min: 0, max: 2, step: 0.01, label: 'Drift', group: 'Animation'}},
        vapor: {default: 1, ui: {type: 'range', min: 0, max: 2, step: 0.01, label: 'Vapor', group: 'Light'}},
        grain: {default: 0.025, ui: {type: 'range', min: 0, max: 0.2, step: 0.005, label: 'Grain', group: 'Light'}},
        speed: {default: 1, description: 'The orb moves even with no targets. Zero pauses its internal clock.', ui: {type: 'range', min: 0, max: 3, step: 0.05, label: 'Speed', group: 'Animation'}},
        phase: {default: 0, description: 'Seconds added to the internal clock. With speed zero this permits deterministic scrubbing.', ui: {type: 'range', min: 0, max: 60, step: 0.1, label: 'Phase', group: 'Animation'}},
        targetA: {default: {x: 0.7, y: 0.32}, transform: transformPosition, ui: {type: 'position', label: 'Target A', group: 'Targets'}},
        targetB: {default: {x: 0.23, y: 0.72}, transform: transformPosition, ui: {type: 'position', label: 'Target B', group: 'Targets'}},
        targetC: {default: {x: 0.7, y: 0.32}, transform: transformPosition, ui: {type: 'position', label: 'Target C', group: 'Targets'}},
        strengthA: {default: 0, ui: {type: 'range', min: 0, max: 1, step: 0.01, label: 'Target A strength', group: 'Targets'}},
        strengthB: {default: 0, ui: {type: 'range', min: 0, max: 1, step: 0.01, label: 'Target B strength', group: 'Targets'}},
        strengthC: {default: 0, ui: {type: 'range', min: 0, max: 1, step: 0.01, label: 'Target C strength', group: 'Targets'}},
        lightA: {default: 1, description: 'How strongly target A illuminates the surface, independent of its vapor connection.'},
        lightB: {default: 1, description: 'How strongly target B illuminates the surface, independent of its vapor connection.'},
        lightC: {default: 1, description: 'How strongly target C illuminates the surface, independent of its vapor connection.'},
        colorPhase: {default: 0, description: 'Rotation of the surface color field in radians.'},
        surfaceGlow: {default: 1, description: 'Strength of the moving surface light, independent of target illumination.'},
        backgroundAlpha: {default: 1, description: 'One renders on black; zero leaves the area around the light transparent.'},
    },
    paint: wgsl(presenceOrbSource()),
})

/** Shared visual program; only the uniform slot declarations vary by capacity. */
export function presenceOrbSource(suffixes: readonly string[] = ['A', 'B', 'C'], dynamic = false): string {
    // Fixed-slot shader callers also get distinct profiles. The packaged
    // component supplies profiles seeded by stable record IDs instead of slots.
    const beamDefaults: Record<string, (index: number) => number> = {
        beamPhase: i => ((i * .618034 + .193) % 1) * 6.283185,
        beamRate: i => .25 + ((i * .381966 + .41) % 1) * .35,
        beamWidth: i => .45 + ((i * .754878 + .21) % 1) * 1.2,
        beamBend: i => (((i * .56984 + .73) % 1) * 2 - 1) * .35,
        beamCurl: i => .4 + ((i * .43829 + .32) % 1) * 1.2,
    }
    return String.raw`
        let t = time + phase;
        let solid = clamp(formation, 0.0, 1.0);
        let power = clamp(energy, 0.0, 1.0);
        let unit = max(radius, 0.0001);
        let motion = vec2f(sin(t * 0.53) + 0.4 * sin(t * 0.93), cos(t * 0.47) - 0.4 * sin(t * 0.7)) * 0.055 * drift;
        let q0 = (uv - center) * vec2f(aspect, 1.0) / unit - motion;
        let q = q0 * vec2f(1.0, 1.0 - 0.035 * cos(t * 0.53) * deformation);
        let angle = atan2(q.y, q.x);
        let distortion = deformation * (0.040 * sin(2.0 * angle + t * 1.40) + 0.023 * cos(3.0 * angle - t * 0.86) + 0.012 * sin(angle + t * 0.91));
        let bodyRadius = 1.0 + distortion + 0.009 * sin(t * 1.3);
        let distance = length(q);
        let signedDistance = distance - bodyRadius;
        let edgeSoftness = 0.022 + (1.0 - solid) * 0.24;
        let coverage = 1.0 - smoothstep(-edgeSoftness, edgeSoftness, signedDistance);
        let radial = min(distance / bodyRadius, 1.0);
        let depth = sqrt(max(0.0, 1.0 - radial * radial));

        // A continuously rotating material coordinate on a convex surface.
        // The normal has a depth component across the entire face, not a ring mask.
        let surface = normalize(vec3f(q / max(bodyRadius, 0.01), depth + 0.001));
        let rotation = t * 0.19;
        let material = vec3f(surface.x * cos(rotation) + surface.z * sin(rotation), surface.y, surface.z * cos(rotation) - surface.x * sin(rotation));
        let curls = sin(material.x * 3.8 + material.y * 2.1 + t * 0.36) * cos(material.y * 3.2 - material.z * 2.7 - t * 0.21);
        let pink = vec3f(0.93, 0.28, 0.52);
        let cyan = vec3f(0.30, 0.64, 0.88);
        let amber = vec3f(0.88, 0.51, 0.22);
        let violet = vec3f(0.39, 0.32, 0.68);
        let spectralPhase = angle + colorPhase - 0.25 * sin(t * 0.43) + 0.40 * curls + depth * 0.3 * sin(t * 0.7 + angle * 2.0);
        let hueA = 0.5 + 0.5 * sin(spectralPhase + 2.3 + 0.32 * sin(t * 0.62));
        let hueB = 0.5 + 0.5 * sin(spectralPhase + 0.3 + 0.28 * cos(t * 0.52));
        let spectrum = mix(mix(pink, cyan, pow(hueA, 2.0)), amber, pow(hueB, 6.0) * 0.8);

        // The unformed state is a luminous volume. Three broad, advected lobes
        // overlap; no photograph or reference pixels are sampled by this shader.
        var cloud = vec3f(0.0);
        if (solid < 1.0) {
            let cloudQ = q * 0.82 + vec2f(0.11 * sin(t * 0.41 + q.y), 0.10 * cos(t * 0.33 + q.x));
            let cloudA = cloudQ - vec2f(-0.50 + 0.12 * sin(t * 0.25), 0.26);
            let cloudB = cloudQ - vec2f(0.37, 0.32 + 0.12 * cos(t * 0.29));
            let cloudC = cloudQ - vec2f(0.0, -0.53);
            let cloudD = cloudQ - vec2f(-0.30, 0.80);
            cloud = vec3f(0.18, 0.10, 0.025) * exp(-dot(cloudA, cloudA) * 1.35)
                + vec3f(0.025, 0.105, 0.14) * exp(-dot(cloudB, cloudB) * 1.3)
                + vec3f(0.16, 0.04, 0.19) * exp(-dot(cloudC, cloudC) * 1.25)
                + vec3f(0.08, 0.07, 0.02) * exp(-dot(cloudD, cloudD) * 1.4);
        }

        var directedLight = vec3f(0.0);
        var plumes = vec3f(0.0);
        var broadGlow = vec3f(0.0);
        var depletion = 0.0;
        var liftedLight = vec3f(0.0);
        ${dynamic ? 'var targetPaint = vec4f(0.0);' : ''}
        let targets = array<vec2f, ${suffixes.length}>(${suffixes.map(s => 'target' + s).join(', ')});
        let weights = array<f32, ${suffixes.length}>(${suffixes.map(s => 'strength' + s).join(', ')});
        let lightWeights = array<f32, ${suffixes.length}>(${suffixes.map(s => 'light' + s).join(', ')});
        ${dynamic ? `let responses = array<f32, ${suffixes.length}>(${suffixes.map(s => 'response' + s).join(', ')});` : ''}
        ${Object.entries(beamDefaults).map(([name, value]) => `let ${name}s = array<f32, ${suffixes.length}>(${suffixes.map((s, i) => dynamic ? name + s : value(i).toFixed(6)).join(', ')});`).join('\n')}
        ${dynamic ? `let targetSizes = array<vec2f, ${suffixes.length}>(${suffixes.map(s => `vec2f(targetWidth${s}, targetHeight${s})`).join(', ')});
        let targetCorners = array<f32, ${suffixes.length}>(${suffixes.map(s => 'targetCorner' + s).join(', ')});` : ''}
        // This loop evaluates active analytic vapor fields on the GPU. It does
        // not read or process any GIF, image or frame data.
        for (var i = 0; i < ${dynamic ? `min(i32(attractorCount), ${suffixes.length})` : suffixes.length}; i++) {
            let response = ${dynamic ? 'clamp(responses[i], -1.0, 1.0)' : '0.0'};
            let weight = clamp(weights[i], 0.0, 1.0) * (1.0 + response * 0.32);
            ${dynamic ? '' : 'if (weight == 0.0) { continue; }'}
            let beamPhase = beamPhases[i];
            let beamRate = beamRates[i];
            let beamWidth = beamWidths[i];
            let beamBend = beamBends[i];
            let beamCurl = beamCurls[i];
            let destination = (targets[i] - center) * vec2f(aspect, 1.0) / unit - motion;
            let targetDistance = max(length(destination), 1.1);
            let direction = destination / max(length(destination), 0.001);
            let perpendicular = vec2f(-direction.y, direction.x);
            let along = dot(q, direction);
            let across = dot(q, perpendicular);
            let hue = pow(0.5 + 0.5 * sin(t * (0.75 + beamRate * 0.45) + beamPhase - 0.46), 6.0);
            let redShift = 0.5 + 0.5 * sin(t * 1.9 + beamPhase);
            let warmLight = mix(vec3f(0.95, 0.48, 0.91), vec3f(0.94, 0.23, 0.41), redShift * 0.55);
            let sourceAngle = atan2(direction.y, direction.x) + response * 0.18 + colorPhase - 0.25 * sin(t * 0.43);
            let sourceBlue = 0.5 + 0.5 * sin(sourceAngle + 2.3 + 0.32 * sin(t * 0.62));
            let sourceAmber = 0.5 + 0.5 * sin(sourceAngle + 0.3 + 0.28 * cos(t * 0.52));
            let energizedColor = mix(mix(pink, cyan, pow(sourceBlue, 2.0)), amber, pow(sourceAmber, 6.0) * 0.8);
            let targetColor = mix(mix(warmLight, cyan, hue), energizedColor, power);
            ${dynamic ? `// The label surface receives this beam's actual emission color.
            // Its DOM text and removal control share the same anchored wobble.
            let halfSize = targetSizes[i] * vec2f(aspect, 1.0) / (2.0 * unit);
            if (halfSize.x > 0.0 && halfSize.y > 0.0) {
                let pillPoint = (uv - targets[i]) * vec2f(aspect, 1.0) / unit;
                let rotation = response * 0.12217305;
                let local = vec2f(cos(rotation) * pillPoint.x + sin(rotation) * pillPoint.y,
                    -sin(rotation) * pillPoint.x + cos(rotation) * pillPoint.y)
                    / vec2f(1.0 + response * 0.065, 1.0 - response * 0.045);
                let corner = min(targetCorners[i] / unit, min(halfSize.x, halfSize.y));
                let rounded = abs(local) - halfSize + vec2f(corner);
                let pillDistance = length(max(rounded, vec2f(0.0))) + min(max(rounded.x, rounded.y), 0.0) - corner;
                let pixel = 1.0 / (viewport.y * unit);
                let fill = 1.0 - smoothstep(-pixel, pixel, pillDistance);
                let incidence = clamp(weight * lightWeights[i] * solid, 0.0, 1.0);
                let tint = mix(vec3f(0.77, 0.75, 0.80), mix(targetColor, vec3f(0.98), 0.35), incidence * 0.92);
                let rim = (1.0 - smoothstep(0.0, pixel * 2.0, abs(pillDistance))) * 0.18;
                let glow = exp(-max(pillDistance, 0.0) * 12.0) * incidence * 0.13 * (1.0 - fill);
                let alpha = fill + glow;
                let paint = mix(tint, vec3f(1.0), rim) * fill + targetColor * glow;
                targetPaint = vec4f(paint + targetPaint.rgb * (1.0 - alpha), alpha + targetPaint.a * (1.0 - alpha));
            }` : ''}
            if (weight == 0.0) { continue; }
            if (coverage > 0.0 && solid > 0.0) {
                let lightAxis = normalize(vec3f(direction, 0.17));
                let facing = max(0.0, dot(surface, lightAxis));
                // Diffuse penetration plus grazing-angle scattering fill the
                // hemisphere that faces the target, with no hard circular outline.
                let grazing = pow(max(0.0, 1.0 - depth), 1.35);
                directedLight += targetColor * weight * max(lightWeights[i], 0.0) * (pow(facing, 5.0) * (0.12 + 1.30 * grazing));
                // The surface feeds the same outward phase. A moving dark wake
                // follows each lifted streak; the sphere remains a shaded volume.
                let extractionPulse = 0.5 + 0.5 * sin(-t * beamRate * 3.8 + beamPhase);
                let sourcePatch = pow(facing, 7.0) * pow(radial, 2.0);
                depletion += weight * vapor * sourcePatch * (0.20 + 0.24 * extractionPulse);
                liftedLight += mix(targetColor, vec3f(1.0), 0.25) * weight * vapor * sourcePatch * (0.08 + 0.30 * grazing) * (1.0 - extractionPulse);
            }

            // A sheet of vapor lifts from an arc of the surface. Its material
            // coordinate travels outwards and stretches as it approaches the
            // sink; mottled folds move through it instead of a solid cone or a
            // chain of independently displaced particle centers.
            let source = 0.62;
            let reach = max(targetDistance - source, 0.4);
            let progress = clamp((along - source) / reach, 0.0, 1.0);
            let interval = smoothstep(0.38, 0.86, along) * (1.0 - smoothstep(targetDistance, targetDistance + 0.20, along));
            let outside = 1.0 - coverage * solid;
            if (interval > 0.0 && outside > 0.0) {
                let travel = log(1.0 + progress * 3.0) * 2.6 - t * beamRate * 3.8 + beamPhase;
                let bend = beamBend * sin(progress * 3.14159);
                let width = mix(0.70, 0.18, progress) * (0.72 + 0.28 * beamWidth);
                let lateral = (across - bend) / width;
                let roll = sin(travel * 0.85 + beamPhase + lateral * 0.6);
                let folded = lateral + (0.18 + 0.12 * beamCurl) * roll;
                var field = vec2f(travel * 1.1, lateral * 1.35 + beamPhase * 2.7);
                field += vec2f(0.38 * sin(lateral * 1.7 + travel * 0.6), 0.40 * sin(travel * 0.9 + lateral * 0.8));
                var density = 0.0;
                var amplitude = 0.67;
                // Smooth value noise supplies irregular, advected density. It
                // modulates a volume, never a polyline or separate bright joins.
                for (var octave = 0; octave < 2; octave++) {
                    let cell = floor(field);
                    let fraction = fract(field);
                    let blend = fraction * fraction * fraction * (fraction * (fraction * 6.0 - 15.0) + 10.0);
                    // Compute shared corners in the same arithmetic order on
                    // both sides of a cell, including at negative coordinates.
                    let corners = vec4f(cell.x, cell.x + 1.0, cell.x, cell.x + 1.0) * 127.1
                        + vec4f(cell.y, cell.y, cell.y + 1.0, cell.y + 1.0) * 311.7;
                    let values = fract(sin(corners) * 43758.5453);
                    density += mix(mix(values.x, values.y, blend.x), mix(values.z, values.w, blend.x), blend.y) * amplitude;
                    field = field * 2.03 + vec2f(13.7, 7.9);
                    amplitude *= 0.5;
                }
                let veil = exp(-folded * folded * (0.9 + 0.5 * density));
                let fold = 0.5 + 0.5 * sin(lateral * 3.1 + density * 4.0 + travel * 0.7);
                let folds = 0.80 + 0.20 * fold * fold;
                let fog = smoothstep(0.12, 0.86, density);
                let dissipation = mix(1.0, 0.22, progress * progress);
                let volume = veil * (0.015 + 0.70 * fog * fog * folds) * dissipation;
                plumes += targetColor * weight * vapor * volume * interval * outside * (0.7 + 0.3 * clamp(lightWeights[i], 0.0, 1.0));
            }
            let hazeDistance = q - destination * 0.74;
            broadGlow += targetColor * weight * exp(-dot(hazeDistance, hazeDistance) * 3.1) * 0.075;
        }

        var body = vec3f(0.0);
        if (coverage > 0.0 && solid > 0.0) {
            let baseFacing = max(0.0, dot(surface, normalize(vec3f(0.7, -0.55, 0.2))));
            let fresnel = pow(1.0 - depth, 1.15);
            let face = vec3f(0.030, 0.021, 0.035) + violet * (0.014 + 0.012 * (curls * 0.5 + 0.5));
            let ambient = cyan * 0.055 * pow(max(0.0, dot(surface, normalize(vec3f(-0.7, 0.3 * sin(t), 0.1)))), 2.0) * pow(radial, 3.0);
            let travelingAngle = 1.0 + sin(t * 1.5) * 0.50;
            let travelingFacing = max(0.0, dot(surface, normalize(vec3f(cos(travelingAngle), sin(travelingAngle), 0.12))));
            let travelingColor = mix(cyan, amber, 0.5 + 0.5 * sin(t * 1.9));
            let travelingLight = travelingColor * pow(travelingFacing, 4.0) * pow(1.0 - depth, 0.75) * (1.20 + 0.20 * sin(t * 1.4)) * max(surfaceGlow, 0.0);
            let restingSurface = face + ambient + spectrum * (0.045 + 0.025 * baseFacing) * pow(radial, 3.0) + directedLight + travelingLight;
            let litSurface = vec3f(0.18, 0.135, 0.235) + spectrum * (0.30 * pow(radial, 3.5) + 0.44 * fresnel) + directedLight * 0.12;
            let illumination = max(directedLight.r, max(directedLight.g, directedLight.b)) + max(travelingLight.r, max(travelingLight.g, travelingLight.b));
            let scattering = mix(vec3f(0.9, 0.86, 0.9), spectrum, 0.35) * illumination * 0.28 * exp(-pow(signedDistance / 0.035, 2.0));
            body = (mix(restingSurface, litSurface, power) * (1.0 - clamp(depletion, 0.0, 0.75)) + liftedLight + scattering * (1.0 - power * 0.8)) * coverage;
        }
        let atmosphere = (spectrum * exp(-abs(signedDistance) * 3.2) * power * 0.32
            + spectrum * exp(-dot(q, q) * 0.92) * power * 0.085) * smoothstep(0.3, 0.9, distance);
        var rgb = mix(cloud, body + atmosphere + plumes + broadGlow, solid);

        // Fine moving luminance grain, strongest where there is visible light.
        let pixels = floor(uv * viewport);
        let grainValue = fract(sin(dot(pixels, vec2f(12.9898, 78.233)) + floor(t * 10.0) * 17.17) * 43758.5453) - 0.5;
        let visibility = smoothstep(0.0, 0.08, max(rgb.r, max(rgb.g, rgb.b)));
        rgb = max(vec3f(0.0), rgb + vec3f(grainValue * grain * visibility));
        ${dynamic ? 'rgb = rgb * (1.0 - targetPaint.a) + targetPaint.rgb;' : ''}
        let alpha = mix(clamp(max(rgb.r, max(rgb.g, rgb.b)) * 3.0 + coverage * solid, 0.0, 1.0), 1.0, clamp(backgroundAlpha, 0.0, 1.0));
        // The preceding art-direction values are display RGB. The shared
        // renderer expects linear light and performs the final display transfer.
        let linear = select(pow((rgb + vec3f(0.055)) / 1.055, vec3f(2.4)), rgb / 12.92, rgb <= vec3f(0.04045));
        return vec4f(linear, alpha);
    `
}

/** Compile a bounded dynamic layout without importing the entire shader registry. */
export function createPresenceOrbDefinition(capacity = 16): GpuShaderDefinition {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 32) {
        throw new RangeError('PresenceOrb capacity must be an integer from 1 to 32')
    }
    const suffixes = Array.from({length: capacity}, (_, i) => String(i))
    const props: Record<string, any> = Object.fromEntries(
        Object.entries(componentDefinition.props).filter(([key]) => !/^(target|strength|light)[ABC]$/.test(key)),
    )
    props.attractorCount = {default: 0}
    for (const suffix of suffixes) {
        props['target' + suffix] = {default: {x: 0.5, y: 0.5}, transform: transformPosition}
        props['strength' + suffix] = {default: 0}
        props['light' + suffix] = {default: 1}
        props['response' + suffix] = {default: 0}
        props['targetWidth' + suffix] = {default: 0}
        props['targetHeight' + suffix] = {default: 0}
        props['targetCorner' + suffix] = {default: 0}
        for (const [name, value] of Object.entries({beamPhase: Number(suffix) * 2.31, beamRate: .42, beamWidth: 1, beamBend: .08, beamCurl: 1})) props[name + suffix] = {default: value}
    }
    return defineShader({
        name: 'PresenceOrbDynamic' + capacity,
        role: 'generator',
        animatedTime: {speed: 'speed'},
        props,
        paint: wgsl(presenceOrbSource(suffixes, true)),
    })
}
