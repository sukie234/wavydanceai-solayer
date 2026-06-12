/**
 * Declarative parameter schemas for image and video models in the playground.
 *
 * Each model family is described by a {@link ModelSpec} that lists the fields
 * the UI should expose and the shape of the request body. The
 * {@link resolveModelSpec} function walks the matcher list and returns the
 * first hit, falling back to a generic spec when nothing matches.
 *
 * Adding a new model family means:
 *   1. Define a `ModelSpec` constant below.
 *   2. Append a matcher entry (regex over the lowercased model name).
 *   3. If the backend route differs from /v1/images/generations or
 *      /v1/videos/generations, set the spec's `endpoint`.
 */

export type Modality = 'image' | 'video'

export type EnumOption = { value: string; label?: string }

export type ParamFieldType =
  | { kind: 'text'; placeholder?: string; multiline?: boolean; maxLength?: number }
  | { kind: 'enum'; options: EnumOption[] }
  | { kind: 'number'; min: number; max: number; step?: number }
  | { kind: 'toggle' }
  | { kind: 'urlList'; max?: number }

export interface ParamField {
  /** Wire key sent in the request body (e.g. `size`, `aspect_ratio`). */
  key: string
  /** i18n key suffix under `console.playground.field.*` — see locale files. */
  labelKey: string
  /** Default value applied when the spec is first selected. */
  default: string | number | boolean | string[]
  required?: boolean
  spec: ParamFieldType
  /** Optional short hint rendered under the field — i18n key. */
  hintKey?: string
  /**
   * Serialize the value as a string on the wire. The OpenAI Video API's
   * `seconds` field is a string ("5"), but a number input is nicer UX.
   */
  asString?: boolean
}

/**
 * How the request body is shaped.
 *
 *   - `openai-flat`: top-level `{ model, prompt, ...params }`. Used by the
 *     OpenAI-compatible `/v1/images/generations` relay we already support.
 *   - `kie-nested`: `{ model, input: { prompt, ...params } }`. Used by kie.ai
 *     style task-based providers (gpt-image-2, kling, sora-2). Falls through
 *     the relay as a passthrough JSON body to the upstream channel.
 */
export type BodyShape = 'openai-flat' | 'kie-nested'

export interface ModelSpec {
  id: string
  modality: Modality
  bodyShape: BodyShape
  /** Relative endpoint path (without the `/v1` prefix). */
  endpoint: string
  /** Fields rendered in the params panel, in display order. */
  fields: ParamField[]
  /**
   * Optional hard cap on prompt length. Surfaced as the textarea's
   * maxLength so the user can't paste past it.
   */
  promptMaxLength?: number
}

// -- Image specs ------------------------------------------------------------

const DALLE3: ModelSpec = {
  id: 'dall-e-3',
  modality: 'image',
  bodyShape: 'openai-flat',
  endpoint: '/v1/images/generations',
  promptMaxLength: 4000,
  fields: [
    {
      key: 'size',
      labelKey: 'size',
      default: '1024x1024',
      spec: {
        kind: 'enum',
        options: [
          { value: '1024x1024' },
          { value: '1792x1024' },
          { value: '1024x1792' },
        ],
      },
    },
    {
      key: 'quality',
      labelKey: 'quality',
      default: 'standard',
      spec: {
        kind: 'enum',
        options: [{ value: 'standard' }, { value: 'hd' }],
      },
    },
    {
      key: 'style',
      labelKey: 'style',
      default: 'vivid',
      spec: {
        kind: 'enum',
        options: [{ value: 'vivid' }, { value: 'natural' }],
      },
    },
  ],
}

const DALLE2: ModelSpec = {
  id: 'dall-e-2',
  modality: 'image',
  bodyShape: 'openai-flat',
  endpoint: '/v1/images/generations',
  promptMaxLength: 1000,
  fields: [
    {
      key: 'size',
      labelKey: 'size',
      default: '1024x1024',
      spec: {
        kind: 'enum',
        options: [
          { value: '256x256' },
          { value: '512x512' },
          { value: '1024x1024' },
        ],
      },
    },
    {
      key: 'n',
      labelKey: 'count',
      default: 1,
      spec: { kind: 'number', min: 1, max: 10, step: 1 },
    },
  ],
}

const GPT_IMAGE: ModelSpec = {
  id: 'gpt-image',
  modality: 'image',
  bodyShape: 'openai-flat',
  endpoint: '/v1/images/generations',
  promptMaxLength: 20_000,
  fields: [
    {
      key: 'size',
      labelKey: 'size',
      default: 'auto',
      spec: {
        kind: 'enum',
        options: [
          { value: 'auto' },
          { value: '1024x1024' },
          { value: '1536x1024' },
          { value: '1024x1536' },
        ],
      },
    },
    {
      key: 'quality',
      labelKey: 'quality',
      default: 'auto',
      spec: {
        kind: 'enum',
        options: [
          { value: 'auto' },
          { value: 'low' },
          { value: 'medium' },
          { value: 'high' },
        ],
      },
    },
    {
      key: 'n',
      labelKey: 'count',
      default: 1,
      spec: { kind: 'number', min: 1, max: 4, step: 1 },
    },
  ],
}

const GPT_IMAGE_2: ModelSpec = {
  id: 'gpt-image-2',
  modality: 'image',
  bodyShape: 'kie-nested',
  endpoint: '/v1/images/generations',
  promptMaxLength: 20_000,
  fields: [
    {
      key: 'aspect_ratio',
      labelKey: 'aspectRatio',
      default: 'auto',
      spec: {
        kind: 'enum',
        options: [
          { value: 'auto' },
          { value: '1:1' },
          { value: '3:2' },
          { value: '2:3' },
          { value: '4:3' },
          { value: '3:4' },
          { value: '16:9' },
          { value: '9:16' },
          { value: '21:9' },
          { value: '9:21' },
          { value: '2:1' },
          { value: '1:2' },
        ],
      },
    },
    {
      key: 'resolution',
      labelKey: 'resolution',
      default: '1K',
      spec: {
        kind: 'enum',
        options: [{ value: '1K' }, { value: '2K' }, { value: '4K' }],
      },
      hintKey: 'gptImage2ResolutionHint',
    },
  ],
}

const FLUX: ModelSpec = {
  id: 'flux',
  modality: 'image',
  bodyShape: 'openai-flat',
  endpoint: '/v1/images/generations',
  promptMaxLength: 4000,
  fields: [
    {
      key: 'size',
      labelKey: 'size',
      default: '1024x1024',
      spec: {
        kind: 'enum',
        options: [
          { value: '1024x1024' },
          { value: '1024x768' },
          { value: '768x1024' },
          { value: '1344x768' },
          { value: '768x1344' },
          { value: '1536x640' },
        ],
      },
    },
    {
      key: 'n',
      labelKey: 'count',
      default: 1,
      spec: { kind: 'number', min: 1, max: 4, step: 1 },
    },
  ],
}

const STABLE_DIFFUSION: ModelSpec = {
  id: 'stable-diffusion',
  modality: 'image',
  bodyShape: 'openai-flat',
  endpoint: '/v1/images/generations',
  promptMaxLength: 4000,
  fields: [
    {
      key: 'size',
      labelKey: 'size',
      default: '1024x1024',
      spec: {
        kind: 'enum',
        options: [
          { value: '1024x1024' },
          { value: '1024x768' },
          { value: '768x1024' },
          { value: '512x1024' },
          { value: '1024x576' },
        ],
      },
    },
    {
      key: 'n',
      labelKey: 'count',
      default: 1,
      spec: { kind: 'number', min: 1, max: 4, step: 1 },
    },
  ],
}

const WANX: ModelSpec = {
  id: 'wanx',
  modality: 'image',
  bodyShape: 'openai-flat',
  endpoint: '/v1/images/generations',
  promptMaxLength: 4000,
  fields: [
    {
      key: 'size',
      labelKey: 'size',
      default: '1024x1024',
      spec: {
        kind: 'enum',
        options: [
          { value: '1024x1024' },
          { value: '720x1280' },
          { value: '1280x720' },
        ],
      },
    },
    {
      key: 'n',
      labelKey: 'count',
      default: 1,
      spec: { kind: 'number', min: 1, max: 4, step: 1 },
    },
  ],
}

const GENERIC_IMAGE: ModelSpec = {
  id: 'generic-image',
  modality: 'image',
  bodyShape: 'openai-flat',
  endpoint: '/v1/images/generations',
  promptMaxLength: 4000,
  fields: [
    {
      key: 'size',
      labelKey: 'size',
      default: '1024x1024',
      spec: {
        kind: 'enum',
        options: [
          { value: '1024x1024' },
          { value: '1024x768' },
          { value: '768x1024' },
        ],
      },
    },
    {
      key: 'n',
      labelKey: 'count',
      default: 1,
      spec: { kind: 'number', min: 1, max: 4, step: 1 },
    },
  ],
}

// -- Video specs ------------------------------------------------------------

const SORA: ModelSpec = {
  id: 'sora',
  modality: 'video',
  bodyShape: 'kie-nested',
  endpoint: '/v1/videos/generations',
  promptMaxLength: 4000,
  fields: [
    {
      key: 'aspect_ratio',
      labelKey: 'aspectRatio',
      default: '16:9',
      spec: {
        kind: 'enum',
        options: [{ value: '16:9' }, { value: '9:16' }, { value: '1:1' }],
      },
    },
    {
      key: 'duration',
      labelKey: 'duration',
      default: '10',
      spec: {
        kind: 'enum',
        options: [
          { value: '5' },
          { value: '10' },
          { value: '15' },
          { value: '20' },
        ],
      },
    },
    {
      key: 'resolution',
      labelKey: 'resolution',
      default: '720p',
      spec: {
        kind: 'enum',
        options: [{ value: '480p' }, { value: '720p' }, { value: '1080p' }],
      },
    },
  ],
}

const KLING: ModelSpec = {
  id: 'kling',
  modality: 'video',
  bodyShape: 'kie-nested',
  endpoint: '/v1/videos/generations',
  promptMaxLength: 1000,
  fields: [
    {
      key: 'aspect_ratio',
      labelKey: 'aspectRatio',
      default: '16:9',
      spec: {
        kind: 'enum',
        options: [{ value: '1:1' }, { value: '16:9' }, { value: '9:16' }],
      },
      required: true,
    },
    {
      key: 'duration',
      labelKey: 'duration',
      default: '5',
      spec: {
        kind: 'enum',
        options: [{ value: '5' }, { value: '10' }],
      },
      required: true,
    },
    {
      key: 'sound',
      labelKey: 'sound',
      default: false,
      spec: { kind: 'toggle' },
      required: true,
    },
  ],
}

const VEO: ModelSpec = {
  id: 'veo',
  modality: 'video',
  bodyShape: 'kie-nested',
  endpoint: '/v1/videos/generations',
  promptMaxLength: 4000,
  fields: [
    {
      key: 'aspect_ratio',
      labelKey: 'aspectRatio',
      default: '16:9',
      spec: {
        kind: 'enum',
        options: [{ value: '16:9' }, { value: '9:16' }],
      },
    },
    {
      key: 'duration',
      labelKey: 'duration',
      default: '8',
      spec: {
        kind: 'enum',
        options: [{ value: '4' }, { value: '6' }, { value: '8' }],
      },
    },
    {
      key: 'resolution',
      labelKey: 'resolution',
      default: '720p',
      spec: {
        kind: 'enum',
        options: [{ value: '720p' }, { value: '1080p' }],
      },
    },
  ],
}

/**
 * Seedance 2.0 speaks the OpenAI Video async API (`POST /v1/videos` →
 * `GET /v1/videos/:id` polling). Field names follow the backend adaptor
 * (relay/task/seedance): `seconds` is the OpenAI duration field — a string
 * on the wire — while `resolution` / `ratio` / `watermark` pass through to
 * Ark. The fast tier rejects 1080p at validation, so its spec drops the
 * option up front.
 */
function seedanceSpec(id: string, resolutions: string[]): ModelSpec {
  return {
    id,
    modality: 'video',
    bodyShape: 'openai-flat',
    endpoint: '/v1/videos',
    promptMaxLength: 4000,
    fields: [
      {
        key: 'resolution',
        labelKey: 'resolution',
        default: '720p',
        spec: { kind: 'enum', options: resolutions.map((value) => ({ value })) },
      },
      {
        key: 'ratio',
        labelKey: 'aspectRatio',
        default: 'adaptive',
        spec: {
          kind: 'enum',
          options: [
            { value: 'adaptive' },
            { value: '16:9' },
            { value: '9:16' },
            { value: '1:1' },
          ],
        },
      },
      {
        key: 'seconds',
        labelKey: 'duration',
        default: 5,
        asString: true,
        spec: { kind: 'number', min: 4, max: 15, step: 1 },
      },
      {
        key: 'watermark',
        labelKey: 'watermark',
        default: false,
        spec: { kind: 'toggle' },
      },
    ],
  }
}

const SEEDANCE = seedanceSpec('seedance', ['480p', '720p', '1080p'])
const SEEDANCE_FAST = seedanceSpec('seedance-fast', ['480p', '720p'])

const HAILUO: ModelSpec = {
  id: 'hailuo',
  modality: 'video',
  bodyShape: 'kie-nested',
  endpoint: '/v1/videos/generations',
  promptMaxLength: 2000,
  fields: [
    {
      key: 'aspect_ratio',
      labelKey: 'aspectRatio',
      default: '16:9',
      spec: {
        kind: 'enum',
        options: [{ value: '16:9' }, { value: '9:16' }, { value: '1:1' }],
      },
    },
    {
      key: 'duration',
      labelKey: 'duration',
      default: '6',
      spec: {
        kind: 'enum',
        options: [{ value: '6' }, { value: '10' }],
      },
    },
  ],
}

const GENERIC_VIDEO: ModelSpec = {
  id: 'generic-video',
  modality: 'video',
  bodyShape: 'kie-nested',
  endpoint: '/v1/videos/generations',
  promptMaxLength: 2000,
  fields: [
    {
      key: 'aspect_ratio',
      labelKey: 'aspectRatio',
      default: '16:9',
      spec: {
        kind: 'enum',
        options: [
          { value: '16:9' },
          { value: '9:16' },
          { value: '1:1' },
        ],
      },
    },
    {
      key: 'duration',
      labelKey: 'duration',
      default: '5',
      spec: {
        kind: 'enum',
        options: [{ value: '5' }, { value: '10' }],
      },
    },
  ],
}

// -- Matcher table ----------------------------------------------------------

interface Matcher {
  test: RegExp
  spec: ModelSpec
}

// Matchers run in order — first hit wins. More-specific patterns (e.g.
// `gpt-image-2`) must precede broader ones (e.g. `gpt-image`).
const IMAGE_MATCHERS: Matcher[] = [
  { test: /^gpt-image-2/, spec: GPT_IMAGE_2 },
  { test: /^gpt-image/, spec: GPT_IMAGE },
  { test: /^dall-e-3/, spec: DALLE3 },
  { test: /^dall-e-2/, spec: DALLE2 },
  { test: /flux/, spec: FLUX },
  { test: /stable[-_]diffusion|sdxl/, spec: STABLE_DIFFUSION },
  { test: /^wanx/, spec: WANX },
]

const VIDEO_MATCHERS: Matcher[] = [
  { test: /^sora/, spec: SORA },
  { test: /kling/, spec: KLING },
  { test: /^veo/, spec: VEO },
  // fast first: "seedance-2.0-fast" / "doubao-seedance-2-0-fast-260128"
  // must not fall through to the spec that offers 1080p.
  { test: /seedance.*fast/, spec: SEEDANCE_FAST },
  { test: /seedance/, spec: SEEDANCE },
  { test: /hailuo|minimax-video/, spec: HAILUO },
]

/**
 * Returns the spec for a model name. Falls back to the generic spec for the
 * given modality when no matcher hits — so the UI never shows an empty params
 * panel even for unknown models.
 */
export function resolveModelSpec(modality: Modality, modelName: string): ModelSpec {
  if (!modelName) {
    return modality === 'image' ? GENERIC_IMAGE : GENERIC_VIDEO
  }
  const lower = modelName.toLowerCase()
  // Match against the full name first, then the slug-stripped form. Two-pass
  // because slug shape is ambiguous: "anthropic/claude-3-opus" wants the
  // suffix ("claude-3-opus") but "kling-2.6/text-to-video" needs the prefix
  // ("kling-2.6"). Full-first lets brand-prefix regexes hit before the
  // generic suffix gets a chance to match nothing.
  const slash = lower.lastIndexOf('/')
  const stripped = slash >= 0 && slash < lower.length - 1 ? lower.slice(slash + 1) : null
  const matchers = modality === 'image' ? IMAGE_MATCHERS : VIDEO_MATCHERS
  for (const m of matchers) {
    if (m.test.test(lower)) return m.spec
    if (stripped && m.test.test(stripped)) return m.spec
  }
  return modality === 'image' ? GENERIC_IMAGE : GENERIC_VIDEO
}

/** Returns the default-valued params object for a spec, keyed by field key. */
export function defaultParamsFor(spec: ModelSpec): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of spec.fields) out[f.key] = f.default
  return out
}

/**
 * Builds the JSON request body to POST to the spec's endpoint.
 * `params` should only contain keys defined on the spec — unknown keys are
 * dropped to keep upstream requests clean.
 */
export function buildRequestBody(
  spec: ModelSpec,
  model: string,
  prompt: string,
  params: Record<string, unknown>,
  extras?: { inputUrls?: string[] },
): Record<string, unknown> {
  const fieldByKey = new Map(spec.fields.map((f) => [f.key, f]))
  const filtered: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params)) {
    const field = fieldByKey.get(k)
    if (!field) continue
    filtered[k] = field.asString ? String(v) : v
  }

  if (spec.bodyShape === 'openai-flat') {
    return { model, prompt, ...filtered }
  }
  const input: Record<string, unknown> = { prompt, ...filtered }
  if (extras?.inputUrls?.length) input.input_urls = extras.inputUrls
  return { model, input }
}
