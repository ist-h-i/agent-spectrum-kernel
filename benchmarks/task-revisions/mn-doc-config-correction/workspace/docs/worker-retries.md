# Worker retry policy

Workers use the retry defaults from `config/retry-policy.json` when a job does not provide an override.

```json
{
  "maxAttempts": 4,
  "backoff": "exponential"
}
```

Run `npm test` after changing this example.
