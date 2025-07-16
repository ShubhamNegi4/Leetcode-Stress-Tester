const fs          = require('fs');
const path        = require('path');
const { execSync } = require('child_process');
const vscode      = require('vscode');

const { fetchProblemInfo }       = require('./fetch.js');
const { mkTempDir, copyTemplates } = require('./makeDirs.js');
const { extractSamples }         = require('./parseProblem.js');

// helper: parse all integers from a string
function parseNumbers(str) {
  const m = str.match(/-?\d+/g);
  return m ? m.map(Number) : [];
}

async function handleFetchAndStress(slug, panel, mode) {
  const q = await fetchProblemInfo(slug);
  if (!q) throw new Error('Problem not found');

  const work = mkTempDir();
  copyTemplates(work);
  if (mode === 'runStress') {
    fs.writeFileSync(path.join(work, 'statement.html'), q.content, 'utf8');
  }

  ['gen.cpp','brute.cpp','solution.cpp'].forEach(src => {
    const exe = path.basename(src, '.cpp');
    execSync(`g++ -std=c++17 -O2 ${src} -o ${exe}`, { cwd: work });
  });

  if (mode === 'runSamples') {
    const samples = extractSamples(q.content);
    if (!samples.length) throw new Error('No samples found');

    const aggPath = path.join(__dirname, 'input.txt');
    fs.writeFileSync(aggPath,
      `Sample Testcases for ${slug}\n===========================\n`,
      'utf8'
    );

    for (let i = 0; i < samples.length; i++) {
      const idx = i+1;
      const { input, output: expected } = samples[i];
      const expNums = parseNumbers(expected);

      fs.appendFileSync(aggPath,
        `Sample ${idx}:\nInput:\n${input}Expected Output:\n${expected}\n\n`,
        'utf8'
      );

      panel.webview.postMessage({ command:'progress', i:idx, total: samples.length });
      fs.writeFileSync(path.join(work,'input.txt'), input);
      const solutionOutRaw = execSync(`./solution < input.txt`, { cwd: work }).toString().trim();
      const solNums = parseNumbers(solutionOutRaw);

      const ok = solNums.length === expNums.length && solNums.every((v,j)=>v===expNums[j]);
      if (!ok) {
        return panel.webview.postMessage({
          command:   'fail',
          caseIndex: idx,
          input,
          expected,
          solution:  solutionOutRaw
        });
      }

      panel.webview.postMessage({
        command:   'sample',
        caseIndex: idx,
        input,
        expected,
        solution:  solutionOutRaw
      });
    }
    return panel.webview.postMessage({ command:'done' });
  }

  const total = vscode.workspace.getConfiguration().get('competitiveCompanion.testCount',50);
  for (let i=1;i<=total;i++){
    panel.webview.postMessage({ command:'progress', i, total });
    execSync(`./gen > input.txt`,{ cwd: work });
    const input = fs.readFileSync(path.join(work,'input.txt'),'utf8');
    const bruteOut = execSync(`./brute < input.txt`,{ cwd: work }).toString().trim();
    const solutionOut= execSync(`./solution < input.txt`,{ cwd: work }).toString().trim();
    if (bruteOut!==solutionOut) {
      return panel.webview.postMessage({
        command:   'fail',
        caseIndex: i,
        input,
        brute:     bruteOut,
        solution:  solutionOut
      });
    }
  }
  panel.webview.postMessage({ command:'done' });
}

module.exports = { handleFetchAndStress };  