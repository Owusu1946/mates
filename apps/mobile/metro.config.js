const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind: wrapper0 } = require("nativewind/metro");

let config = getDefaultConfig(__dirname);
config = wrapper0(config, {
  "input": "./src/global.css"
});

module.exports = config;
