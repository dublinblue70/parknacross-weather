PARKNACROSS WEATHER v38.4.137 PATCH

The package includes website files for GitHub Pages and a Cloudflare Worker update. Custom date-range CSV downloads require both deployments.

GITHUB PAGES
1. Open the parknacross-weather GitHub repository.
2. Replace the same-named website files in the repository root with the files from this package. Keep the Worker file out of the GitHub website root.
3. Commit/publish the changes and allow GitHub Pages to finish deploying.

CLOUDFLARE WORKER
1. Open the Parknacross Weather Worker in Cloudflare.
2. Open Parknacross-worker-v38.4.81-CUSTOM-CSV-DATE-RANGE.txt in a text editor and copy its complete contents into the Worker editor.
3. Deploy the Worker.

Custom date-range downloads are available after both the website and Worker deployments complete. The existing preset CSV buttons continue to work while GitHub Pages is updating.

The Worker keeps its existing D1 bindings, secrets and other configuration; no binding or secret changes are required.
