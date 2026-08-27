const { generateIcons } = require('./scripts/generate-app-icon.cjs');
const { expo } = require('./app.json');

generateIcons();

module.exports = {
  ...expo,
  icon: './assets/icon.png',
  android: {
    ...expo.android,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#214F33',
    },
  },
};
