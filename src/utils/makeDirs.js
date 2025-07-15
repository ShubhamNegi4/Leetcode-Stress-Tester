// utils.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const vscode = require('vscode');

function mkTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function copyTemplates(dest) {
  const ext = vscode.extensions.getExtension('competitive-companion-v2');
  const tplDir = path.join(ext.extensionPath, 'stress tester');
  ['gen.cpp', 'brute.cpp', 'solution.cpp'].forEach(f => {
    fs.copyFileSync(path.join(tplDir, f), path.join(dest, f));
  });
}

module.exports = { mkTempDir, copyTemplates };