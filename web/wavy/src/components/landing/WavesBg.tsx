export function WavesBg() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <style>{`
        @keyframes wavy-drift{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        .wavy-w1{animation:wavy-drift 18s linear infinite}
        .wavy-w2{animation:wavy-drift 28s linear infinite reverse}
        .wavy-w3{animation:wavy-drift 40s linear infinite}
      `}</style>
      <svg
        className="wavy-w3 absolute -bottom-0.5 left-0 h-[46vh] min-h-[300px] w-[200%]"
        viewBox="0 0 2880 320"
        preserveAspectRatio="none"
      >
        <path
          d="M0 160 C 240 60, 480 60, 720 160 C 960 260, 1200 260, 1440 160 C 1680 60, 1920 60, 2160 160 C 2400 260, 2640 260, 2880 160 V320 H0 Z"
          fill="#B5ECF2"
          opacity=".30"
        />
      </svg>
      <svg
        className="wavy-w2 absolute -bottom-0.5 left-0 h-[46vh] min-h-[300px] w-[200%]"
        viewBox="0 0 2880 320"
        preserveAspectRatio="none"
      >
        <path
          d="M0 200 C 240 110, 480 110, 720 200 C 960 290, 1200 290, 1440 200 C 1680 110, 1920 110, 2160 200 C 2400 290, 2640 290, 2880 200 V320 H0 Z"
          fill="#4ED4DC"
          opacity=".28"
        />
      </svg>
      <svg
        className="wavy-w1 absolute -bottom-0.5 left-0 h-[46vh] min-h-[300px] w-[200%]"
        viewBox="0 0 2880 320"
        preserveAspectRatio="none"
      >
        <path
          d="M0 240 C 240 160, 480 160, 720 240 C 960 320, 1200 320, 1440 240 C 1680 160, 1920 160, 2160 240 C 2400 320, 2640 320, 2880 240 V320 H0 Z"
          fill="#3FB3D9"
          opacity=".32"
        />
      </svg>
    </div>
  )
}
