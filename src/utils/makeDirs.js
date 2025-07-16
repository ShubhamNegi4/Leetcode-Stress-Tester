// utils/makeDirs.js

const fs   = require('fs');
const path = require('path');
const os   = require('os');

function mkTempDir(prefix = 'lc-stress-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Copy your local templates (brute.cpp, solution.cpp, gen.cpp, stress.sh, etc.)
 * into the working directory.
 */
function copyTemplates(dest) {
  const tplDir = path.resolve(__dirname, '..', '..', 'stress tester');
  console.log('Template dir is:', tplDir);

  // copy every file your stress.sh will need
  ['brute.cpp', 'solution.cpp', 'gen.cpp', 'stress.sh']
    .forEach(f => {
      const src = path.join(tplDir, f);
      const dst = path.join(dest, f);
      fs.copyFileSync(src, dst);
      // ensure the script is executable
      if (f.endsWith('.sh')) {
        fs.chmodSync(dst, 0o755);
      }
    });
}

module.exports = { mkTempDir, copyTemplates };
