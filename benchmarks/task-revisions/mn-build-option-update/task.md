# Release build configuration update

After the CI image moved to Build Tool 4.2, the release profile no longer validates. Error reporting needs script maps without publishing map references in generated files. The server does not need stylesheet maps. Use `ci/release-build.log` and `docs/build-options.md` to correct only `build.config.json`.

Keep the debug profile, release target and minification settings intact. Run `npm test` and `npm run validate:build` in this workspace. Report each command's actual result and what it checked.
