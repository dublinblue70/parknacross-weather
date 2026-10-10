# Activate the public API hostname

The website is prepared for `https://api.parknacrossweather.ie` while continuing
to use the existing Worker until the hostname is verified.

1. Sign in to the Cloudflare account containing `parknacross-weather`.
2. Check that `parknacrossweather.ie` is an active Cloudflare zone. If it is
   hosted at another DNS provider, prepare a separate DNS migration that
   preserves the GitHub Pages, mail, TXT and other existing records before
   changing nameservers. A CNAME to workers.dev alone does not bind the Worker.
3. Open Workers & Pages → parknacross-weather → Settings → Domains & Routes →
   Add → Custom Domain. Enter `api.parknacrossweather.ie`. Cloudflare manages
   the DNS record and certificate for an active zone.
4. Keep the current workers.dev address, secrets, database/storage bindings,
   station upload address and scheduled triggers unchanged.
5. Verify the new hostname's `/health`, `/current`, `/history?hours=24`,
   `/export-preview?days=7`, `/export.csv?days=7` and marine endpoints. Verify
   browser CORS from `https://parknacrossweather.ie`, including authenticated
   admin preflight, image loading and downloads.
6. Only after those checks pass, set `customBase` in `api-routing.js` to the
   new HTTPS address, publish a new release and update the service-worker
   version. Read requests have a bounded fallback to the current Worker;
   writes are never replayed. Test India access on the affected network.

Reference: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
