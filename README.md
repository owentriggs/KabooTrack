# Kaboo Memory

A one-page card tracker for **Kaboo** (a version of the card game Cabo). Record the cards you've peeked at, swaps, penalty cards and the discard pile, and see how many of each rank are still unseen and roughly what each hand is worth.

It's a single static web page with no build step and no server. Everything is saved in your browser on your own device.

## Put it online with GitHub Pages

1. Get these files onto the repository's `main` branch, at the top level.
2. On GitHub, open the repository's **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**, pick **main** and **/ (root)**, then **Save**.
4. After a minute or so the site is live at `https://<your-username>.github.io/KabooTrack/`.

On a free GitHub account, Pages only works if the repository is **public**.

## Use it on your phone

Open the link, then:

- **iPhone (Safari):** Share → **Add to Home Screen**
- **Android (Chrome):** menu ⋮ → **Add to Home screen** / **Install app**

It then opens full screen like an app. Once it has loaded, it keeps working without a connection.

## Run it locally

Open `index.html` in a browser. (Offline mode only turns on when the page is served over HTTPS, for example from GitHub Pages.)

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app |
| `manifest.webmanifest`, `icon*.png`, `icon.svg` | Home-screen name and icons |
| `sw.js` | Offline cache |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are |

## Changing card values

Open **Rules → Scoring** in the app and tap a card to change its value. To change the defaults for everyone, edit the `VAL` line near the top of the script in `index.html`.
