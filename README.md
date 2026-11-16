<p align="center">
  <img src="https://themezer.net/icon.png" alt="Themezer Logo" width="192" />
</p>

<h1 align="center">Themezer Layouts</h1>
<p align="center">The layouts repository for Themezer, deployed automatically.</p>
<p align="center">
    <img src="https://github.com/ThemezerNX/Layouts/workflows/Deploy/badge.svg" alt="Deploy Status" />
</p>

This repository holds every layout and layout option on [Themezer](https://themezer.net/switch/layouts). Layout options are small JSON patches on top of a layout, so people can customize it on the website: no coding required!

## Submitting a layout or option

Read the [wiki](https://github.com/ThemezerNX/Layouts/wiki/Submitting) for the folder structure, the details file, options and their value tokens. In short:

1. Fork the repository and add your layout folder under `targets/<menu>/`, or your option under a layout's `options` folder.
2. Optionally check it locally with `bun install` and `bun run test`.
3. Open a pull request.

You only write JSON: the workflows add the UUIDs and render the layout previews (`overlay-dark.png` and `overlay-light.png`). Once the pull request is merged, Themezer imports it. Questions? Ask on the [Themezer Discord](https://discord.gg/nnm8wyM).

## Thanks To

Without layouts there wouldn't be so many awesome themes, therefore, I want to thank the awesome people who took the time to design these incredible menu layouts 🤝
