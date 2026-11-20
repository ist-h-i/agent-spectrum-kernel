# Supported client environments

The preference module is shared by the current desktop client and embedded mobile clients. Runtime capability matters; a user-agent string is not an API guarantee.

| Capability | Current desktop | Supported legacy mobile |
| --- | --- | --- |
| ES modules | yes | yes |
| Object.hasOwn | yes | no |
| Object.prototype.hasOwnProperty | yes | yes |
| Function.prototype.call | yes | yes |

`npm test` runs locally on Node. The compatibility checks model missing runtime capabilities without downloading an emulator. Do not add a global polyfill: other client modules share the same JavaScript realm.
