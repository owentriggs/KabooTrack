# Kaboo Memory

A one-page card tracker for **Kaboo** (a version of the card game Cabo). Record the cards you've peeked at, swaps, penalty cards and the discard pile, and see how many of each rank are still unseen and roughly what each hand is worth.

It's a single static web page with no build step and no server. Everything is saved in your browser on your own device.

## Put it online with GitHub Pages

The site is live at **https://owentriggs.github.io/KabooTrack/**.

Every push to `main` runs a workflow (`.github/workflows/pages.yml`) that copies the site into the `gh-pages` branch, and GitHub Pages serves it from there. The site updates about a minute later. Edit files on `main` only, because `gh-pages` is overwritten on every deploy.

If Pages ever gets switched off, turn it back on in **Settings → Pages**: choose **Deploy from a branch**, then **gh-pages** and **/ (root)**.

On a free GitHub account, Pages only works if the repository is **public**.

## Use it on your phone

Open the link, then:

- **iPhone (Safari):** Share → **Add to Home Screen**
- **Android (Chrome):** menu ⋮ → **Add to Home screen** / **Install app**

It then opens full screen like an app. After the first visit it works fully offline: the app, its font and your saved game all come from the phone. When you're online it fetches any update in the background, and the update shows up the next time you open it.

## Run it locally

Open `index.html` in a browser. (Offline mode needs the page served over HTTPS or from `localhost`, for example `python3 -m http.server`.)

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app |
| `manifest.webmanifest`, `icon*.png`, `icon.svg` | App name and icons for installing it |
| `sw.js` | Offline support (service worker) |
| `.github/workflows/pages.yml` | Publishes the site to GitHub Pages |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are |

## Changing card values

Open **Rules → Scoring** in the app and tap a card to change its value. To change the defaults for everyone, edit the `VAL` line near the top of the script in `index.html`.
