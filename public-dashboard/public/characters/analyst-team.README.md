# Analyst Team Sprite Atlas

## Asset

- File: `analyst-team.png`
- Final size: 1500 x 300 pixels, RGBA PNG.
- Layout: one horizontal row of five equal 300 x 300 square cells.
- Current cell roles: mint Band (Bollinger); sky-blue Tren (moving averages); pink Repo (earnings/news); coral Check (risk); gold Captain (master).
- The historical generation prompts below name GPT/Fable; these are artwork provenance, not current model assignments. All five roles now use `gpt-6.1-sol` with separate role instructions.
- Working motions are CSS transforms and pixel-chart activity indicators, not additional bitmap frames or a representation of private model reasoning. Reduced-motion settings stop these animations.
- Character centers: x = 150, 450, 750, 1050, 1350.
- Shared feet baseline: y = 255; transparent outer padding is at least 45 pixels.
- No text, logos, visible cell dividers, or props crossing cell boundaries.

## Source And Preparation

Generated on 2026-10-12 with the built-in imagegen tool and transparent_background=true. No external stock art or CLI/API fallback was used.

Initial generated source:
`D:\Codex\Home\generated_images\01a13077-2468-7381-8d59-dbe8c809d2d6\exec-af32bd0f-5764-4261-b5dd-124beacf83f8.png` (2146 x 733).

Selected source after a targeted layout/crispness edit:
`D:\Codex\Home\generated_images\01a13077-2468-7381-8d59-dbe8c809d2d6\exec-38cdee5d-e138-419d-ae15-61d13dd17f96.png` (2172 x 724).

The image tool returned a 3:1 canvas rather than the requested 5:1 atlas. For delivery, the five generated sprites were cropped from that selected source with three source pixels of additional padding around visible alpha bounds, uniformly downscaled by 210/466 with nearest-neighbor sampling, centered horizontally in equal cells, and aligned to the same baseline. The final canvas is genuinely transparent. Original sampled alpha was retained; no solid background, drawn replacement sprites, smoothing, or vector artwork was introduced.

## Generation Prompt

```text
Use case: stylized-concept
Asset type: one production PNG sprite atlas for an existing financial analyst dashboard.
Primary request: Create ONE cohesive sprite-sheet bitmap, a single horizontal strip of exactly FIVE equally sized square cells, recommended canvas 1500 pixels wide by 300 pixels high (5:1 aspect ratio), actual transparent RGBA background.
Composition/framing: Invisible equal square grid, five 300x300 cells with centers at x=150, 450, 750, 1050, 1350 and y=150 on the requested canvas. Exactly one centered full-body friendly pixel-art chibi robot analyst per cell. Each robot and all its held props fit comfortably inside the central roughly 210x210 area of its cell, leaving ample transparent padding on every side. Consistent full-body framing, character height, head size, baseline and scale across all five. Keep each entire silhouette completely inside its own cell. No dividers, no frames, no objects crossing cell boundaries. Do not add outer background margins that change the five-square-cell geometry.
Subjects in exact left-to-right order:
1. Mint green Bollinger-band analyst robot holding binoculars; subtle stacked parallel band-line detail on its chest, no lettering.
2. Sky-blue moving-average analyst robot holding a small ruler and miniature chart board with a simple pixel line graph, no numbers or letters.
3. Pink GPT analyst robot with distinctive square glasses.
4. Coral Fable analyst robot holding a small open notebook, no words or glyphs.
5. Gold master analyst robot wearing a small cap.
Style/medium: Crisp authentic 16-bit dot graphics, old-school game sprite pixel art. Visible square pixel clusters, clean stepped dark outlines, limited color palettes with a few flat pixel shadow and highlight tones. Friendly expressive robot faces, compact mechanical bodies, large chibi heads, small legs. All five are recognizably different but clearly members of the same designed team.
Constraints: True transparency around sprites and between all five characters, including at all outer edges. Transparent areas must have alpha 0, not a drawn checkerboard. No text, no labels, no logos, no watermark. No background scene, no floor, no cast shadows, no extra characters or floating decorations. No smooth vector appearance, no antialias blur, no gradients, no 3D rendering. Output one PNG atlas, not five separate files.
```

## Targeted Edit Prompt

```text
Use case: precise-object-edit
Asset type: single production transparent PNG sprite atlas.
Edit target: the supplied five-robot image.
Correct ONLY the atlas layout and raster crispness. Keep the same five robot identities, colors, props, left-to-right order, friendly faces, and full-body poses. Mint binocular robot, sky-blue ruler/chart robot, pink glasses robot, coral notebook robot, gold cap robot.
The current canvas is too tall and does not have square cells. Final bitmap must be a very wide, very short 5:1 canvas: 1500x300 pixels. Exactly five invisible 300x300 square cells in one row; centers (150,150), (450,150), (750,150), (1050,150), (1350,150). Fit each robot plus props inside a 210x210 bounding box centered in its own cell, with at least 45 pixels genuine transparent padding on ALL FOUR sides of each cell. All robot heads/bodies have matched scale and feet share one baseline. All five must remain fully visible; no cropping, no cell-boundary crossing. Reduce all five sprites uniformly in size to fit the short canvas, do NOT stretch robots.
Keep authentic 16-bit game pixel art: crisp square pixel clusters, clean stepped outlines, flat opaque interior colors, sharp unblurred edges, no smooth vector lines or gradients. Transparency everywhere outside sprites, including cell gaps and outer padding. Background is real alpha zero, not black/white/checkerboard paint. No text, logos, frames, floor, shadows, extra people, or extra props. Return just ONE 1500x300 RGBA PNG horizontal five-square-cell atlas.
```

