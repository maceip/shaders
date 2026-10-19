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
        let targets = array<vec2f, ${suffixes.length}>(${suffixes.map(s => 'target' + s).join(', ')});
        let weights = array<f32, ${suffixes.length}>(${suffixes.map(s => 'strength' + s).join(', ')});
        let lightWeights = array<f32, ${suffixes.length}>(${suffixes.map(s => 'light' + s).join(', ')});
        ${dynamic ? `let responses = array<f32, ${suffixes.length}>(${suffixes.map(s => 'response' + s).join(', ')});` : ''}
        // This loop evaluates active analytic vapor fields on the GPU. It does
        // not read or process any GIF, image or frame data.
        for (var i = 0; i < ${dynamic ? `min(i32(attractorCount), ${suffixes.length})` : suffixes.length}; i++) {
            let response = ${dynamic ? 'clamp(responses[i], -1.0, 1.0)' : '0.0'};
            let weight = clamp(weights[i], 0.0, 1.0) * (1.0 + response * 0.32);
            if (weight == 0.0) { continue; }
            let destination = (targets[i] - center) * vec2f(aspect, 1.0) / unit - motion;
            let targetDistance = max(length(destination), 1.1);
            let direction = destination / max(length(destination), 0.001);
            let perpendicular = vec2f(-direction.y, direction.x);
            let along = dot(q, direction);
            let across = dot(q, perpendicular);
            let hue = pow(0.5 + 0.5 * sin(t * 0.945 - 0.46), 6.0);
            let redShift = 0.5 + 0.5 * sin(t * 1.9);
            let warmLight = mix(vec3f(0.95, 0.48, 0.91), vec3f(0.94, 0.23, 0.41), redShift * 0.55);
            let sourceAngle = atan2(direction.y, direction.x) + response * 0.18 + colorPhase - 0.25 * sin(t * 0.43);
            let sourceBlue = 0.5 + 0.5 * sin(sourceAngle + 2.3 + 0.32 * sin(t * 0.62));
            let sourceAmber = 0.5 + 0.5 * sin(sourceAngle + 0.3 + 0.28 * cos(t * 0.52));
            let energizedColor = mix(mix(pink, cyan, pow(sourceBlue, 2.0)), amber, pow(sourceAmber, 6.0) * 0.8);
            let targetColor = mix(mix(warmLight, cyan, hue), energizedColor, power);
            if (coverage > 0.0 && solid > 0.0) {
                let lightAxis = normalize(vec3f(direction, 0.17));
                let facing = max(0.0, dot(surface, lightAxis));
                // Diffuse penetration plus grazing-angle scattering fill the
                // hemisphere that faces the target, with no hard circular outline.
                let grazing = pow(max(0.0, 1.0 - depth), 1.35);
                directedLight += targetColor * weight * max(lightWeights[i], 0.0) * (pow(facing, 5.0) * (0.12 + 1.30 * grazing));
                // The surface feeds the same outward phase. A moving dark wake
                // follows each lifted streak; the sphere remains a shaded volume.
                let extractionPulse = 0.5 + 0.5 * sin(-t * 0.42 * 37.6991 + f32(i) * 2.31);
                let sourcePatch = pow(facing, 7.0) * pow(radial, 2.0);
                depletion += weight * vapor * sourcePatch * (0.20 + 0.24 * extractionPulse);
                liftedLight += mix(targetColor, vec3f(1.0), 0.25) * weight * vapor * sourcePatch * (0.08 + 0.30 * grazing) * (1.0 - extractionPulse);
            }

            // Material is transported from the facing surface into the object.
            // Each overlapping volume has a birth time and advances monotonically
            // along the path. It accelerates and contracts near the destination;
            // the turbulence travels with it instead of boiling in a fixed mask.
            let source = 0.84;
            let reach = max(targetDistance - source, 0.25);
            let flowProgress = clamp((along - source) / reach, 0.0, 1.0);
            let pathBend = sin(flowProgress * 3.14159) * (0.08 + 0.07 * sin(t * 0.39 + f32(i)));
            let baseWidth = mix(0.40, 0.12, flowProgress) + 0.09 * sin(flowProgress * 3.14159);
            let axisDistance = across - pathBend;
            let envelope = exp(-pow(axisDistance / baseWidth, 2.0));
            let interval = smoothstep(0.64, 1.02, along) * (1.0 - smoothstep(targetDistance, targetDistance + 0.25, along));
            let outside = 1.0 - coverage * solid;
            var transported = 0.0;
            // A zero gate cannot contribute any vapor. Skip the expensive
            // volumes in those pixels, without changing visible samples.
            if (interval > 0.0 && outside > 0.0) {
              for (var parcel = 0; parcel < 6; parcel++) {
                let seed = f32(parcel) * 1.618 + f32(i) * 2.31;
                let age = fract(t * 0.42 + f32(parcel) / 6.0 + f32(i) * 0.173);
                let advance = (exp(age * 1.45) - 1.0) / (exp(1.45) - 1.0);
                let parcelAlong = source + reach * advance;
                let path = sin(advance * 3.14159) * (0.08 + 0.07 * sin(t * 0.39 + f32(i)));
                let spread = mix(0.40, 0.10, advance);
                let parcelAcross = path + sin(seed * 3.7 + age * 3.8) * spread * 0.35;
                let forward = (along - parcelAlong) / (0.18 + 0.20 * advance);
                let lateral = (across - parcelAcross) / spread;
                let curl = sin(forward * 2.4 + age * 4.0 + seed) * 0.38;
                let volume = exp(-forward * forward - pow(lateral + curl, 2.0));
                let wisps = 0.72 + 0.28 * cos(lateral * 4.1 + sin(forward * 2.2 + seed + age * 2.0) * 1.9);
                let lifetime = smoothstep(0.0, 0.10, age) * (1.0 - smoothstep(0.88, 1.0, age));
                transported += volume * wisps * lifetime * (0.75 + 0.25 * sin(seed * 5.3));
              }
            }
            plumes += targetColor * weight * vapor * (0.10 * envelope + 0.34 * transported) * interval * outside * (0.7 + 0.3 * clamp(lightWeights[i], 0.0, 1.0));
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
    }
    return defineShader({
        name: 'PresenceOrbDynamic' + capacity,
        role: 'generator',
        animatedTime: {speed: 'speed'},
        props,
        paint: wgsl(presenceOrbSource(suffixes, true)),
    })
}
