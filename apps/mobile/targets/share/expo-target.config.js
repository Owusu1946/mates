/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "share",
  name: "MatesShareExtension",
  displayName: "Mates",
  bundleIdentifier: ".ShareExtension",
  deploymentTarget: "17.0",
  frameworks: ["SwiftUI"],
  entitlements: {
    "com.apple.security.application-groups":
      config.ios.entitlements["com.apple.security.application-groups"],
  },
});
