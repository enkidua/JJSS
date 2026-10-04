// Validate the actual DMG contents on macOS, not just the pre-packaged app.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const assert = require('node:assert/strict');

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

async function main() {
  assert.equal(process.platform, 'darwin', 'Run DMG verification on macOS');
  const dmg = process.argv[2];
  assert.ok(dmg && fs.existsSync(dmg), 'DMG file required');
  console.log(run('hdiutil', ['verify', dmg]));
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'jjss-dmg-check-'));
  const mount = path.join(temporary, 'mounted');
  fs.mkdirSync(mount);
  let mounted = false;
  let child;
  try {
    run('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]);
    mounted = true;
    const installed = path.join(temporary, 'JJSS.app');
    run('ditto', [path.join(mount, 'JJSS.app'), installed]);
    run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', installed]);
    console.log('DMG extracted app: strict nested signature verification passed');
    const executable = path.join(installed, 'Contents', 'MacOS', 'JJSS');
    assert.equal(run('lipo', ['-archs', executable]).trim(), 'arm64');
    let exited = false;
    let spawnError;
    child = spawn(executable, ['--user-data-dir=' + path.join(temporary, 'test-profile')], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.once('exit', (code, signal) => {
      exited = true;
      console.log('App exit: ' + code + ' / ' + signal);
    });
    child.once('error', (error) => { spawnError = error; });
    await new Promise((resolve) => setTimeout(resolve, 20000));
    if (spawnError) throw spawnError;
    assert.equal(exited, false, 'App exited during 20-second startup smoke test');
    console.log('arm64 startup smoke test passed (not a Gatekeeper/notarization test)');
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    if (mounted) run('hdiutil', ['detach', mount]);
    // Keep diagnostic files in runner temp; GitHub disposes of the runner.
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

