Parknacross Weather v38.4.139 deployment

This update fixes mobile sound playback and removes the scene label “Illustrated from local readings.” It does not change weather data, alerts, charts or Worker APIs.

1. Download and extract Parknacross-v38.4.139-MOBILE-SOUND-FIX.zip.
2. Upload the website files to the root of the parknacross-weather GitHub repository, replacing matching files. Keep all files at the repository root.
3. Commit the changes and wait for GitHub Pages to publish.
4. Open or refresh the Dashboard. In the Weather Window, tap “Play the Parknacross soundscape” and raise the phone’s media volume if needed.

The sound is synthetic and generated locally from current wind and rain readings. It is never autoplayed. No Cloudflare Worker update is needed.

This workspace cannot verify playback on a physical phone. The included test checks the mobile audio unlock call, audio levels, and opt-in behavior using a Web Audio test double.
