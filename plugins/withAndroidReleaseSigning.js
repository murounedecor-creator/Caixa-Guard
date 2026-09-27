const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error(
        'withAndroidReleaseSigning só funciona com build.gradle em Groovy'
      );
    }

    let contents = config.modResults.contents;

    if (contents.includes('MYAPP_RELEASE_STORE_FILE')) {
      return config;
    }

    contents = contents.replace(
      /signingConfigs\s*\{\s*debug\s*\{[^}]*\}/,
      (match) =>
        `${match}\n        release {\n` +
        `            if (project.hasProperty('MYAPP_RELEASE_STORE_FILE')) {\n` +
        `                storeFile file(MYAPP_RELEASE_STORE_FILE)\n` +
        `                storePassword MYAPP_RELEASE_STORE_PASSWORD\n` +
        `                keyAlias MYAPP_RELEASE_KEY_ALIAS\n` +
        `                keyPassword MYAPP_RELEASE_KEY_PASSWORD\n` +
        `            }\n` +
        `        }`
    );

    contents = contents.replace(
      /(buildTypes\s*\{\s*release\s*\{[^}]*signingConfig\s+signingConfigs\.)debug/,
      '$1release'
    );

    config.modResults.contents = contents;
    return config;
  });
};
