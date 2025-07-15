// stressRunner.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const vscode = require('vscode');
const fetchProblemInfo = require('./fetch');
const { mkTempDir, copyTemplates } = require('./makeDirs');

async function handleFetchAndStress(problemId, panel) {
  try {
    console.log("hi");
    const tests = await fetchProblemInfo(problemId);
    console.log("reponse from leetcode: ",tests);
    return ; 


    const tmp = mkTempDir('lc-stress-');
    fs.writeFileSync(path.join(tmp, 'input.txt'), tests.join(os.EOL));

    copyTemplates(tmp);
    compileAll(tmp);

    const cfg = vscode.workspace.getConfiguration('competitiveCompanion');
    const total = cfg.get('testCount');

    for (let i = 1; i <= total; i++) {
      execSync(`./gen > in.txt`, { cwd: tmp });
      execSync(`./brute < in.txt > out1.txt`, { cwd: tmp });
      execSync(`./solution < in.txt > out2.txt`, { cwd: tmp });
      panel.webview.postMessage({ command: 'progress', i, total });

      const a = fs.readFileSync(path.join(tmp, 'out1.txt'), 'utf8');
      const b = fs.readFileSync(path.join(tmp, 'out2.txt'), 'utf8');
      if (a !== b) {
        return panel.webview.postMessage({
          command: 'fail',
          input: fs.readFileSync(path.join(tmp, 'in.txt'), 'utf8')
        });
      }
    }

    // panel.webview.postMessage({ command: 'done' });
  } catch (err) {
    panel.webview.postMessage({ command: 'error', error: err.message });
  }
}

function compileAll(tmp) {
  ['brute', 'gen', 'solution'].forEach(name => {
    execSync(`g++ -std=c++17 -O2 ${name}.cpp -o ${name}`, { cwd: tmp });
  });
}

module.exports = { handleFetchAndStress };