export default {
  expo: {
    name: "SIGMET",
    slug: "sigmet-mobile",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#0F1623"
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.sigmet.app",
      buildNumber: "1.0.0",
      infoPlist: {
        NSPhotoLibraryUsageDescription: "This app needs access to your photo library to upload images.",
        NSCameraUsageDescription: "This app needs access to your camera to take photos."
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#0F1623"
      },
      package: "com.sigmet.app"
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      "expo-router",
      [
        "expo-image-picker",
        {
          photosPermission: "Allow SIGMET to access your photos to upload images.",
          cameraPermission: "Allow SIGMET to access your camera to take photos."
        }
      ]
    ],
    scheme: "sigmet",
    extra: {
      eas: {
        projectId: ""
      }
    }
  }
};
