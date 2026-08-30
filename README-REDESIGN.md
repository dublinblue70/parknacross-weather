# Parknacross Weather – redesigned front end

This version separates the website into three clear pieces:

- `index.html` – page structure
- `style.css` – responsive visual design
- `app.js` – live weather display, status, wind compass and lightweight browser history
- `config.js` – the single place where the public Cloudflare Worker URL is entered

## Install

Replace the existing `index.html`, `style.css`, `app.js` and `config.js` in the GitHub repository with these files.

Then edit `config.js`:

```js
window.WEATHER_API_URL = "https://YOUR-WORKER.workers.dev/";
```

Do not put Ecowitt API credentials in GitHub.

## Data fields supported

The front end accepts the original fields:

- `temperature`
- `feelsLike`
- `humidity`
- `pressure`
- `windSpeed`
- `windDirection`
- `windGust`
- `rainfall`
- `uv`
- `solar`
- `updated`

It also supports optional enhanced fields:

- `windDegrees`
- `rainRate`
- `tempHigh`
- `tempLow`
- `maxGust`
- `timestamp`

If those optional fields are not returned yet, the page safely displays `--`.

## Important

The current Cloudflare Worker in the original repository still returns `null` for the mapped display fields. The redesigned page cannot create real sensor values by itself. The Worker still needs to map the actual Ecowitt API response into the display fields above.

The two 24-hour charts use readings stored locally in each visitor's browser. They begin drawing after at least two readings have been collected. For true shared historical charts across all visitors, add a persistent history store/API later.
