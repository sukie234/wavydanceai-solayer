import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UCardCashbackBanner } from './UCardCashbackBanner'
import '@/lib/i18n'

describe('<UCardCashbackBanner>', () => {
  it('shows the Solayer U-Card brand and the 15% cashback offer', () => {
    render(<UCardCashbackBanner />)
    expect(screen.getByText('Solayer U-Card')).toBeInTheDocument()
    expect(screen.getAllByText(/15%/).length).toBeGreaterThan(0)
  })
})
