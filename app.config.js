// app.config.js en vez de app.json: la API key de Google Maps no debe quedar
// en texto plano en el repo — se lee de una variable de entorno de EAS
// (dashboard del proyecto → Environment variables → GOOGLE_MAPS_API_KEY_ANDROID,
// marcada como "Sensitive"). Un app.json estático no puede leer process.env.
module.exports = {
  expo: {
    name: 'compi',
    slug: 'compi',
    owner: 'jj-tecnologia-sas',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
    },
    android: {
      package: 'com.jjordoneza.compi',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY_ANDROID,
        },
      },
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      [
        'expo-contacts',
        {
          contactsPermission: 'Compi usa tus contactos para ayudarte a marcar cuáles son tus proveedores. No los compartimos ni los usamos para nada más.',
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission: 'Compi usa tu ubicación al crear tu negocio para ayudarte a encontrar proveedores que sí cubren tu zona. No se te muestra ni se comparte con nadie.',
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/icon.png',
          color: '#0E7C86',
        },
      ],
    ],
    runtimeVersion: {
      policy: 'fingerprint',
    },
    updates: {
      url: 'https://u.expo.dev/bf3ade9c-9f46-4567-9202-ec5d6b7c5797',
    },
    extra: {
      eas: {
        projectId: 'bf3ade9c-9f46-4567-9202-ec5d6b7c5797',
      },
    },
  },
};
