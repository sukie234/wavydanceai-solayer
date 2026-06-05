/** Inline SVG <defs> for vendor logo icons — reference with <use href="#ic-openai" />. */
export function VendorIconDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <g id="ic-openai">
          <rect width="22" height="22" rx="6" fill="#10A37F" />
          <path d="M11 4.6l5.2 3v6.8l-5.2 3-5.2-3V7.6z" fill="none" stroke="#fff" strokeWidth="1.5" />
          <circle cx="11" cy="11" r="2" fill="#fff" />
        </g>
        <g id="ic-anthropic">
          <rect width="22" height="22" rx="6" fill="#D97757" />
          <path
            d="M7 16.5L11 5.5l4 11M8.6 13h4.8"
            stroke="#fff"
            strokeWidth="1.7"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <g id="ic-google">
          <rect width="22" height="22" rx="6" fill="#4285F4" />
          <path
            d="M11 4.5c.6 3.4 3.1 5.9 6.5 6.5-3.4.6-5.9 3.1-6.5 6.5-.6-3.4-3.1-5.9-6.5-6.5 3.4-.6 5.9-3.1 6.5-6.5z"
            fill="#fff"
          />
        </g>
        <g id="ic-deepseek">
          <rect width="22" height="22" rx="6" fill="#4D6BFE" />
          <path
            d="M4.5 13.5c2-5 6.5-7.5 13-6-1 4.5-4.5 8-9 8-1.6 0-3-.7-4-2z"
            fill="#fff"
          />
          <circle cx="14.5" cy="9.8" r=".9" fill="#4D6BFE" />
        </g>
        <g id="ic-qwen">
          <rect width="22" height="22" rx="6" fill="#615CED" />
          <circle cx="11" cy="11" r="5.2" fill="none" stroke="#fff" strokeWidth="1.7" />
          <path d="M13.5 13.5L17 17" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
        </g>
        <g id="ic-meta">
          <rect width="22" height="22" rx="6" fill="#0082FB" />
          <path
            d="M5 14.5c0-3.8 1.6-7 3.4-7 1.3 0 2 1.4 2.6 3 .6-1.6 1.3-3 2.6-3 1.8 0 3.4 3.2 3.4 7"
            stroke="#fff"
            strokeWidth="1.7"
            fill="none"
            strokeLinecap="round"
          />
        </g>
        <g id="ic-mistral">
          <rect width="22" height="22" rx="6" fill="#FF7000" />
          <path d="M5.5 16V7h2.4l3.1 4.6L14.1 7h2.4v9h-2.3v-5l-3.2 4.4L7.8 11v5z" fill="#fff" />
        </g>
        <g id="ic-xai">
          <rect width="22" height="22" rx="6" fill="#0E1A20" />
          <path d="M6 6l10 10M16 6L6 16" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        </g>
        <g id="ic-kimi">
          <rect width="22" height="22" rx="6" fill="#1C1C2E" />
          <path
            d="M7 5.5v11M7 11l6.5-5.5M7.5 11.5l6.5 5"
            stroke="#7BE8D8"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
          />
        </g>
        <g id="ic-zhipu">
          <rect width="22" height="22" rx="6" fill="#3859FF" />
          <path
            d="M6 6.5h10L6 15.5h10"
            stroke="#fff"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <g id="ic-bfl">
          <rect width="22" height="22" rx="6" fill="#141414" />
          <text x="11" y="15.5" fontFamily="Arial" fontSize="11.5" fontWeight="700" fill="#fff" textAnchor="middle">
            F
          </text>
        </g>
        <g id="ic-runway">
          <rect width="22" height="22" rx="6" fill="#00A86B" />
          <text x="11" y="15.5" fontFamily="Arial" fontSize="11.5" fontWeight="700" fill="#fff" textAnchor="middle">
            R
          </text>
        </g>
        <g id="ic-kling">
          <rect width="22" height="22" rx="6" fill="#FF5A1F" />
          <text x="11" y="15.5" fontFamily="Arial" fontSize="11.5" fontWeight="700" fill="#fff" textAnchor="middle">
            K
          </text>
        </g>
        <g id="ic-minimax">
          <rect width="22" height="22" rx="6" fill="#F23F5D" />
          <text x="11" y="15.5" fontFamily="Arial" fontSize="11.5" fontWeight="700" fill="#fff" textAnchor="middle">
            H
          </text>
        </g>
        <g id="ic-sd">
          <rect width="22" height="22" rx="6" fill="#9D4EDD" />
          <text x="11" y="15.5" fontFamily="Arial" fontSize="11.5" fontWeight="700" fill="#fff" textAnchor="middle">
            S
          </text>
        </g>
      </defs>
    </svg>
  )
}

export function VendorIcon({ id, size = 22 }: { id: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden>
      <use href={`#${id}`} />
    </svg>
  )
}
