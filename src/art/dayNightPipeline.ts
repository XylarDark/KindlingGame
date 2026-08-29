import Phaser from "phaser";
import { DAY_NIGHT_TUNE, MAX_LIGHTS, rgb01, worldToUv, type GradeFrame, type ViewRect } from "./dayNightGrade";

export const DAY_NIGHT_PIPELINE = "DayNight";

const FRAG = `
#define SHADER_NAME KINDLING_DAYNIGHT_FS

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;
varying vec2 outTexCoord;

uniform vec3 uGradeTint;
uniform float uGradeStrength;
uniform vec3 uAmbient;
uniform float uAmbientMul;
uniform vec2 uResolution;
uniform int uLightCount;
uniform vec2 uLightPos[8];
uniform vec3 uLightColor[8];
uniform float uLightRadius[8];
uniform float uLightIntensity[8];
uniform vec2 uLightScale[8];

void main ()
{
    vec4 src = texture2D(uMainSampler, outTexCoord);
    vec3 graded = mix(src.rgb, src.rgb * uGradeTint, uGradeStrength);
    vec3 light = uAmbient * uAmbientMul;
    float aspect = uResolution.x / max(uResolution.y, 1.0);

    for (int i = 0; i < 8; i++)
    {
        float on = step(float(i) + 0.5, float(uLightCount));
        vec2 d = outTexCoord - uLightPos[i];
        vec2 sc = max(uLightScale[i], vec2(0.15));
        d.x *= aspect * sc.x;
        d.y *= sc.y;
        float dist = length(d);
        float att = 1.0 - smoothstep(0.0, max(uLightRadius[i], 0.001), dist);
        att *= att;
        light += uLightColor[i] * (att * uLightIntensity[i] * on);
    }

    gl_FragColor = vec4(min(graded * light, vec3(1.15)), src.a);
}
`;

export class DayNightPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  frame: GradeFrame = {
    tint: [1, 1, 1],
    gradeStrength: 0,
    ambient: [1, 1, 1],
    ambientMul: 1,
    lights: [],
  };
  viewRect: ViewRect = { x: 0, y: 0, width: 1920, height: 1080 };

  constructor(game: Phaser.Game) {
    super({
      game,
      name: DAY_NIGHT_PIPELINE,
      fragShader: FRAG,
    });
  }

  setGrade(frame: GradeFrame, view: ViewRect): void {
    this.frame = frame;
    this.viewRect = view;
  }

  onPreRender(): void {
    this.syncViewFromCamera();
    this.upload();
  }

  onDraw(renderTarget: Phaser.Renderer.WebGL.RenderTarget): void {
    this.syncViewFromCamera();
    this.upload();
    this.bindAndDraw(renderTarget);
  }

  private syncViewFromCamera(): void {
    const cam = this.gameObject as Phaser.Cameras.Scene2D.Camera | undefined;
    const view = cam?.worldView;
    if (!view || view.width < 1 || view.height < 1) return;
    this.viewRect = { x: view.x, y: view.y, width: view.width, height: view.height };
  }

  private upload(): void {
    const { frame, viewRect: view } = this;
    const pos = new Float32Array(MAX_LIGHTS * 2);
    const color = new Float32Array(MAX_LIGHTS * 3);
    const radius = new Float32Array(MAX_LIGHTS);
    const intensity = new Float32Array(MAX_LIGHTS);
    const scale = new Float32Array(MAX_LIGHTS * 2);
    const count = Math.min(MAX_LIGHTS, frame.lights.length);

    for (let i = 0; i < count; i++) {
      const light = frame.lights[i]!;
      const uv = worldToUv(light.x, light.y, view);
      pos[i * 2] = uv.u;
      pos[i * 2 + 1] = uv.v;
      const rgb = rgb01(light.color);
      color[i * 3] = rgb[0];
      color[i * 3 + 1] = rgb[1];
      color[i * 3 + 2] = rgb[2];
      radius[i] = light.radius / Math.max(1, view.height);
      intensity[i] = light.intensity;
      scale[i * 2] = light.scaleX ?? 1;
      scale[i * 2 + 1] = light.scaleY ?? 1;
    }

    this.set3f("uGradeTint", frame.tint[0], frame.tint[1], frame.tint[2]);
    this.set1f("uGradeStrength", frame.gradeStrength);
    this.set3f("uAmbient", frame.ambient[0], frame.ambient[1], frame.ambient[2]);
    this.set1f("uAmbientMul", frame.ambientMul);
    this.set2f("uResolution", view.width, view.height);
    this.set1i("uLightCount", count);
    this.set2fv("uLightPos", pos);
    this.set3fv("uLightColor", color);
    this.set1fv("uLightRadius", radius);
    this.set1fv("uLightIntensity", intensity);
    this.set2fv("uLightScale", scale);
  }
}

export function registerDayNightPipeline(game: Phaser.Game): void {
  if (game.renderer.type !== Phaser.WEBGL) return;
  const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (!renderer.pipelines.postPipelineClasses.has(DAY_NIGHT_PIPELINE)) {
    renderer.pipelines.addPostPipeline(DAY_NIGHT_PIPELINE, DayNightPipeline);
  }
}

export function dayNightFrom(camera: Phaser.Cameras.Scene2D.Camera): DayNightPipeline | undefined {
  const found = camera.getPostPipeline(DAY_NIGHT_PIPELINE);
  const pipe = (Array.isArray(found) ? found[0] : found) as DayNightPipeline | undefined;
  return pipe && typeof pipe.setGrade === "function" ? pipe : undefined;
}

export function attachDayNight(camera: Phaser.Cameras.Scene2D.Camera): DayNightPipeline | undefined {
  registerDayNightPipeline(camera.scene.game);
  if (camera.scene.game.renderer.type !== Phaser.WEBGL) return undefined;
  if (!dayNightFrom(camera)) camera.setPostPipeline(DAY_NIGHT_PIPELINE);
  return dayNightFrom(camera);
}

export function applyDayNight(
  pipe: DayNightPipeline | undefined,
  frame: GradeFrame,
  view: ViewRect,
): void {
  pipe?.setGrade(frame, view);
}

export { DAY_NIGHT_TUNE };
