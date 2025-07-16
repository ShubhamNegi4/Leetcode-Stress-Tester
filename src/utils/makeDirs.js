const fs = require('fs');
const path = require('path');
const os = require('os');

function mkTempDir(prefix = 'lc-stress-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Copy your local templates (brute.cpp + solution.cpp)
 * into the working directory.
 *
 * Assume you have a folder in your extension root called
 * “templates” that contains brute.cpp and solution.cpp.
 */
function copyTemplates(dest) {
  const tplDir = path.resolve(__dirname, '..', '..', 'stress tester');
  console.log('Template dir is:', tplDir);
  ['brute.cpp', 'solution.cpp', 'gen.cpp', 'run.js', 'stress.sh'].forEach(f => {
    fs.copyFileSync(path.join(tplDir, f), path.join(dest, f));
  });
}

module.exports = { mkTempDir, copyTemplates };
