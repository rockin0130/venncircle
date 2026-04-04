import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.widecity.wcplanner',
  appName: 'App Name: WC Planner',
  webDir: 'dist',
  // Google OAuth completion redirects to com.widecity.wcplanner://… (see ios/App/App/Info.plist CFBundleURLTypes)
};

export default config;
