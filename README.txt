PARKNACROSS WEATHER - FORECAST FIX

Why the page showed "Official forecast temporarily unavailable":
The front end calls:
  https://parknacross-weather.dave-s-carter.workers.dev/met/forecast

If the upgraded Cloudflare Worker has not been deployed, or that route errors,
app.js displays the temporary-unavailable message.

FIX:
1. In Cloudflare -> Workers & Pages -> parknacross-weather -> Edit code
   replace the entire Worker with worker.js from this ZIP.
2. Deploy the Worker.
3. Test this URL in a browser:
   https://parknacross-weather.dave-s-carter.workers.dev/met/forecast
   You should see JSON containing today, tonight and tomorrow.
4. In GitHub replace app.js and service-worker.js with the files in this ZIP.
5. Commit the changes.
6. Hard-refresh parknacrossweather.ie (Ctrl+F5 on Windows).

The Worker now:
- uses the official Met Éireann Leinster JSON feed;
- falls back to the National JSON feed if Leinster temporarily fails;
- validates the JSON structure before returning it.

The browser app also has a second direct-feed fallback where CORS permits it.
