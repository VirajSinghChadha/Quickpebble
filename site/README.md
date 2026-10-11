# Quick Pebble marketing website

A buildless static site for Cloudflare Pages. No tracking scripts, cookies, framework, or build step. The QR library loads from cdnjs; latest installer links load from the public GitHub API. If either request fails, copy the Litecoin address directly and use the release-page fallback links.

## Files

- index.html — all page content and metadata
- style.css — responsive layouts, themes, animation, reduced-motion handling
- script.js — exact supplied release-link script plus page interactions
- images/ — eleven supplied assets with the requested names

## Test locally

Open a terminal in this folder and run:

```sh
python3 -m http.server 8000
```

Visit http://localhost:8000. Check mobile menu, theme toggle, ten accent swatches, FAQ, copy buttons and download links. Stop the server with Ctrl+C. Clipboard copying works on localhost and HTTPS; a text-selection fallback is provided elsewhere.

## Deploy free on Cloudflare Pages

1. Sign in to the Cloudflare dashboard and open Workers & Pages.
2. Choose Create application → Get started → Drag and drop your files (Pages).
3. Enter a project name, such as quick-pebble.
4. Upload the supplied zip or this folder. index.html must be at the upload root.
5. Select Deploy site, then open the returned pages.dev address.
6. For later changes, choose Create a new deployment and upload the updated folder or zip.

No build command or framework preset is required. Direct Upload projects cannot be switched to Git integration; create a separate Git-integrated project if you later want automatic deployments from GitHub.

Cloudflare documentation: https://developers.cloudflare.com/pages/get-started/direct-upload/

## Metadata before sharing

Once you know the public domain, change both social-image meta tags from images/hero-home.png to the full HTTPS image URL. Add og:url and a canonical link for that domain. No domain has been guessed.

## Notes

Copy follows the supplied brief. The screenshots contain sample weather, news and AI answers. Theme swatches demonstrate website accent changes; they do not recolor screenshots. Screen mode sends screenshots to Google Gemini. This page contains no account signup backend and links visitors to the desktop download.

Validated: 360px and 1440px layouts, no 360px horizontal overflow, manual theme and accent selection, FAQ expansion, donation copy confirmation, generated QR image, latest download resolution, and no browser console errors in the preview.
