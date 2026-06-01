# Image hierarchy

Local scouting images are scoped by city and by use so they cannot be reused by accident.

```text
assets/images/
  manifest.js
  cities/
    <city-slug>/
      hero/
        01.jpg
        02.jpg
      test-spots/
        01-<place-slug>/
          01.jpg
          02.jpg
        02-<place-slug>/
          01.jpg
  _legacy-flat-archive/
```

`manifest.js` is the only file the app reads directly. It should point to `./assets/images/cities/...` paths only.

`_legacy-flat-archive/` keeps the old flat downloads for recovery, but the app should not reference it.
