export const BING_PROVIDER_ID = 'bing'
export const DEFAULT_BING_MARKET = 'zh-CN'

export function createDefaultBingOnlineSettings(overrides = {}) {
  return {
    providerId: BING_PROVIDER_ID,
    itemId: '',
    title: '',
    previewUrl: '',
    remoteUrl: '',
    cachedFilePath: '',
    cachedDataUrl: '',
    autoUpdateLatest: false,
    lastAutoUpdateDate: '',
    market: DEFAULT_BING_MARKET,
    ...overrides
  }
}
