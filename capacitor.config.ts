import type { CapacitorConfig } from '@capacitor/cli';

/**
 * iOS: `ios.packageClassList` is merged into root `packageClassList` after `cap sync` (see
 * `scripts/merge-ios-package-class-list.mjs`). Capacitor's CLI only auto-fills npm Core plugins;
 * local SPM plugins (e.g. StoryCamera) must appear here.
 */
const config: CapacitorConfig = {
  appId: 'com.venncircle.app',
  appName: 'VennCircle',
  webDir: 'dist',
  // Google OAuth completion redirects to com.widecity.wcplanner://… (see ios/App/App/Info.plist CFBundleURLTypes)
  ios: {
    packageClassList: [
      'AppPlugin',
      'CAPCameraPlugin',
      'HealthPlugin',
      'CapacitorCalendarPlugin',
      'StoryCameraPlugin',
    ],
  },
};

export default config;
