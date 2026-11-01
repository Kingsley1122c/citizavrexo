# CITIZAVREXO identity guidelines

## Idea

The CITIZAVREXO symbol is an architectural C: an open, stable frame with an emerald inner rail and champagne-cut terminals. It expresses protected movement, clarity, and international reach without relying on arrows, coins, globes, or initials inside generic shields.

## Primary assets

- `public/brand/logo-horizontal-light.svg`: primary signature for light surfaces.
- `public/brand/logo-horizontal-dark.svg`: reverse signature for midnight or dark surfaces.
- `public/brand/logo-symbol.svg`: standalone symbol on light or transparent surfaces.
- `public/brand/logo-symbol-dark.svg`: reverse standalone symbol for dark surfaces.
- `public/brand/wordmark.svg`: wordmark-only applications where the symbol is already established nearby.
- `public/favicon.svg`: scalable browser icon with a midnight tile.
- `public/icons/`: 32px, 48px, Apple touch, and Android raster exports.
- `public/brand/og-citizavrexo.png`: 1200x630 social sharing image.

## Color

| Role | Name | Value |
| --- | --- | --- |
| Foundation | Midnight Navy | `#091C33` |
| Depth | Secondary Navy | `#122B49` |
| Digital accent | Emerald Teal | `#18C6B1` |
| Accessible teal | Strong Teal | `#0F9D96` |
| Distinction | Champagne Gold | `#D8B56A` |
| Reverse foreground | Ivory | `#F4F8FB` |

Use midnight and ivory for dominant contrast. Emerald identifies interaction and movement. Champagne is a precision accent, not a general interface color.

## Clear space and size

Keep clear space around the signature equal to the width of the symbol's navy stem. Do not place text, borders, or controls inside that area.

- Minimum horizontal signature width: 150px digital, 35mm print.
- Minimum standalone symbol: 24px digital, 8mm print.
- Use the dedicated raster icon at 48px and below.

## Correct use

- Use the light signature on white, ivory, or pale neutral surfaces.
- Use the dark signature on midnight navy or similarly dark, quiet surfaces.
- Preserve the supplied proportions and colors.
- Keep the wordmark uppercase and spell `CITIZAVREXO` exactly.

Do not rotate the symbol, alter the terminal angles, add shadows or gradients, recolor individual elements, tighten the clear space, or place the signature on visually noisy imagery.

## Asset generation

Run `powershell -ExecutionPolicy Bypass -File scripts/generate-brand-assets.ps1` from the repository root after changing source geometry. Confirm output dimensions and inspect the 32px asset before release.