// Ad-hoc integrity signing for certificate-free macOS test builds only.
// This does not replace Developer ID signing or Apple notarization.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { signAsync } = require('@electron/osx-sign');

module.exports = async (context) => {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.app');
  const before = spawnSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { encoding: 'utf8' });
  console.log('Before ad-hoc signing: ' + (before.status === 0 ? 'valid' : 'invalid/unsigned'));
  if (before.status !== 0) console.log(before.stderr);
  await signAsync({
    app,
    identity: '-',
    identityValidation: false,
    platform: 'darwin',
    preAutoEntitlements: false,
    preEmbedProvisioningProfile: false,
    gatekeeperAssess: false,
    strictVerify: true,
    optionsForFile: () => ({ hardenedRuntime: false }),
  });
  const verified = spawnSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' });
  if (verified.status !== 0) throw new Error('macOS ad-hoc signature verification failed');
};

