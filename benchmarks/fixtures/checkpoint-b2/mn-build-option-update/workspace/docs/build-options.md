# Build configuration notes

The CI image uses Build Tool 4.2. Debug profiles continue to accept the boolean `sourceMap` shorthand.

For release profiles, `sourceMap` must use the structured form. Server release builds keep script maps available to error reporting without publishing map references in generated files, and do not produce stylesheet maps:

```json
{
  "sourceMap": {
    "scripts": "hidden",
    "styles": false
  }
}
```

Release builds must retain the existing target and minification settings unless a separate migration calls for changing them.
