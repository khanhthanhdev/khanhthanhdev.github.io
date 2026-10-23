# Screen Works Visual & Motion Style Guide

Oct 24, 2026 · @khanhthanhdev

## The style in one paragraph

This is the **technical-drawing explainer** style: one sentence per scene, one figure per idea, drawn as precise hairline diagrams on warm paper, with color reserved for the thing that matters. It reads like a well-made textbook plate that moves. Screen Works (cream paper, 3D exploded stacks) and Image Compression (white paper, grids, numbers, plots) are two dialects of the same system.

Six principles carry the look:

1. **One idea per frame.** Each scene states its point as a single short sentence, top left, then shows the figure that proves it. No title + subtitle + body stacks.
2. **Paper, ink, and one signal color.** The canvas is near-white or cream; drawing is near-black ink; one saturated accent (or a small set of meaning-coded colors) marks what to look at. Everything else is grey.
3. **Line before fill.** Objects are drawn as outlines with hairline-to-line strokes; flat fills are pale and used for surfaces, not decoration. No gradients, no drop shadows, no textures.
4. **Label like an engineer.** Names are small spaced capitals with a straight leader line and a dot at the anchor. Numbers are in a monospaced face. Labels sit outside the figure, aligned in a column.
5. **Lots of empty space.** Figures sit at about 40–60% of the frame. A 160 px margin (on 1920 wide) is never crossed.
6. **Motion explains, never decorates.** Things enter in reading order with short eased fades and small rises, then hold still long enough to read. Movement is used to show cause and effect (a beam travels, a layer separates, a value fills in).

## Color

About 90% of any frame is paper and grey; ink is about 8%; signal color is 2% or less. Colors are always named by meaning (accent, light, channel, format), never by hue, and every hex lives in one token file.

### Neutrals (both projects)

| Role               | Screen Works (warm) | Image Compression (clean) | Use                                                     |
| ------------------ | ------------------- | ------------------------- | ------------------------------------------------------- |
| background / paper | #F4F1EA             | #FFFFFF                   | Whole canvas                                            |
| panel              | —                   | #F7F7F7                   | Quiet card or plot area behind a figure                 |
| grid / rule        | #DDD8CC             | #DFDFDF                   | Table rules, axes, empty cells, inactive boxes          |
| muted              | #6E727B             | #808080                   | Secondary labels, arrows between stages, units, sources |
| metal / mid grey   | #8D919A             | —                         | Hardware bodies, inactive parts                         |
| dark               | #33363D             | #333333                   | Dark surfaces (polarizer slats, screens off)            |
| text / ink         | #16181D             | #18181B                   | All lines, captions, labels                             |
| night              | #060709             | #1A1A1A                   | Dark screens and the rare dark scene                    |

Pick the warm set for physical or historical subjects, the clean white set for data, code and numbers.

### Signal colors

| Token                               | Hex                                   | Meaning                                                             |
| ----------------------------------- | ------------------------------------- | ------------------------------------------------------------------- |
| accent                              | #1F55FF                               | Caption tick, the current step, "look here"                         |
| light                               | #FFD23A                               | Emitted light, beams, glow, energy                                  |
| light_soft                          | #FFF2B0                               | Backlights, lit surfaces, soft halos                                |
| glass                               | #DCE6EE                               | Glass, transparent layers                                           |
| organic                             | #F9D2A4                               | Skin, warm natural material                                         |
| red / green / blue                  | #F2283E / #14CF55 / #3B57FF           | Sub-pixels and RGB only                                             |
| marker (IC)                         | #FDE047                               | Highlighter box around the cell or row being discussed              |
| quant (IC)                          | #9810FA                               | One special operation (quantization) gets its own hue               |
| sign neg / pos / zero (IC)          | #1342FF / #E7000B / #DFDFDF           | Diverging values: blue below zero, red above, grey at zero          |
| format JPEG / GIF / PNG / WebP (IC) | #BB321E / #F9426A / #1342FF / #27AE60 | One fixed color per category, used everywhere that category appears |

### Rules

- **One accent at a time.** A frame has at most one "look here" color. Categorical colors appear only when the content is categorical (RGB, formats).
- **A color means one thing for the whole piece.** If blue is PNG, blue is never also "selected".
- **Highlight by tint, not by new color.** An active box mixes 18% accent into the paper fill and turns its stroke fully accent: `mix(background, accent, 0.18)`.
- **Fade toward paper, not toward transparent black.** Dimmed elements mix toward the background color so they look printed lighter, not greyed out.
- **Light is yellow, glow is stacked circles.** Six concentric circles at falling opacity (16% each) replace blur filters and keep the flat look.
- **Contrast:** ink on paper is about 16:1. The video muted greys are only 4.3:1 (#6E727B on cream) and 3.9:1 (#808080 on white), which is fine at 28 px+ video sizes but fails WCAG AA for small web text; on the web use #5F636B for muted text (about 5.3:1 on cream). Never put signal color on long text; use it for ticks, boxes, dots and lines.

## Typography

One sans family at one weight (DM Sans Medium, 500) does almost everything; hierarchy comes from size, tracking and case, never from bold. Numbers and code switch to a monospaced face; formulas to a math face.

| Role                     | Font               | Video size (1920 wide) | Web size                 | Line height | Tracking          | Case                         |
| ------------------------ | ------------------ | ---------------------- | ------------------------ | ----------- | ----------------- | ---------------------------- |
| Title                    | DM Sans 500        | 112 px                 | clamp(40px, 6vw, 72px)   | 1.05        | −3 px (−0.027em)  | Sentence                     |
| Statement                | DM Sans 500        | 70 px                  | clamp(28px, 3.6vw, 44px) | 1.15        | −1.5 px (−0.02em) | Sentence                     |
| Caption (scene sentence) | DM Sans 500        | 46 px                  | 22–28 px                 | 1.25        | −0.5 px (−0.01em) | Sentence, ends with a period |
| Label                    | DM Sans 500        | 28 px                  | 11–12 px                 | 1.2         | +4 px (+0.14em)   | ALL CAPS                     |
| Numbers, code            | Noto Sans Mono 400 | 28 px                  | 13–14 px                 | 1.2         | 0                 | As data                      |
| Math                     | STIX Two Math 400  | 44 px                  | 1.1em                    | 1.2         | 0                 | As notation                  |

Rules:

- **Big type is tight, small type is loose.** Negative tracking on titles and captions; wide +0.14em tracking on small caps labels. This contrast is the single most recognizable typographic trait.
- **Captions are full sentences in sentence case**, under about 60 characters: "An LCD pixel is a stack of layers." They state the finding, not the topic.
- **Labels are nouns in caps**: POLARIZER, FRAME BUFFER, CHUNK 1: 8 WEIGHTS. Two to four words.
- **Big numbers stand alone.** A hero value (256, 63 → 17) is set at title size in the sans, with a caps label beside it at label size: `256 BOXES`.
- **Real typography in numbers:** thousands separators (16,777,216), a true minus (−), a true times (×), superscript exponents (10⁻¹⁴).
- **Ship the font.** DM Sans and Noto Sans Mono are OFL; keep the license next to the file and self-host it on the web.

## Layout, spacing and surfaces

Every frame uses the same skeleton: caption top left, figure in the optical center, labels in a column to the right of the figure, a source or note line in muted caps at the bottom.

- **Margin:** 160 px on a 1920 × 1080 frame (8.3% of width). On the web, `max(16px, 8vw)` side padding, with content capped at about 1200 px.
- **Caption position:** baseline at y = 150, x = margin. A 6 px wide accent tick, 0.9 em tall, sits at the margin; text starts 28 px to its right.
- **Base gap:** 24 px. Leader line length: 56 px. Group spacing is 2–3 gaps; never invent an in-between value.
- **Strokes:** hairline 1.5 px (leaders, table rules, back edges), line 2.5 px (outlines, boxes, arrows), bold 4 px (one emphasized path). Scale by about 0.5 for the web at 1×.
- **Corner radius:** 4–6 px on boxes and badges. Data cells and pixels are square (0 radius).
- **No shadows, no gradients, no blur.** Depth comes from 3D projection, overlap, and a slightly darker side face. Glows are stacked flat circles.
- **Side-by-side comparisons** use equal-size panels on one baseline with a caps label above each (ORIGINAL · LUMA BLURRED · COLOUR BLURRED) and the measured number below.
- **Provenance badge:** when a figure is simplified, a small outlined caps badge sits top right: TOY, SCHEMATIC, PARAPHRASED. Honesty is part of the look.
- **Portrait (9:16):** keep content inside x 90–990 and y 200–1500 of 1080 × 1920; the caption moves into its own strip above the figure, at a larger size (60 px).

## Figures and diagrams

Figures are drawn, not illustrated: geometry from real dimensions or real data, ink outlines, pale flat fills, and labels outside the shape. The recurring figure types:

| Figure                      | How it is drawn                                                                                                                                                                                                                               | Seen in                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Exploded 3D stack           | Slabs in perspective (about 20–30° pitch), separated vertically; only faces that point at the camera are drawn; top face pale, side face slightly darker; 2.5 px ink edges; labels in a right-hand column with leaders to a dot on each layer | LCD stack, OLED layers, polarizer      |
| Cutaway / technical drawing | Outline of the device with hidden edges dashed (dash 1 : gap 1.4); one colored path (beam, light) shows the mechanism                                                                                                                         | CRT gun, shadow mask                   |
| Pixel / cell grid           | Square cells, hairline rules, outer frame at line weight; values in mono, centered; highlighted cell gets a marker-yellow or accent box grown by a few px                                                                                     | 8×8 blocks, LZW tables, RGBA byte rows |
| Pipeline strip              | Rounded boxes (radius 6) with caps labels, joined by muted arrows with filled heads; the active stage is tinted 18% accent                                                                                                                    | GIF: palette → LZW; WebP stages        |
| Plot                        | Two axis lines only, a zero line when zero is in range, no gridlines; small dots with a hairline path; caps axis label in muted grey                                                                                                          | Weights, quality vs size               |
| 3D scatter / cube           | Oblique wire box with hairline edges, points colored by their own RGB value                                                                                                                                                                   | Color spaces, median cut               |
| Image panels                | Real photos at native size or smaller, never upscaled; equal panels on one baseline                                                                                                                                                           | Blur and subsampling comparisons       |
| Timeline                    | One hairline axis, small red dots, caps date + short fact stacked beside each                                                                                                                                                                 | LZW patent history                     |

Drawing rules:

- **Draw the mechanism, not a picture of the thing.** Show the beam, the layer order, the byte offset; omit casings and logos.
- **One colored element per figure** carries the story (the beam, the active cell, the light). The rest is ink and grey.
- **Labels:** dot (radius 4) at the anchor, straight 1.5 px leader, caps label after a half-gap. Align label text in a column; leaders may angle, labels may not.
- **Arrows:** filled triangular head, head length max(4 × stroke, 12 px), width 1.1 × head; shaft stops at the head base.
- **Color-coded values:** signed numbers use the diverging blue/grey/red set, and the cell's fill is a light tint of that color so the number stays readable.
- **Use real data.** Numbers on screen are measured from the actual file or algorithm. If a figure is simplified, badge it.

## Motion

Motion is quick to arrive, quicker to leave, and then still. Four durations and four easings cover every animation.

| Token            | Value                   | Use                                                                                                   |
| ---------------- | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| motion.enter     | 0.5 s, ease-out         | Anything appearing: fade + small rise                                                                 |
| motion.exit      | 0.25 s, ease-in         | Anything leaving (exits are half as long as entrances)                                                |
| motion.stagger   | 0.09 s                  | Delay between siblings (list items, layers, cells, labels)                                            |
| motion.crossfade | 0.5 s                   | Scene change: new paper covers the old scene                                                          |
| motion.travel    | 0.8 s, ease-in-out      | Objects moving from A to B, layers separating, camera moves                                           |
| easing.settle    | spring m=1, k=170, c=19 | Pops: a value landing, a box snapping in. Damping ratio 0.73, overshoots 3.5%, settles in about 0.6 s |

Choreography patterns:

1. **Caption in.** The accent tick grows from 0 to 6 px wide over 0.5 s; 0.135 s later (1.5 × stagger) the words fade in while rising 28 px into place. On exit everything fades in 0.25 s and drifts up 12 px.
2. **Figure builds in reading order.** Top to bottom or left to right, one element per stagger step. A 6-layer stack takes about 0.5 s to start all layers.
3. **Labels after the thing they name.** A callout's leader grows from the anchor dot toward the label while the text fades in; it starts after its object has mostly arrived.
4. **Pipeline stages** rise 16 px and fade in one by one; the arrow into a stage appears with it; the active stage tints toward the accent.
5. **Explain by moving.** Layers pull apart with travel easing to reveal a stack; a beam extends along its path; a highlight box slides from cell to cell instead of jumping.
6. **Scene change.** The next scene paints its own paper over the old one, reaching full opacity at 85% of the crossfade, so nothing disappears before it is covered. No wipes, zooms or spins.
7. **Hold.** After a build, leave the frame still for at least as long as it takes to read the caption aloud (roughly 2–3 s).

Sizes of movement: rises are 12–28 px at 1080p (about 1–2.5% of height; 8–16 px on the web). Nothing scales from 0, rotates, or bounces more than the settle spring allows.

## Bringing it to the web

Port the token file to CSS custom properties, draw figures as inline SVG that inherit those properties, and trigger the build when the figure scrolls into view.

### 1. Tokens

```css
@font-face {
  font-family: "DM Sans";
  src: url(/fonts/DMSans-Medium.woff2) format("woff2");
  font-weight: 500;
  font-display: swap;
}

:root {
  /* neutrals: warm dialect; swap for #FFFFFF / #F7F7F7 / #DFDFDF / #808080 for the clean one */
  --paper: #f4f1ea;
  --grid: #ddd8cc;
  --muted: #5f636b;
  --metal: #8d919a;
  --dark: #33363d;
  --ink: #16181d;
  --night: #060709;
  /* signal */
  --accent: #1f55ff;
  --light: #ffd23a;
  --light-soft: #fff2b0;
  --glass: #dce6ee;
  --red: #f2283e;
  --green: #14cf55;
  --blue: #3b57ff;
  --marker: #fde047;
  --accent-tint: color-mix(in srgb, var(--accent) 18%, var(--paper));
  /* type */
  --font: "DM Sans", system-ui, sans-serif;
  --mono: "Noto Sans Mono", ui-monospace, monospace;
  /* space and stroke */
  --gap: 24px;
  --leader: 56px;
  --margin: max(16px, 8vw);
  --hairline: 1px;
  --line: 1.5px;
  --bold: 2.5px;
  /* motion */
  --enter: 500ms;
  --exit: 250ms;
  --stagger: 90ms;
  --travel: 800ms;
  --ease-enter: cubic-bezier(0.33, 1, 0.68, 1);
  --ease-exit: cubic-bezier(0.32, 0, 0.67, 0);
  --ease-travel: cubic-bezier(0.65, 0, 0.35, 1);
  --ease-settle: linear(
    0,
    0.063,
    0.207,
    0.379,
    0.548,
    0.696,
    0.814,
    0.903,
    0.964,
    1.003,
    1.024,
    1.034,
    1.035,
    1.032,
    1.026,
    1.02,
    1.014,
    1.01,
    1.006,
    1.003,
    1.001
  ); /* 600ms */
}

body {
  background: var(--paper);
  color: var(--ink);
  font: 500 17px/1.5 var(--font);
}
.caption {
  font-size: clamp(22px, 2.4vw, 28px);
  line-height: 1.25;
  letter-spacing: -0.01em;
}
.label {
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.num {
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
}
```

The `--ease-settle` stops are sampled from the exact spring (m=1, k=170, c=19) over 600 ms. The three bezier curves are cubic ease-out, ease-in and ease-in-out.

### 2. Caption with the accent tick

```html
<h2 class="caption reveal"><span class="tick"></span>An LCD pixel is a stack of layers.</h2>
```

```css
.caption {
  position: relative;
  padding-left: 18px;
}
.caption .tick {
  position: absolute;
  left: 0;
  top: 0.12em;
  width: 4px;
  height: 0.9em;
  background: var(--accent);
  transform-origin: left;
  transform: scaleX(0);
  transition: transform var(--enter) var(--ease-enter);
}
.caption.reveal {
  opacity: 0;
  translate: 0 16px;
  transition:
    opacity var(--enter) var(--ease-enter) calc(var(--stagger) * 1.5),
    translate var(--enter) var(--ease-enter) calc(var(--stagger) * 1.5);
}
.in .caption.reveal,
.caption.reveal.in {
  opacity: 1;
  translate: 0 0;
}
.in .caption .tick,
.caption.in .tick {
  transform: scaleX(1);
}
```

### 3. Staggered figure build

```css
.build > * {
  opacity: 0;
  translate: 0 12px;
  transition:
    opacity var(--enter) var(--ease-enter),
    translate var(--enter) var(--ease-enter);
  transition-delay: calc(var(--i, 0) * var(--stagger));
}
.build.in > * {
  opacity: 1;
  translate: 0 0;
}

/* a leader line that draws from its anchor */
.leader {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  transition: stroke-dashoffset var(--enter) var(--ease-enter);
}
.build.in .leader {
  stroke-dashoffset: 0;
}

@media (prefers-reduced-motion: reduce) {
  .build > *,
  .caption.reveal,
  .caption .tick,
  .leader {
    transition: none;
    opacity: 1;
    translate: none;
    transform: none;
    stroke-dashoffset: 0;
  }
}
```

```js
const io = new IntersectionObserver(
  (es) =>
    es.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    }),
  { threshold: 0.35 }
);
document.querySelectorAll(".build, .reveal").forEach((el) => {
  [...el.children].forEach((c, i) => c.style.setProperty("--i", i));
  io.observe(el);
});
```

Give each leader `pathLength="1"` so the dash trick works on any length.

### 4. SVG figure recipe (labelled layer)

```html
<svg viewBox="0 0 640 360" class="build" role="img" aria-label="Exploded LCD stack">
  <g style="--i:0">
    <polygon points="120,200 360,200 420,160 180,160" fill="var(--light-soft)" stroke="var(--ink)" stroke-width="1.5" stroke-linejoin="round" />
    <circle cx="400" cy="174" r="3" fill="var(--ink)" />
    <line class="leader" pathLength="1" x1="400" y1="174" x2="470" y2="174" stroke="var(--ink)" stroke-width="1" />
    <text x="482" y="178" class="label" fill="var(--ink)">BACKLIGHT</text>
  </g>
  <!-- next layer: same group, --i:1, 40px higher -->
</svg>
```

For glows, stack six circles with `fill-opacity: .16` at radii r, 5r/6 … r/6 instead of `filter: blur()`. For larger 3D figures, project points in JS (a small orbit camera like `Cam::orbit` in `src/kit.rs`) and emit polygons; skip faces whose normal points away.

## Review checklist

Run every new figure, page section or animation through this list before shipping.

- [ ] The section states its point in one sentence-case caption with an accent tick.
- [ ] Paper background; at most one signal color carries the message; other colors only where the data is categorical.
- [ ] Every color comes from a named token and keeps one meaning across the whole piece.
- [ ] Strokes are hairline / line / bold only; no shadows, gradients or blur.
- [ ] Labels are spaced caps with a dot and a straight leader, aligned in a column outside the figure.
- [ ] Numbers use the mono face, separators, true minus and times signs.
- [ ] Margins and gaps are multiples of the 24 px gap; nothing crosses the margin.
- [ ] Entrances 500 ms ease-out with 90 ms stagger; exits 250 ms ease-in; moves 800 ms ease-in-out.
- [ ] Elements build in reading order, labels after their objects, then the frame holds still.
- [ ] Motion shows a cause or a change; nothing spins, zooms from 0 or loops for decoration.
- [ ] Simplified figures carry a TOY, SCHEMATIC or PARAPHRASED badge; values come from real data.
- [ ] `prefers-reduced-motion` shows the final state; muted text passes 4.5:1 contrast.
- [ ] Fonts and images are self-hosted with their licenses beside them.

Source of these values: `screen-works/style/tokens.json`, `screen-works/src/kit.rs`, `image-compression/style/tokens.json` and `image-compression/src/kit.rs`, plus frames from both rendered videos.
