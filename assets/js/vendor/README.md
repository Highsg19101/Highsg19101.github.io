# Legacy ES2015 support for MathJax 3

The homepage and the shared Jekyll layout load `es6-legacy.min.js` only as a classic `nomodule` fallback before MathJax. The file is served from this repository, with no runtime CDN or user-agent selection. The bundle has the original ES6 feature set; features with upstream detectors are guarded at runtime. It is not intended to add chat support to legacy browsers.

- Source: the [Cloudflare cdnjs mirror](https://cdnjs.cloudflare.com/polyfill/v3/polyfill.min.js?version=3.111.0&features=es6&flags=gated,always) recommended in the [MathJax 3 browser guide](https://docs.mathjax.org/en/v3.2/web/start.html#browser-compatibility).
- Fixed release: [polyfill-library 3.111.0](https://registry.npmjs.org/polyfill-library/3.111.0). The 131 minified feature bodies and their original detection expressions were checked against the integrity-verified npm archive; the full reconstructed wrapper and contents matched the distributed bytes.
- File size: 84,426 bytes. SHA-256: `599470321884ae3ad66174775a4e2b8e515ff007e6d25cf94f5547dc12f6aa03`.
- Component licenses: [MIT, CC0 and upstream notices](es6-legacy-LICENSE.txt). Do not auto-refresh this snapshot.
