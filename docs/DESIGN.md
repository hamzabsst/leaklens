# LeakLens v0.2 design

The supplied visual reference uses charcoal product panels, fine ivory outlines, large typography, and a softly lit metallic object. LeakLens adapts that direction into an actual developer tool: a framed introduction with immediate file access, followed by a working analyzer and a compact command reference.

The sample report loads automatically and is explicitly marked as an example. Opening a log or choosing the example moves the user to the analysis. System feedback stays visible when the analyzer is in view. Reduced-motion preferences disable the introductory image animation and smooth scrolling.

## Original visual asset

- File: `dist/assets/memory-sculpture.webp`
- Purpose: a symbolic memory-chip sculpture for the introduction. It is decorative, not a diagram or a physical product claim.
- Source: original artwork generated using the built-in image generation tool, then encoded as WebP with its alpha channel preserved.
- No external font service, image service, or tracking code is used by the page.

Generation prompt:

> Use case: stylized-concept. Create a premium 3D product-render asset for a developer tool named LeakLens. Subject: three slim rounded-square computer memory / silicon chip tiles hovering as a single elegant exploded stack, tilted diagonally from upper left toward lower right, showing brushed silver metal rims, polished graphite ceramic faces and precise short metallic contact pins along one edge. The top tile is a minimalist glossy black microchip face with a subtle etched grid, the lower tiles matte titanium. Modern industrial design, realistic manufacturing finish, restrained architectural sculpture. Soft overhead studio lighting, cool silver highlights, deep charcoal reflections, one tiny muted orange detail. Strong depth and occlusion, refined rather than gaming or cyberpunk. Center the complete object with generous surrounding space; tall composition suitable for a 500px-tall website hero centerpiece. Truly transparent background, clean alpha edges, no floor or background, no text, no logos, no typography, no UI, no illustration borders.
