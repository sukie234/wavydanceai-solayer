const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, Footer, AlignmentType, LevelFormat, HeadingLevel, BorderStyle,
        WidthType, ShadingType, PageNumber, PageBreak, TabStopType, TabStopPosition } = require('docx');

const INK = "07394A", CYAN = "3FB3D9", CYANINK = "2E8FB0", MINT = "4ED4DC",
      MINTINK = "2FA3B3", GLASS = "B5ECF2", CORAL = "F49BAB", DRIFT = "3F7A8C";

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const p = (t, opts={}) => new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: t, ...opts })] });
const bullet = (t) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 80 }, children: [new TextRun(t)] });

function colorRow(name, hex, role) {
  return new TableRow({
    children: [
      new TableCell({ borders, width: { size: 1800, type: WidthType.DXA }, margins: cellMargins,
        shading: { fill: hex, type: ShadingType.CLEAR },
        children: [new Paragraph({ children: [new TextRun({ text: " ", color: hex })] })] }),
      new TableCell({ borders, width: { size: 2200, type: WidthType.DXA }, margins: cellMargins,
        children: [new Paragraph({ children: [new TextRun({ text: name, bold: true })] })] }),
      new TableCell({ borders, width: { size: 1700, type: WidthType.DXA }, margins: cellMargins,
        children: [new Paragraph({ children: [new TextRun({ text: "#" + hex, font: "Consolas" })] })] }),
      new TableCell({ borders, width: { size: 3660, type: WidthType.DXA }, margins: cellMargins,
        children: [new Paragraph({ children: [new TextRun(role)] })] }),
    ],
  });
}

function headerRow() {
  return new TableRow({ children: ["Swatch","Name","Hex","Role"].map((t,i) =>
    new TableCell({ borders, width: { size: [1800,2200,1700,3660][i], type: WidthType.DXA }, margins: cellMargins,
      shading: { fill: "E7F5F8", type: ShadingType.CLEAR },
      children: [new Paragraph({ children: [new TextRun({ text: t, bold: true })] })] })) });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 34, bold: true, font: "Arial", color: INK },
        paragraph: { spacing: { before: 320, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: CYANINK },
        paragraph: { spacing: { before: 240, after: 140 }, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [{
    properties: {
      page: { size: { width: 12240, height: 15840 },
              margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: CYAN, space: 4 } },
        children: [
          new TextRun({ text: "wavydance", bold: true, color: INK }),
          new TextRun({ text: ".ai", bold: true, color: CYANINK }),
          new TextRun({ text: "\tBrand Guidelines v2.0 — Jelly Sea", color: DRIFT, size: 18 }),
        ] })] }),
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        border: { top: { style: BorderStyle.SINGLE, size: 6, color: CYAN, space: 4 } },
        children: [
          new TextRun({ text: "One Wave. Every Model.", italics: true, color: DRIFT, size: 18 }),
          new TextRun({ text: "\tPage ", color: DRIFT, size: 18 }),
          new TextRun({ children: [PageNumber.CURRENT], color: DRIFT, size: 18 }),
        ] })] }),
    },
    children: [
      // Cover
      new Paragraph({ spacing: { before: 2400, after: 200 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "wavydance", bold: true, size: 72, color: INK }),
                   new TextRun({ text: ".ai", bold: true, size: 72, color: CYANINK })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 },
        children: [new TextRun({ text: "BRAND GUIDELINES — JELLY SEA EDITION", size: 28, color: DRIFT, bold: true })] }),
      new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Version 2.0 · June 2026", size: 20, color: DRIFT })] }),
      new Paragraph({ children: [new PageBreak()] }),

      // 1. Brand essence
      h1("1. Brand Essence"),
      p("wavydance.ai is a unified gateway (API relay) for large language models, built for developers and IT teams. One endpoint, one key and one bill connect users to every major LLM provider."),
      h2("Brand idea"),
      p("“The wave” is the current that carries every request to the right model and back. “The dance” is the effortless choreography of routing, failover and scaling behind one API. The Jelly Sea palette adds the feeling of a sunlit tropical lagoon: clear, translucent, effortless — infrastructure you can see straight through."),
      h2("Personality"),
      bullet("Fluent — everything flows; no friction, no lock-in."),
      bullet("Transparent — clear water, clear pricing, clear metrics."),
      bullet("Playful confidence — technical without being cold; a brand that moves."),

      // 2. Slogan
      h1("2. Slogan System"),
      h2("Primary slogan"),
      new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: "One Wave. Every Model.", bold: true, size: 32, color: CYANINK })] }),
      p("Short, rhythmic, and ownable. “One wave” = one API call / one platform; “every model” = the entire LLM ecosystem."),
      h2("Supporting line (descriptor)"),
      p("“The unified gateway to every LLM API.” — use under the logo or in meta descriptions where the product must be explained instantly."),
      h2("Chinese counterpart (for future language switch)"),
      p("一浪直达，万模归一 — “One wave reaches them all; every model in one place.”"),
      h2("Campaign / secondary lines"),
      bullet("Ride every model with one API."),
      bullet("Change one line. Unlock every model."),
      bullet("Built for the people who build."),
      bullet("Clear as water. Fast as the current. (Jelly Sea campaign line)"),

      // 3. Logo
      h1("3. Logo"),
      h2("Concept"),
      p("The mark is a “W” drawn as a continuous flowing wave, ending in a bright relay node — the moment a request lands at the right model. A fainter echo wave underneath suggests motion and the dance partner."),
      h2("Color variants"),
      bullet("Dark mode: bright Jelly gradient (Jelly Azure → Jelly Turquoise → Ice Glass) on Deep Lagoon (assets/logo-mark.svg)."),
      bullet("Light mode: deeper Ink gradient (Lagoon Ink → Turquoise Ink) on Sea Foam, so it keeps contrast on white (assets/logo-mark-light.svg)."),
      h2("Usage rules"),
      bullet("Primary lockup: mark + lowercase wordmark “wavydance” with “.ai” in the brand gradient."),
      bullet("Clear space: keep at least the height of the relay node dot around the logo."),
      bullet("Minimum size: 24 px height for the mark alone, 120 px width for the lockup."),
      bullet("Never put the bright (dark-mode) gradient on a light background — switch to the Ink variant."),
      bullet("Do not rotate, stretch, add shadows, or recolor the gradient."),

      // 4. Palette
      h1("4. Color Palette — Jelly Sea"),
      p("A dual-mode system inspired by a sunlit tropical lagoon. Dark mode is the deep lagoon at dusk; light mode is the shallow, jelly-clear water at noon. Both share the gradient “The Current” (Jelly Azure → Jelly Turquoise → Ice Glass) and Coral Pulse for CTAs."),

      h2("Dark mode — Deep Lagoon"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [1800, 2200, 1700, 3660],
        rows: [
          headerRow(),
          colorRow("Deep Lagoon", "052832", "Primary background"),
          colorRow("Tidepool", "083644", "Cards / surfaces"),
          colorRow("Reef", "12485A", "Borders, dividers"),
          colorRow("Jelly Azure", CYAN, "Primary accent, links"),
          colorRow("Jelly Turquoise", MINT, "Secondary accent, success"),
          colorRow("Ice Glass", GLASS, "Highlights, gradient end"),
          colorRow("Coral Pulse", CORAL, "CTA, alerts (sparingly)"),
          colorRow("Drift", "92C5D1", "Secondary / muted text"),
          colorRow("Sea Foam Text", "EAFBFE", "Body text on dark"),
        ],
      }),

      h2("Light mode — Shallow Lagoon"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [1800, 2200, 1700, 3660],
        rows: [
          headerRow(),
          colorRow("Sea Foam", "F3FAFC", "Primary background"),
          colorRow("Shallows", "E7F5F8", "Alternate sections / surfaces"),
          colorRow("Sea Mist", "C9E6EE", "Borders, dividers"),
          colorRow("Lagoon Ink", CYANINK, "Primary accent, links"),
          colorRow("Turquoise Ink", MINTINK, "Secondary accent, success"),
          colorRow("Jelly Glass", "8FD8E5", "Highlights, fills"),
          colorRow("Coral Pulse", CORAL, "CTA, alerts (sparingly)"),
          colorRow("Drift Ink", DRIFT, "Secondary / muted text"),
          colorRow("Lagoon Deep", INK, "Body text on light"),
        ],
      }),

      new Paragraph({ spacing: { before: 200, after: 160 }, children: [new TextRun({ text: "Brand gradient “The Current”: linear 110°, #3FB3D9 → #4ED4DC → #B5ECF2. On light backgrounds, use the Ink version for text: #2E8FB0 → #2FA3B3 → #4FB3C9.", italics: true })] }),
      h2("Accessibility"),
      bullet("Sea Foam Text on Deep Lagoon: ≈ 15:1 (AAA)."),
      bullet("Lagoon Deep on Sea Foam: ≈ 12:1 (AAA)."),
      bullet("Bright accents (Jelly Azure/Mint/Ice Glass) are for large text and UI only — never body copy on light backgrounds; use the Ink accents instead."),
      bullet("Drift / Drift Ink meet AA for secondary text in their respective modes."),

      // 5. Typography
      h1("5. Typography"),
      h2("Typefaces"),
      bullet("Display / headlines: Space Grotesk (700, 500) — geometric with a technical personality."),
      bullet("Body / UI: Inter (400–600) — neutral, highly legible at small sizes."),
      bullet("Code / data: JetBrains Mono — code samples, API keys, metrics, kickers."),
      h2("Rules"),
      bullet("Headlines: tight letter-spacing (−1 to −2 px), sentence case with a period for slogans."),
      bullet("Kickers / labels: JetBrains Mono, uppercase, +3 px letter-spacing, accent color of the active mode."),
      bullet("Never use the gradient on long text — headline keywords only."),

      // 6. Voice
      h1("6. Voice & Tone"),
      bullet("Speak developer-to-developer: concrete numbers (“<40ms overhead”), no marketing fluff."),
      bullet("Water metaphors are seasoning, not the meal — at most one per screen or paragraph."),
      bullet("Docs are dry and precise; landing pages and changelogs may dance a little."),
      bullet("English first; every string must be i18n-ready for the planned language switcher."),

      // 7. Applications
      h1("7. Applications"),
      bullet("Landing page: see index.html prototype — ships with both modes and a theme toggle (follows OS preference by default)."),
      bullet("Code blocks always stay dark (Deep Lagoon) in both modes, like sunlight hitting deep water."),
      bullet("Product tiers carry wave names: Surf (free), Current (pay-as-you-go), Tsunami (enterprise)."),
      bullet("Status page language: “All systems flowing” instead of “operational”."),
      bullet("Social avatar: dark logo mark on Deep Lagoon rounded square (assets/logo-mark.svg)."),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync("/sessions/tender-relaxed-keller/mnt/outputs/wavydance-brand/WavyDance_Brand_Guide.docx", buf);
  console.log("done");
});
