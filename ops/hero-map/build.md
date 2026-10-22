# three.js bundle for the hero map (SPEC RS60)

`web/vendor/three-0.186.1-hero.min.js` is three.js 0.186.1 (MIT), cut down to the classes in `three-entry.js`
and minified. Rebuild it only when you change that list or upgrade three.js (pick a release at least two weeks old):

```
mkdir build-three && cd build-three && npm init -y
npm install --ignore-scripts esbuild@0.28.2 three@0.186.1
npx esbuild ../ops/hero-map/three-entry.js --bundle --format=esm --minify --target=es2020 \
  --legal-comments=eof --outfile=../web/vendor/three-0.186.1-hero.min.js
```

Keep the version in the file name: browsers may cache it for hours, and a new name is the only clean way to ship a
new copy. Then run `python ops/stamp_assets.py` and `python -m pytest`.
