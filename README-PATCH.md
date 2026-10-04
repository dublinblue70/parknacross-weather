# Parknacross Weather v38.4.129 review patch

This is a website-root overlay patch for the Parknacross Weather GitHub Pages repository. Copy these files into the repository root and review the changes before publishing. It does not deploy anything.

The alert logic now requires a fresh station observation for rain-start, heavy-rain, gust, and frost notifications. Rain-start alerts use the dashboard's confirmation thresholds. The Station and Install diagnostics now report the matching v38.4.129 cache/version, and package metadata agrees.

The patch does not include or change the separately deployed Cloudflare Worker. Keep the live Cloudflare Worker unchanged.

Run `node rain-alert-test.mjs` to check rain alert confirmation and stale-observation behavior.
