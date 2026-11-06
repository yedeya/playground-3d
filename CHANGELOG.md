# Changelog

## [0.2.0](https://github.com/yedeya/playground-3d/compare/v0.1.0...v0.2.0) (2026-11-06)


### Features

* add SST v4 with OpenNext, and the production deploy role's trust policy ([#20](https://github.com/yedeya/playground-3d/issues/20)) ([#61](https://github.com/yedeya/playground-3d/issues/61)) ([95854f8](https://github.com/yedeya/playground-3d/commit/95854f805809134c407a1734cbbd58caba097ad9))
* load the model from the fetched GLB instead of the bundled JSON ([#58](https://github.com/yedeya/playground-3d/issues/58)) ([8f12bc6](https://github.com/yedeya/playground-3d/commit/8f12bc67b757029940ac4e23c88e8f41c5385c36))
* port the app, its tests and its config to strict TypeScript, still on Vite ([#18](https://github.com/yedeya/playground-3d/issues/18)) ([#48](https://github.com/yedeya/playground-3d/issues/48)) ([7da7c83](https://github.com/yedeya/playground-3d/commit/7da7c833c42ad404963086b2852f6d5d72316a0a))
* port the model generator to TypeScript, checked part for part against the baseline ([#52](https://github.com/yedeya/playground-3d/issues/52)) ([1ce05be](https://github.com/yedeya/playground-3d/commit/1ce05be98844ba6390a7c6f6bd018861334bc0c8))
* replace Vite with Next.js, mounting the viewer and the panel in the browser only ([#19](https://github.com/yedeya/playground-3d/issues/19)) ([#49](https://github.com/yedeya/playground-3d/issues/49)) ([dd1d2f3](https://github.com/yedeya/playground-3d/commit/dd1d2f375247f32a5d4269ab867e8505c5eab7a4))
* smoke-check that the deployed app can fetch its GLB [MODEL-13] ([#29](https://github.com/yedeya/playground-3d/issues/29)) ([#65](https://github.com/yedeya/playground-3d/issues/65)) ([666ab6a](https://github.com/yedeya/playground-3d/commit/666ab6a42fc414d290af8aab926c2fbe7dd016c6))
* wire Kanon's deploy lane: build, deploy and smoke hooks, the caller, and the declaration ([#22](https://github.com/yedeya/playground-3d/issues/22)) ([#62](https://github.com/yedeya/playground-3d/issues/62)) ([74fe76c](https://github.com/yedeya/playground-3d/commit/74fe76c0fe69a2cde12c3a1863ca0b62470370c9))
* write the GLB from the TypeScript generator, and make `npm run model` produce it ([#56](https://github.com/yedeya/playground-3d/issues/56)) ([a0c23a5](https://github.com/yedeya/playground-3d/commit/a0c23a5e851ec80f4b941e5f1a5a90db328deeb8))
* write the transport plan's rules as a pure domain module ([#51](https://github.com/yedeya/playground-3d/issues/51)) ([769cbdb](https://github.com/yedeya/playground-3d/commit/769cbdb90e6c41ba8e4ebbb0b23cfc507cff80f3))


### Documentation

* brief for project [#6](https://github.com/yedeya/playground-3d/issues/6), the move to TypeScript, Next.js and SST ([#11](https://github.com/yedeya/playground-3d/issues/11)) ([f873255](https://github.com/yedeya/playground-3d/commit/f873255623da4bd6a5eebc7c2d452d17a9f1f081))
* brief for project [#7](https://github.com/yedeya/playground-3d/issues/7), the model generator in TypeScript and GLB ([#14](https://github.com/yedeya/playground-3d/issues/14)) ([09e3acb](https://github.com/yedeya/playground-3d/commit/09e3acb0e5d02fba4e75522f7473e03f21d30640))
* brief for project [#8](https://github.com/yedeya/playground-3d/issues/8), the backend for user data and the offline PWA ([#15](https://github.com/yedeya/playground-3d/issues/15)) ([573dd06](https://github.com/yedeya/playground-3d/commit/573dd06c0958083b16138d3354fbd39d49e0fa7f))
* brief for project [#9](https://github.com/yedeya/playground-3d/issues/9), transport groups and tape labels ([#13](https://github.com/yedeya/playground-3d/issues/13)) ([a60f479](https://github.com/yedeya/playground-3d/commit/a60f4792579943a019642336ecdc68d755a2271c))
* record the end of Kanon's bootstrap ([#3](https://github.com/yedeya/playground-3d/issues/3)) ([4510bd2](https://github.com/yedeya/playground-3d/commit/4510bd247f865ae6fc7047a0ff148fdc700f3654))


### Tests

* lock the panel, filter rule and viewer rules in tests (APP-8 to APP-15) ([#47](https://github.com/yedeya/playground-3d/issues/47)) ([9678ebe](https://github.com/yedeya/playground-3d/commit/9678ebef7be7e2bf4b958d3ba4981890d36fa22e))


### CI

* add Kanon's Lead lanes ([#5](https://github.com/yedeya/playground-3d/issues/5)) ([d1ff5b2](https://github.com/yedeya/playground-3d/commit/d1ff5b25dc056b05633a7f8ec63fa414e54fde41))
* run Kanon's brief guard in CI on the briefs under docs/projects/ ([#50](https://github.com/yedeya/playground-3d/issues/50)) ([ac4b615](https://github.com/yedeya/playground-3d/commit/ac4b61521f7ddd87c44872ee724f92badaa705e5))


### Chores

* declare the tests tree and cite APP-1 to APP-7 in the tests ([#33](https://github.com/yedeya/playground-3d/issues/33)) ([df506c9](https://github.com/yedeya/playground-3d/commit/df506c9006541da37a42cff379ac7eaa19c89185))
* remove the Python generator, its USDA and CSV outputs, and the Swift render tool ([#59](https://github.com/yedeya/playground-3d/issues/59)) ([38b2d18](https://github.com/yedeya/playground-3d/commit/38b2d182f5a22621c560e8b3a28c99d2ba523f78))

## 0.1.0 (2026-11-05)


### CI

* install Kanon ([#1](https://github.com/yedeya/playground-3d/issues/1)) ([592f040](https://github.com/yedeya/playground-3d/commit/592f0408bf43e3571340b7f165dc5bc71f0a4326))
