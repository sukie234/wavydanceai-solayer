import { describe, it, expect } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('drops falsy values', () => {
    expect(cn('a', false && 'b', null, undefined, 'c')).toBe('a c')
  })

  it('lets later tailwind classes win conflicts', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })
})
