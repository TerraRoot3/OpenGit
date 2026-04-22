import { BING_PROVIDER_ID, DEFAULT_BING_MARKET, createDefaultBingOnlineSettings } from './bing.mjs'

export const DEFAULT_WALLPAPER_PROVIDER_ID = BING_PROVIDER_ID

export function createDefaultHomeBackgroundSettings(overrides = {}) {
  return {
    mode: 'local',
    image: '',
    overlayOpacity: 30,
    blurAmount: 5,
    localImagePath: '',
    online: createDefaultBingOnlineSettings(),
    ...overrides
  }
}

export function normalizeOnlineWallpaperSettings(raw = {}) {
  const providerId = typeof raw?.providerId === 'string' && raw.providerId.trim()
    ? raw.providerId.trim()
    : DEFAULT_WALLPAPER_PROVIDER_ID

  if (providerId === BING_PROVIDER_ID) {
    return createDefaultBingOnlineSettings({
      ...raw,
      providerId,
      market: typeof raw?.market === 'string' && raw.market.trim()
        ? raw.market.trim()
        : DEFAULT_BING_MARKET
    })
  }

  return createDefaultBingOnlineSettings({
    ...raw,
    providerId: DEFAULT_WALLPAPER_PROVIDER_ID
  })
}

export function normalizeHomeBackgroundSettings(raw = {}) {
  const base = createDefaultHomeBackgroundSettings()
  return {
    ...base,
    ...raw,
    mode: raw?.mode === 'online' ? 'online' : 'local',
    image: typeof raw?.image === 'string' ? raw.image : '',
    overlayOpacity: Number.isFinite(Number(raw?.overlayOpacity)) ? Number(raw.overlayOpacity) : base.overlayOpacity,
    blurAmount: Number.isFinite(Number(raw?.blurAmount)) ? Number(raw.blurAmount) : base.blurAmount,
    localImagePath: typeof raw?.localImagePath === 'string' ? raw.localImagePath : '',
    online: normalizeOnlineWallpaperSettings(raw?.online || {})
  }
}
