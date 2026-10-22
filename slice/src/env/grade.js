// Custom post effects for the pmndrs `postprocessing` EffectPass.
//  GradeEffect (HDR, before tone mapping): exposure, intercept flash, red-alert edge tint, desaturation.
//  LookEffect (LDR, after tone mapping): night split-tone (teal shadows, sodium highlights), contrast.
import { Effect } from 'postprocessing';
import { Uniform } from 'three';

export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', /* glsl */`
      uniform float uExposure; uniform float uFlash; uniform float uRed; uniform float uDesat; uniform float uTime;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb * exp2(uExposure);
        c += vec3(1.0, 0.93, 0.85) * uFlash * 0.08 * (0.6 + 0.4 * dot(c, vec3(0.33)));
        vec2 q = uv - 0.5; float r2 = dot(q, q);
        float pulse = 0.75 + 0.25 * sin(uTime * 6.2831 * 0.5);
        c = mix(c, c * vec3(1.45, 0.52, 0.46) + vec3(0.025, 0.0, 0.0), uRed * pulse * smoothstep(0.04, 0.42, r2));
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(c, vec3(l), uDesat);
        outputColor = vec4(c, inputColor.a);
      }`, {
      uniforms: new Map([['uExposure', new Uniform(0)], ['uFlash', new Uniform(0)], ['uRed', new Uniform(0)], ['uDesat', new Uniform(0)], ['uTime', new Uniform(0)]]),
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
        vec3 shadows = vec3(0.86, 0.98, 1.10), highs = vec3(1.06, 0.99, 0.90);
        vec3 graded = c * mix(shadows, highs, smoothstep(0.08, 0.7, l));
        graded = (graded - 0.5) * 1.06 + 0.5;            // gentle contrast
        graded += vec3(0.004, 0.007, 0.011) * (1.0 - l);  // lifted, cool blacks
        outputColor = vec4(mix(c, max(graded, 0.0), uStrength), inputColor.a);
      }`, { uniforms: new Map([['uStrength', new Uniform(1)]]) });
  }
}
