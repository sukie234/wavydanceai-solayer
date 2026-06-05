import { VendorIcon } from './VendorIcons'

const ITEMS = [
  { id: 'ic-openai', name: 'GPT-5.2' },
  { id: 'ic-anthropic', name: 'Claude Opus 4.6' },
  { id: 'ic-google', name: 'Gemini 3 Pro' },
  { id: 'ic-deepseek', name: 'DeepSeek-V4' },
  { id: 'ic-qwen', name: 'Qwen3-Max' },
  { id: 'ic-meta', name: 'Llama 4' },
  { id: 'ic-mistral', name: 'Mistral Large' },
  { id: 'ic-xai', name: 'Grok 4' },
  { id: 'ic-kimi', name: 'Kimi K2' },
  { id: 'ic-zhipu', name: 'GLM-5' },
]

export function Marquee() {
  return (
    <div
      id="models"
      className="overflow-hidden border-y border-[color:var(--border)] bg-[color:var(--bg2)] py-[22px]"
    >
      <style>{`@keyframes wavy-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
      <div
        className="flex w-max gap-14 whitespace-nowrap font-display text-[1rem] font-medium text-[color:var(--muted)]"
        style={{ animation: 'wavy-marquee 16s linear infinite' }}
      >
        {[...ITEMS, ...ITEMS, ...ITEMS].map((item, i) => (
          <span key={`${item.id}-${i}`} className="inline-flex items-center gap-2.5 transition hover:text-[color:var(--text)]">
            <VendorIcon id={item.id} />
            {item.name}
          </span>
        ))}
      </div>
    </div>
  )
}
