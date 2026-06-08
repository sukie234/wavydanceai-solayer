import { describe, it, expect } from 'vitest'
import {
  buildRequestBody,
  defaultParamsFor,
  resolveModelSpec,
} from './modelSpecs'

describe('resolveModelSpec', () => {
  it.each([
    ['dall-e-3', 'dall-e-3'],
    ['dall-e-2', 'dall-e-2'],
    ['gpt-image-1', 'gpt-image'],
    ['gpt-image-2-text-to-image', 'gpt-image-2'],
    ['black-forest-labs/flux-1.1-pro', 'flux'],
    ['stability-ai/stable-diffusion-3.5-large', 'stable-diffusion'],
    ['stability-ai/sdxl', 'stable-diffusion'],
    ['wanx-v1', 'wanx'],
    ['unknown-image-model', 'generic-image'],
  ])('image: %s → %s', (name, specId) => {
    expect(resolveModelSpec('image', name).id).toBe(specId)
  })

  it.each([
    ['sora-2', 'sora'],
    ['sora-1.0', 'sora'],
    ['kling-2.6/text-to-video', 'kling'],
    ['veo-3-video', 'veo'],
    ['seedance-1.0-pro', 'seedance'],
    ['hailuo-02', 'hailuo'],
    ['minimax-video-01', 'hailuo'],
    ['unknown-video-model', 'generic-video'],
  ])('video: %s → %s', (name, specId) => {
    expect(resolveModelSpec('video', name).id).toBe(specId)
  })

  it('strips vendor prefix before matching', () => {
    expect(resolveModelSpec('image', 'replicate/flux-schnell').id).toBe('flux')
    expect(resolveModelSpec('video', 'solayer/kling-v1-pro').id).toBe('kling')
  })

  it('falls back to generic when modality has no match', () => {
    // dall-e-3 is an image spec but we asked for video → fall back to
    // generic-video, since the matcher table is modality-scoped.
    expect(resolveModelSpec('video', 'dall-e-3').id).toBe('generic-video')
  })
})

describe('defaultParamsFor', () => {
  it('seeds every declared field with its default', () => {
    const spec = resolveModelSpec('image', 'dall-e-3')
    const defaults = defaultParamsFor(spec)
    expect(defaults).toEqual({
      size: '1024x1024',
      quality: 'standard',
      style: 'vivid',
    })
  })

  it('seeds toggle defaults as booleans', () => {
    const spec = resolveModelSpec('video', 'kling-2.6/text-to-video')
    const defaults = defaultParamsFor(spec)
    expect(defaults.sound).toBe(false)
  })
})

describe('buildRequestBody', () => {
  it('produces a flat body for OpenAI-shaped specs', () => {
    const spec = resolveModelSpec('image', 'dall-e-3')
    const body = buildRequestBody(spec, 'dall-e-3', 'a cat', {
      size: '1792x1024',
      quality: 'hd',
      style: 'natural',
    })
    expect(body).toEqual({
      model: 'dall-e-3',
      prompt: 'a cat',
      size: '1792x1024',
      quality: 'hd',
      style: 'natural',
    })
  })

  it('produces a nested input body for kie-style specs', () => {
    const spec = resolveModelSpec('image', 'gpt-image-2-text-to-image')
    const body = buildRequestBody(
      spec,
      'gpt-image-2-text-to-image',
      'a cat',
      { aspect_ratio: '16:9', resolution: '2K' },
    )
    expect(body).toEqual({
      model: 'gpt-image-2-text-to-image',
      input: { prompt: 'a cat', aspect_ratio: '16:9', resolution: '2K' },
    })
  })

  it('drops keys that are not declared on the spec', () => {
    const spec = resolveModelSpec('image', 'dall-e-3')
    const body = buildRequestBody(spec, 'dall-e-3', 'a cat', {
      size: '1024x1024',
      bogus: 'ignored',
    })
    expect(body).not.toHaveProperty('bogus')
  })
})
