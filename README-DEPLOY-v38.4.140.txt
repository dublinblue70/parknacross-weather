Parknacross Weather v38.4.140 deployment

This release raises soundscape playback levels for mobile speakers and adds soft, synthetic birdlike chirps during the Irish morning (05:00–12:00). It also removes the “Illustrated from local readings” caption.

1. Download and extract Parknacross-v38.4.140-MOBILE-AUDIO-AND-BIRDSONG.zip.
2. Upload the website files to the root of the parknacross-weather GitHub repository, replacing matching files. Keep the files at the repository root.
3. Commit the changes and wait for GitHub Pages to publish.
4. Refresh the Dashboard. Tap “Play the Parknacross soundscape”; the volume slider starts at 85% and can be adjusted. Sound is still opt-in.

The birdlike chirps are generated in the browser; they are not recordings. They are mixed in between 05:00 and noon Ireland time. The sound remains synthetic and data-shaped, not an actual recording of the weather.

No Cloudflare Worker update is needed. This workspace cannot test playback on a physical phone.
