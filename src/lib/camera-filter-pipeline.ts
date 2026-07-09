// Camera filter pipeline (WebGL).
//
// Wraps a raw camera MediaStreamTrack in an offscreen WebGL pipeline that
// renders the video texture through a tiny fragment shader (brightness /
// contrast / saturation / temperature / grayscale). The filtered canvas is
// republished via `canvas.captureStream()` so LiveKit sends the effect to
// every viewer.
//
// Why WebGL? `CanvasRenderingContext2D.filter` is NOT supported on
// Safari/WebKit — using it was a no-op that just re-drew the video at a
// mismatched canvas size, cropping/zooming the frame. WebGL works
// everywhere and lets us match the source dimensions exactly (no zoom).
//
// Usage:
//   const pipe = createFilterPipeline(rawTrack, "warm");
//   await pipe.ready;
//   const publishedTrack = pipe.outputTrack;
//   pipe.setFilter("bright");
//   pipe.setSource(newRawTrack); // e.g. after a camera flip
//   pipe.stop();

export type FilterKey =
  | "none"
  | "bright"
  | "warm"
  | "soft"
  | "bw"
  | "vivid";

export const FILTER_LABELS_FR: Record<FilterKey, string> = {
  none:   "Aucun",
  bright: "Lumineux",
  warm:   "Chaleur",
  soft:   "Doux",
  bw:     "N&B",
  vivid:  "Vif",
};

export const FILTER_LABELS_EN: Record<FilterKey, string> = {
  none:   "None",
  bright: "Bright",
  warm:   "Warm",
  soft:   "Soft",
  bw:     "B&W",
  vivid:  "Vivid",
};

// Per-filter uniforms fed to the fragment shader.
// brightness: additive (0 = neutral). contrast/saturation: 1 = neutral.
// temperature: >0 warmer (more red/yellow), <0 cooler. grayscale: 0..1.
type FilterParams = {
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
  grayscale: number;
};

const FILTER_PARAMS: Record<FilterKey, FilterParams> = {
  none:   { brightness: 0.00, contrast: 1.00, saturation: 1.00, temperature: 0.00, grayscale: 0.0 },
  bright: { brightness: 0.12, contrast: 1.08, saturation: 1.05, temperature: 0.02, grayscale: 0.0 },
  warm:   { brightness: 0.04, contrast: 1.04, saturation: 1.15, temperature: 0.20, grayscale: 0.0 },
  soft:   { brightness: 0.06, contrast: 0.92, saturation: 0.95, temperature: 0.05, grayscale: 0.0 },
  bw:     { brightness: 0.02, contrast: 1.08, saturation: 1.00, temperature: 0.00, grayscale: 1.0 },
  vivid:  { brightness: 0.03, contrast: 1.15, saturation: 1.35, temperature: 0.04, grayscale: 0.0 },
};

export function isFilterPipelineSupported(): boolean {
  if (typeof HTMLCanvasElement === "undefined") return false;
  const proto = HTMLCanvasElement.prototype as unknown as { captureStream?: unknown };
  if (typeof proto.captureStream !== "function") return false;
  // Probe WebGL availability.
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    return !!gl;
  } catch {
    return false;
  }
}

export type PipelineReady =
  | { ok: true }
  | { ok: false; reason: "no_track" | "unsupported" | "gl_failed" };

export type FilterPipeline = {
  outputTrack: MediaStreamTrack;
  setFilter: (k: FilterKey) => void;
  setSource: (t: MediaStreamTrack) => Promise<void>;
  ready: Promise<PipelineReady>;
  stop: () => void;
};

const VERT_SRC = `
attribute vec2 a_pos;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// Fragment shader: brightness → contrast → saturation → temperature → grayscale.
const FRAG_SRC = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_temperature;
uniform float u_grayscale;

void main() {
  vec4 c = texture2D(u_tex, v_uv);
  vec3 rgb = c.rgb + u_brightness;
  rgb = (rgb - 0.5) * u_contrast + 0.5;
  float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
  rgb = mix(vec3(luma), rgb, u_saturation);
  rgb.r += u_temperature * 0.15;
  rgb.b -= u_temperature * 0.15;
  rgb = mix(rgb, vec3(dot(rgb, vec3(0.299, 0.587, 0.114))), u_grayscale);
  gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), c.a);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn("[filter] shader compile failed", gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

export function createFilterPipeline(
  source: MediaStreamTrack,
  initial: FilterKey,
): FilterPipeline {
  if (!isFilterPipelineSupported()) {
    return {
      outputTrack: source,
      setFilter: () => {},
      setSource: async () => {},
      ready: Promise.resolve({ ok: false, reason: "unsupported" }),
      stop: () => {},
    };
  }

  const canvas = document.createElement("canvas");
  // Size will be updated from the video's actual resolution on loadedmetadata.
  canvas.width = 1280;
  canvas.height = 720;

  const gl = (canvas.getContext("webgl", { alpha: false, premultipliedAlpha: false }) ||
    canvas.getContext("experimental-webgl", { alpha: false, premultipliedAlpha: false })) as
    WebGLRenderingContext | null;

  if (!gl) {
    return {
      outputTrack: source,
      setFilter: () => {},
      setSource: async () => {},
      ready: Promise.resolve({ ok: false, reason: "gl_failed" }),
      stop: () => {},
    };
  }

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = new MediaStream([source]);

  let currentFilter: FilterKey = initial;
  let stopped = false;
  let raf = 0;

  // Compile program.
  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) {
    return {
      outputTrack: source,
      setFilter: () => {},
      setSource: async () => {},
      ready: Promise.resolve({ ok: false, reason: "gl_failed" }),
      stop: () => {},
    };
  }
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn("[filter] program link failed", gl.getProgramInfoLog(prog));
    return {
      outputTrack: source,
      setFilter: () => {},
      setSource: async () => {},
      ready: Promise.resolve({ ok: false, reason: "gl_failed" }),
      stop: () => {},
    };
  }
  gl.useProgram(prog);

  // Fullscreen quad. Flip Y so the video is not upside-down.
  const quad = new Float32Array([
    -1, -1, 0, 1,
     1, -1, 1, 1,
    -1,  1, 0, 0,
     1,  1, 1, 0,
  ]);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(prog, "a_pos");
  const uvLoc = gl.getAttribLocation(prog, "a_uv");
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(uvLoc);
  gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);

  const uBright = gl.getUniformLocation(prog, "u_brightness");
  const uContrast = gl.getUniformLocation(prog, "u_contrast");
  const uSat = gl.getUniformLocation(prog, "u_saturation");
  const uTemp = gl.getUniformLocation(prog, "u_temperature");
  const uGray = gl.getUniformLocation(prog, "u_grayscale");

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const syncCanvasSize = () => {
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  video.addEventListener("loadedmetadata", syncCanvasSize);
  video.addEventListener("resize", syncCanvasSize);

  const started = video.play().catch(() => {});

  const readyPromise = new Promise<PipelineReady>((resolve) => {
    let resolved = false;
    const tick = () => {
      if (stopped) return;
      try {
        if (video.readyState >= 2) {
          syncCanvasSize();
          const p = FILTER_PARAMS[currentFilter];
          gl.uniform1f(uBright, p.brightness);
          gl.uniform1f(uContrast, p.contrast);
          gl.uniform1f(uSat, p.saturation);
          gl.uniform1f(uTemp, p.temperature);
          gl.uniform1f(uGray, p.grayscale);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          if (!resolved) { resolved = true; resolve({ ok: true }); }
        }
      } catch (e) {
        if (!resolved) { resolved = true; resolve({ ok: false, reason: "gl_failed" }); }
      }
      raf = requestAnimationFrame(tick);
    };
    void started.finally(() => {
      raf = requestAnimationFrame(tick);
    });
  });

  const stream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream })
    .captureStream(30);
  const outputTrack = stream.getVideoTracks()[0];

  if (!outputTrack) {
    return {
      outputTrack: source,
      setFilter: () => {},
      setSource: async () => {},
      ready: Promise.resolve({ ok: false, reason: "no_track" }),
      stop: () => { cancelAnimationFrame(raf); stopped = true; },
    };
  }

  return {
    outputTrack,
    setFilter: (k) => { currentFilter = k; },
    setSource: async (t) => {
      try {
        video.srcObject = new MediaStream([t]);
        await video.play().catch(() => {});
        // videoWidth/Height update fires 'resize' — canvas re-syncs there too.
      } catch {}
    },
    ready: readyPromise,
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
      try { outputTrack.stop(); } catch {}
      try { video.pause(); } catch {}
      try { video.srcObject = null; } catch {}
    },
  };
}
