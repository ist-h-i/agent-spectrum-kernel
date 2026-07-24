# Release build configuration update

The release build started failing after the CI image moved to the current build-tool release. Update the repository's build configuration so the release profile satisfies the supported option contract described by the checked-in evidence.

Keep the change limited to the build configuration. Preserve the debug profile and the existing release target and optimization behavior. Run the focused repository checks and report what you changed and what you verified.
