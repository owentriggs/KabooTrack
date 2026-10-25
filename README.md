# Kaboo Memory

A one-page app for **Kaboo** (a version of the card game Cabo). It opens on a home screen with:

- **Kaboo Tracker:** record the cards you've peeked at, swaps, penalty cards and the discard pile, and see how many of each rank are still unseen and roughly what each hand is worth.
- **Card Scoring:** at the end of a round, take a photo of each player's cards. The app reads the cards, adds them up, applies the Kaboo caller penalty and keeps running totals until someone reaches the game-end score. You can also tap cards in by hand, and fix any card it misreads.
- **Settings:** card values, jokers and red kings, the game-end score, the caller penalty, and the API key for photo scanning.
- **Rule book.**

### Photo scanning

Tap **Scan cards** to open the in-app camera. It outlines the cards it can see as you aim, so you know the shot is good before you take it. You can also tap **Upload** to pick a photo you already have. Card Scoring reads the cards entirely on your phone (`scan.js`). It's free, needs no account or API key, works offline, and photos never leave the device. It finds each white card against the table, straightens it, and reads the rank in its corner by comparing it with ranks drawn in several fonts.

For best results, lay the cards face up with a small gap between them, on a surface darker than the cards, and take the photo from straight above in good light. Cards it's unsure of show in orange, and any it couldn't read show as **?**: tap either to set it. The photo is shown with each card it found outlined and numbered, so you can see if one was missed.

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
| `scan.js` | Reads cards from a photo, on the device |
| `manifest.webmanifest`, `icon*.png`, `icon.svg` | App name and icons for installing it |
| `sw.js` | Offline support (service worker) |
| `.github/workflows/pages.yml` | Publishes the site to GitHub Pages |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are |

## Changing card values

Open **Settings** (or **Rules → Scoring**) in the app and tap a card to change its value. To change the defaults for everyone, edit the `VAL` line near the top of the script in `index.html`.
