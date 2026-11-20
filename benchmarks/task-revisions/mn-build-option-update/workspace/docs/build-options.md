# Build configuration notes

The CI image uses Build Tool 4.2. Debug profiles continue to accept the boolean `sourceMap` shorthand.

For release profiles, `sourceMap` must be an object with separate options:

- `scripts` controls script-map visibility. The `"hidden"` mode produces script maps for error reporting without adding map references to generated files.
- `styles` is a boolean controlling whether stylesheet maps are produced.

Server release builds require script maps for error reporting without public map references, and must not produce stylesheet maps.

Release builds must retain the existing target and minification settings unless a separate migration calls for changing them.
