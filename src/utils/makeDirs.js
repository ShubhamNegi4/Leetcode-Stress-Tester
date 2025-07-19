const fs = require('fs');
const path = require('path');
const os = require('os');

function mkTempDir(prefix = 'lc-stress-') {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function copyTemplates(dest) {
    const tplDir = path.resolve(__dirname, '..', '..', 'stress tester');

    // Copy only essential files
    ['solution.cpp', 'template.cpp'].forEach(f => {
        const src = path.join(tplDir, f);
        const dst = path.join(dest, f);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, dst);
        }
    });
}

module.exports = { mkTempDir, copyTemplates };