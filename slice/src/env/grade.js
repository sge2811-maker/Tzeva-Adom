// Custom post effects for the pmndrs `postprocessing` EffectPass.
//  GradeEffect (HDR, before tone mapping): exposure, intercept flash, red-alert edge tint, desaturation.
//  LookEffect (LDR, after tone mapping): night split-tone (teal shadows, sodium highlights), contrast.
import { Effect } from 'postprocessing';
import { Uniform } from 'three';

export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', /* glsl */`
      uniform float uExposure; uniform float uBase; uniform float uFlash; uniform float uRed; uniform float uDesat; uniform float uTime;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb * exp2(uExposure + uBase);
        c += vec3(1.0, 0.93, 0.85) * uFlash * 0.05 * (0.5 + 0.5 * min(dot(c, vec3(0.33)), 1.0));
        vec2 q = uv - 0.5; float r2 = dot(q, q);
        // red alert: not a filter. Slightly drained colour, a crimson cast creeping in from the
        // frame edges and a slow pulse with the siren; lit windows and fires keep their hue.
        float pulse = 0.7 + 0.3 * sin(uTime * 6.2831 * 0.5);
        float edge = smoothstep(0.05, 0.48, r2);
        float l0 = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(c, vec3(l0), 0.22 * uRed);
        float ra = uRed * pulse * edge;
        c = c * mix(vec3(1.0), vec3(1.18, 0.86, 0.84), ra) + vec3(0.016, 0.0015, 0.002) * ra;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(c, vec3(l), uDesat);
        outputColor = vec4(c, inputColor.a);
      }`, {
      uniforms: new Map([['uExposure', new Uniform(0)], ['uBase', new Uniform(-0.15)], ['uFlash', new Uniform(0)], ['uRed', new Uniform(0)], ['uDesat', new Uniform(0)], ['uTime', new Uniform(0)]]),
    });
  }
}

export class LookEffect extends Effect {
  constructor() {
    super('LookEffect', /* glsl */`
      uniform float uStrength;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        vec3 shadows = vec3(0.97, 0.99, 1.02), highs = vec3(1.05, 0.99, 0.91);
        vec3 graded = c * mix(shadows, highs, smoothstep(0.08, 0.7, l));
        float lg = dot(graded, vec3(0.2126, 0.7152, 0.0722));
        graded = mix(vec3(lg), graded, 1.22);              // AgX drains colour: put some back
        graded = (graded - 0.5) * 1.06 + 0.5;            // gentle contrast
        graded += vec3(0.004, 0.007, 0.011) * (1.0 - l);  // lifted, cool blacks
        outputColor = vec4(mix(c, max(graded, 0.0), uStrength), inputColor.a);
      }`, { uniforms: new Map([['uStrength', new Uniform(1)]]) });
  }
}
