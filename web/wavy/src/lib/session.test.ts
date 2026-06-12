import { describe, expect, it } from 'vitest'
import { queryClient } from '@/lib/queryClient'
import { clearSessionCache } from '@/lib/session'

describe('clearSessionCache', () => {
  it('clears the React Query cache so no identity-scoped data survives an account switch', () => {
    // Simulate data cached under the previous account, including the
    // playground token whose staleTime is Infinity.
    queryClient.setQueryData(['self'], { id: 1, username: 'previous-user' })
    queryClient.setQueryData(['playground', 'token'], 'prev-user-token')

    clearSessionCache()

    expect(queryClient.getQueryData(['self'])).toBeUndefined()
    expect(queryClient.getQueryData(['playground', 'token'])).toBeUndefined()
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })
})
