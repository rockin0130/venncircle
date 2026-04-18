import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
appId: 'com.venncircle.app',
  appName: 'VennCircle',
  webDir: 'dist',
  // Google OAuth completion redirects to com.widecity.wcplanner://… (see ios/App/App/Info.plist CFBundleURLTypes)
};

export default config;
