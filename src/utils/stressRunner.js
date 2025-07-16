// src/utils/stressRunner.js
const fs       = require('fs');
const path     = require('path');
const { execSync } = require('child_process');
const vscode   = require('vscode');

const { fetchProblemInfo } = require('./fetch.js');
const { mkTempDir }        = require('./makeDirs.js');
const { extractSamples }   = require('./parseProblem.js');
const { generateGenCpp }   = require('./generateGenCpp.js');

async function handleFetchAndStress(slug, panel, mode) {
  // fetch problem data
  const q = await fetchProblemInfo(slug);
  if (!q) throw new Error('Problem not found');

  // directory for writing aggregated input.txt
  const utilsDir = __dirname; // src/utils
  const aggPath = path.join(utilsDir, 'input.txt');

  // parse LeetCode samples
  const samples = extractSamples(q.sampleTestCase);
  if (samples.length === 0) throw new Error('No samples found');

  // create temp workdir for compilation/tests
  const work = mkTempDir();
  const tplDir = path.resolve(__dirname, '..', '..', 'stress tester');
  ['brute.cpp', 'gen.cpp', 'solution.cpp'].forEach(file => {
    fs.copyFileSync(
      path.join(tplDir, file),
      path.join(work, file)
    );
  });

  // optionally write statement.html
  fs.writeFileSync(path.join(work, 'statement.html'), q.content, 'utf8');

  // regenerate gen.cpp
  const genCode = generateGenCpp({});
  fs.writeFileSync(path.join(work, 'gen.cpp'), genCode);

  // compile all three programs
  ['gen', 'brute', 'solution'].forEach(name => {
    execSync(`g++ -std=c++17 -O2 ${name}.cpp -o ${name}`, { cwd: work });
  });

  // helper compare
  const same = (a, b) => a.trim() === b.trim();

  if (mode === 'runSamples') {
    // initialize aggregated file
    let header = `Sample Testcases for ${slug}\n===========================\n`;
    fs.writeFileSync(aggPath, header, 'utf8');

    for (let i = 0; i < samples.length; i++) {
      const idx = i + 1;
      const { input, output: expected } = samples[i];

      // append to utils/input.txt
      const block =
        `Sample ${idx}:\n` +
        `Input:\n${input}\n` +
        `Expected Output:\n${expected}\n\n`;
      fs.appendFileSync(aggPath, block, 'utf8');

      // notify progress
      panel.webview.postMessage({ command: 'progress', i: idx, total: samples.length });

      // write to work/input.txt and run
      fs.writeFileSync(path.join(work, 'input.txt'), input);
      const bruteOut    = execSync(`./brute < input.txt`,    { cwd: work }).toString();
      const solutionOut = execSync(`./solution < input.txt`, { cwd: work }).toString();

      // display each sample in webview
      panel.webview.postMessage({
        command:   'sample',
        caseIndex: idx,
        input,
        brute:     bruteOut,
        solution:  solutionOut
      });

      if (!same(bruteOut, solutionOut)) {
        return panel.webview.postMessage({
          command:   'fail',
          caseIndex: idx,
          input,
          brute:     bruteOut,
          solution:  solutionOut
        });
      }
    }
    panel.webview.postMessage({ command: 'done' });
  } else {
    // stress mode
    const total = vscode.workspace.getConfiguration().get('competitiveCompanion.testCount', 50);
    for (let i = 1; i <= total; i++) {
      panel.webview.postMessage({ command: 'progress', i, total });
      execSync(`./gen > input.txt`, { cwd: work });

      const input       = fs.readFileSync(path.join(work, 'input.txt'), 'utf8');
      const bruteOut    = execSync(`./brute < input.txt`,    { cwd: work }).toString();
      const solutionOut = execSync(`./solution < input.txt`, { cwd: work }).toString();

      if (!same(bruteOut, solutionOut)) {
        return panel.webview.postMessage({
          command:   'fail',
          caseIndex: i,
          input,
          brute:     bruteOut,
          solution:  solutionOut
        });
      }
    }
    panel.webview.postMessage({ command: 'done' });
  }
}

module.exports = { handleFetchAndStress };
