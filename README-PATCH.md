# Parknacross Weather v38.4.130 website patch

This ZIP contains website-root files for the Parknacross Weather GitHub Pages repository. Copy the files into the repository root and review them before publishing. The patch has not been deployed.

Coast page fixes: marine API requests now time out after 12 seconds; tide and sea-temperature fields display an explicit unavailable state on timeout, HTTP/API failure, or empty tide results; incomplete marine forecasts no longer leave loading placeholders behind.

The patch also includes the previously prepared v38.4.129 rain-alert freshness/confirmation correction, aligned app version indicators, and regression tests. It does not contain or change the separately deployed Cloudflare Worker.

Run `node coast-data-test.mjs` and `node rain-alert-test.mjs` to test the client-side fallback and notification behavior.
