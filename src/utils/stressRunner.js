// utils/stressRunner.js

const fs       = require('fs');
const path     = require('path');
const { execSync } = require('child_process');
const vscode   = require('vscode');

const { fetchProblemInfo, fetchOfficialSolution, fetchGithubSolution } = require('./fetch.js');
const { mkTempDir, copyTemplates } = require('./makeDirs.js');
const { extractSamples }            = require('./parseProblem.js');

/** extract ints for sample‑testing */
function parseNumbers(str) {
  const m = str.match(/-?\d+/g);
  return m ? m.map(Number) : [];
}

async function handleFetchAndStress(slug, panel, mode) {
  const q = await fetchProblemInfo(slug);
  if (!q) throw new Error('Problem not found');

  // Try fetching official solution from LeetCode
  let isAvailable = await fetchOfficialSolution(slug);
  console.log("LeetCode result:", isAvailable);

  if (isAvailable) {
    console.log("Fetched from LeetCode");
  } else {
    console.log("Not available on LeetCode, searching on GitHub...");

    isAvailable = await fetchGithubSolution(slug);
    if (isAvailable) {
      console.log("Fetched from GitHub");
    } else {
      console.log("Sorry, no solution available.");
    }
  }

  // Create working directory and copy templates
  const work = mkTempDir();
  copyTemplates(work);

  // SAMPLE MODE: only compile & run solution.cpp
  if (mode === 'runSamples') {
    execSync(`g++ -std=c++17 -O2 solution.cpp -o solution`, { cwd: work });

    const samples = extractSamples(q.content);
    if (!samples.length) throw new Error('No samples found');

    for (let i = 0; i < samples.length; i++) {
      panel.webview.postMessage({ command: 'progress', i: i+1, total: samples.length });
      const { input, output: expected } = samples[i];
      fs.writeFileSync(path.join(work, 'input.txt'), input);

      const solRaw = execSync(`./solution < input.txt`, { cwd: work }).toString().trim();
      const ok = JSON.stringify(parseNumbers(solRaw)) === JSON.stringify(parseNumbers(expected));

      if (!ok) {
        return panel.webview.postMessage({
          command:   'fail',
          caseIndex: i+1,
          input,
          expected,
          solution:  solRaw
        });
      }

      panel.webview.postMessage({
        command:   'sample',
        caseIndex: i+1,
        input,
        expected,
        solution:  solRaw
      });
    }

    return panel.webview.postMessage({ command: 'done' });
  }

  // STRESS MODE: compile gen.cpp, official.cpp, solution.cpp
  if (mode === 'runStress') {
    ['gen.cpp','official.cpp','solution.cpp'].forEach(src => {
      const exe = path.basename(src, '.cpp');
      execSync(`g++ -std=c++17 -O2 ${src} -o ${exe}`, { cwd: work });
    });

    const cfg      = vscode.workspace.getConfiguration();
    const maxTests = cfg.get('competitiveCompanion.testCount', 50);
    const toMs     = (cfg.get('competitiveCompanion.testTimeout', 2) * 1000);
    const outDir   = path.resolve(__dirname, '..', '..', 'stress tester');

    // Buffers for cumulative outputs
    let allInput       = '';
    let allSolOut      = '';
    let allofficialOut = '';

    for (let i = 1; i <= maxTests; i++) {
      panel.webview.postMessage({ command: 'progress', i, total: maxTests });

      // Generate input
      execSync(`./gen > input.txt`, { cwd: work });
      const inp = fs.readFileSync(path.join(work, 'input.txt'), 'utf8');

      // Run user's solution
      let solOut;
      try {
        solOut = execSync(`./solution < input.txt`, { cwd: work, timeout: toMs }).toString().trim();
      } catch (err) {
        solOut = `<<ERROR: ${err.killed ? 'timeout' : err.message}>>`;
      }

      // Run official solution
      let bruOut;
      try {
        bruOut = execSync(`./official < input.txt`, { cwd: work, timeout: toMs }).toString().trim();
      } catch (err) {
        bruOut = `<<ERROR: ${err.killed ? 'timeout' : err.message}>>`;
      }

      // Append to cumulative buffers
      allInput       += `=== Test #${i} ===\n${inp}\n\n`;
      allSolOut      += `=== Test #${i} ===\n${solOut}\n\n`;
      allofficialOut += `=== Test #${i} ===\n${bruOut}\n\n`;

      // On mismatch, dump and report
      if (solOut !== bruOut) {
        fs.writeFileSync(path.join(outDir, 'all_input.txt'),    allInput);
        fs.writeFileSync(path.join(outDir, 'all_solution.txt'), allSolOut);
        fs.writeFileSync(path.join(outDir, 'all_official.txt'), allofficialOut);

        return panel.webview.postMessage({
          command:   'fail',
          caseIndex: i,
          input:     inp,
          expected:  bruOut,
          solution:  solOut
        });
      }

      panel.webview.postMessage({ command: 'pass', caseIndex: i });
    }

    // All tests passed: dump buffers
    fs.writeFileSync(path.join(outDir, 'all_input.txt'),    allInput);
    fs.writeFileSync(path.join(outDir, 'all_solution.txt'), allSolOut);
    fs.writeFileSync(path.join(outDir, 'all_official.txt'), allofficialOut);

    return panel.webview.postMessage({ command: 'done' });
  }

  throw new Error(`Unknown mode: ${mode}`);
}

module.exports = { handleFetchAndStress };
