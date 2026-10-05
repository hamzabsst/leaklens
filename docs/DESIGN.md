# LeakLens v0.2 design

The supplied visual reference uses charcoal product panels, fine ivory outlines, large typography, and a softly lit metallic object. LeakLens adapts that direction into an actual developer tool: a framed introduction with immediate file access, followed by a working analyzer and a compact command reference.

The interface self-hosts Geist for UI and headings at weights 400/500/600, and Geist Mono for code, stack traces, labels, and numbers. Two variable WOFF2 files from the official `geist` npm package (1.7.2) are preloaded from the same origin. `font-display: optional` prevents late font swaps on slow connections; system fallbacks remain usable. Local Arial/Liberation Sans and Courier New/Liberation Mono fallbacks use width-calibrated size adjustment and Geist ascent/descent overrides. The narrow hero title adapts its font size to keep the complete word visible. No existing layout, section spacing, or colors were changed for the typography update.

Font source: [Vercel Geist](https://github.com/vercel/geist-font), SIL Open Font License; the original license is included in `dist/assets/fonts/LICENSE.txt`. The font files together are approximately 141 kB. The wider canvas places the complete LeakLens title in its own row above the memory sculpture.

The sample report loads automatically and is explicitly marked as an example. Opening a log or choosing the example moves the user to the analysis. System feedback stays visible when the analyzer is in view. Reduced-motion preferences disable the introductory image animation and smooth scrolling.

## Original visual asset

- File: `dist/assets/memory-sculpture.webp`
- Purpose: a symbolic memory-chip sculpture for the introduction. It is decorative, not a diagram or a physical product claim.
- Source: original artwork generated using the built-in image generation tool, then encoded as WebP with its alpha channel preserved.
- No external font service, image service, or tracking code is used by the page.

Generation prompt:

> Use case: stylized-concept. Create a premium 3D product-render asset for a developer tool named LeakLens. Subject: three slim rounded-square computer memory / silicon chip tiles hovering as a single elegant exploded stack, tilted diagonally from upper left toward lower right, showing brushed silver metal rims, polished graphite ceramic faces and precise short metallic contact pins along one edge. The top tile is a minimalist glossy black microchip face with a subtle etched grid, the lower tiles matte titanium. Modern industrial design, realistic manufacturing finish, restrained architectural sculpture. Soft overhead studio lighting, cool silver highlights, deep charcoal reflections, one tiny muted orange detail. Strong depth and occlusion, refined rather than gaming or cyberpunk. Center the complete object with generous surrounding space; tall composition suitable for a 500px-tall website hero centerpiece. Truly transparent background, clean alpha edges, no floor or background, no text, no logos, no typography, no UI, no illustration borders.
