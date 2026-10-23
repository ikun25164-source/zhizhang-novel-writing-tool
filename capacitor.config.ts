import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.zhizhang.studio',
  appName: '织章',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#f2f3f4',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
}

export default config
