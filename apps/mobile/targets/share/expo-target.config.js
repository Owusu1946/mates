/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = () => ({
  type: "share",
  name: "MatesShareExtension",
  displayName: "Mates",
  bundleIdentifier: ".ShareExtension",
  deploymentTarget: "17.0",
  frameworks: ["SwiftUI"],
  entitlements: {},
});
