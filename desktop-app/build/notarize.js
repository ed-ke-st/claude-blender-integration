const { notarize } = require('@electron/notarize');
const { execSync } = require('child_process');

exports.default = async function notarizeMacApp(context) {
  const { electronPlatformName, appOutDir, packager } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  const appleId = process.env.APPLE_ID;
  const applePassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !applePassword || !teamId) {
    // Ad-hoc sign so macOS Tahoe shows "Open Anyway" instead of "damaged and can't be opened".
    // A fully unsigned app has no valid code signature, which Tahoe treats as damaged.
    // Ad-hoc signing (-) creates a valid signature without an Apple Developer certificate.
    console.log(`Ad-hoc signing ${appName}.app for Gatekeeper compatibility...`);
    execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
    console.log('Ad-hoc signing complete.');
    return;
  }

  await notarize({
    appPath,
    appleId,
    appleIdPassword: applePassword,
    teamId,
  });

  console.log(`Notarization complete for ${appName}.app`);
};
