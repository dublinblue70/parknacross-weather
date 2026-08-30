# Parknacross Weather

This package contains a simple weather website designed for Ecowitt data.

## Files

- `index.html` – main webpage
- `style.css` – responsive styling
- `app.js` – loads and refreshes live weather data
- `config.js` – where you add your Cloudflare Worker URL
- `cloudflare-worker.js` – secure Ecowitt API connector template

## Recommended setup

WS90 → GW3001 → Ecowitt Cloud → Cloudflare Worker → Website → GitHub Pages

## What the page displays

- Temperature
- Feels-like temperature
- Humidity
- Pressure
- Wind speed
- Wind direction
- Wind gust
- Rainfall
- UV index
- Solar radiation

The webpage refreshes every 60 seconds.

## Important

Do not put your Ecowitt API key directly into `index.html`, `app.js` or `config.js`.
Keep the credentials in Cloudflare Worker secrets/environment variables.

The Worker currently returns the raw Ecowitt response as well as empty display
fields. Once your GW3001 is connected and your Ecowitt API credentials are
available, the exact field mapping can be completed safely.

## Publish with GitHub Pages

1. Create a GitHub repository, for example `parknacross-weather`.
2. Upload `index.html`, `style.css`, `app.js` and `config.js`.
3. Open repository Settings → Pages.
4. Choose "Deploy from a branch".
5. Select the `main` branch and `/ (root)`.
6. Save.
7. GitHub will provide the public website address.

## Cloudflare Worker

Create a Worker and paste in `cloudflare-worker.js`.

Add these Worker secrets:

- `ECOWITT_APP_KEY`
- `ECOWITT_API_KEY`
- `ECOWITT_MAC`

After deployment, copy the Worker URL into `config.js`.
