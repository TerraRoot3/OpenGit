# Passkey / WebAuthn Investigation Notes

## Baseline
- Date: 2026-04-09
- Electron: 38.7.2 (from `package.json`)
- Chromium: Pending runtime confirmation
- Platform: Pending manual verification

## Diagnostic Fields
The browser shell now surfaces these checks for the active web tab:
- `hasCredentials`
- `hasPublicKeyCredential`
- `hasCreate`
- `hasGet`
- `conditionalMediation`

The values come from in-page execution:

```js
({
  hasCredentials: typeof navigator.credentials !== 'undefined',
  hasPublicKeyCredential: typeof window.PublicKeyCredential !== 'undefined',
  hasCreate: typeof navigator.credentials?.create === 'function',
  hasGet: typeof navigator.credentials?.get === 'function',
  conditionalMediation: typeof PublicKeyCredential?.isConditionalMediationAvailable === 'function'
})
```

## Manual Verification TODO
- Site:
- Exact error string:
- Outcome:
- Notes:
