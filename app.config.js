// Adds the Android versionCode on top of app.json. Each GitHub build uses its run number, so every new APK installs
// as an update over the previous one.
module.exports = ({ config }) => ({
  ...config,
  android: { ...config.android, versionCode: Number(process.env.GITHUB_RUN_NUMBER ?? 1) },
});
