# Nachtgespenst: the project site

The public site of Nachtgespenst, a Bluetooth LE and USB HID macro pad for the M5Stack Core2 and CoreS3. It is served at https://hanskruse.eu/nachtgespenst/ from the branch `gh-pages`, which the workflow in `.github/workflows/pages.yml` fills from `main`.

The site is plain HTML, CSS and a little JavaScript, with no build step. The shell manual page (`shell.html`) is generated from the project's shell documentation by a tool of the main project and committed here.

- Licence: MIT, see [LICENSE](LICENSE); third-party components: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
- Secret scanning: `git config core.hooksPath .githooks` (trufflehog, see the hooks).
