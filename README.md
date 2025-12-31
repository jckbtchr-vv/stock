# Dithering Machine

A web-based tool for creating dithered variations of images using Sierra dithering and seeded random palettes.

## Features

- **Upload Image**: Support for standard image formats.
- **Tiling Mode**: Create 2x2 grids with different dithering settings per tile.
- **Variants Generation**: Generate multiple variants at once (1-150).
- **Seeded Randomness**: Reproducible results using custom seeds.
- **Metadata Export**: Download JSON metadata for generated variants.
- **Download**: Save individual variants as PNGs.

## Usage

1. Open `index.html` in a modern web browser.
2. Click "Upload Image" to select a source image.
3. Configure settings:
    - **Tiling**: Toggle 2x2 grid mode.
    - **Variants**: Choose how many variants to generate.
    - **Seed**: Optional seed for reproducible results.
4. Click "Generate Variants".
5. Download individual images or export metadata.

## Tech Stack

- HTML5
- Vanilla JavaScript
- Tailwind CSS (via CDN)

