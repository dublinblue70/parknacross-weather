Parknacross Weather v38.4.138 deployment

The Weather Window and soundscape are website-only features. They do not need a Cloudflare Worker change and make no external image or audio requests.

GitHub Pages
1. Download and extract Parknacross-v38.4.138-WEATHER-WINDOW.zip.
2. Upload the website files from the ZIP to the root of the parknacross-weather GitHub repository, replacing the matching files. Keep the files at the repository root.
3. Commit the changes and wait for GitHub Pages to publish.
4. Open the Dashboard and refresh after publication. The Weather Window appears below Today’s sky. Press Play to start its optional soundscape; it does not autoplay.

Cloudflare Worker
The new illustration and soundscape need no Worker change. The ZIP also carries forward the v38.4.137 custom CSV date-range feature. If you are deploying that feature too, paste Parknacross-worker-v38.4.81-CUSTOM-CSV-DATE-RANGE.txt into the existing Cloudflare Worker editor and deploy it. This Worker update is only required for custom date-range exports.

Isolation
The new scene and sound use their own weather-window.js and weather-window.css assets. Existing dashboard rendering completes before the optional feature receives readings. A failure in the new component is caught separately and does not block established dashboard functionality.
