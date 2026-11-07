// Foreground detection (platform adapter, tech doc §3.2/9.4). The domain
// never reads the DOM; the tick engine asks this provider whether the app is
// visible. In a headless/unit environment the default is "foreground".

export interface OnlineProvider {
  isForeground(): boolean;
}

export const browserOnlineProvider: OnlineProvider = {
  isForeground: () =>
    typeof document === 'undefined' || document.visibilityState !== 'hidden',
};
