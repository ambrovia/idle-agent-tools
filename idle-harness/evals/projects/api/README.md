# api

A small JSON API with no framework. `handle(request)` in `src/app.js` takes `{ method, path, query, body }` and returns `{ status, body }`. Every resource lives in `src/resources/<name>/`, is listed in `src/routes.js`, has its tests in `test/<name>.test.js` and its documentation in `docs/<name>.md`, linked from `docs/README.md`.
