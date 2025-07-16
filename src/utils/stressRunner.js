// utils/stressRunner.js

const fs       = require('fs');
const path     = require('path');
const { execSync } = require('child_process');
const vscode   = require('vscode');

const { fetchProblemInfo, fetchOfficialSolution, fetchGithubSolution }       = require('./fetch.js');
const { mkTempDir, copyTemplates } = require('./makeDirs.js');
const { extractSamples }         = require('./parseProblem.js');

/** extract ints for sample‑testing */
function parseNumbers(str) {
  const m = str.match(/-?\d+/g);
  return m ? m.map(Number) : [];
}

async function handleFetchAndStress(slug, panel, mode) {
  const q = await fetchProblemInfo(slug);
  if (!q) throw new Error('Problem not found');

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

  // make temp dir and copy your gen.cpp, official.cpp, solution.cpp, stress.sh (if any)
  const work = mkTempDir();
  copyTemplates(work);

  // compile C++
  ['gen.cpp','official.cpp','solution.cpp'].forEach(src => {
    const exe = path.basename(src, '.cpp');
    execSync(`g++ -std=c++17 -O2 ${src} -o ${exe}`, { cwd: work });
  });

  // SAMPLE MODE (unchanged)
  if (mode === 'runSamples') {
    const samples = extractSamples(q.content);
    if (!samples.length) throw new Error('No samples found');

    for (let i = 0; i < samples.length; i++) {
      panel.webview.postMessage({ command:'progress', i:i+1, total: samples.length });
      const { input, output: expected } = samples[i];
      fs.writeFileSync(path.join(work,'input.txt'), input);

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

    return panel.webview.postMessage({ command:'done' });
  }

  // STRESS MODE
// inside handleFetchAndStress, replace the runStress block with:

if (mode === 'runStress') {
  const cfg      = vscode.workspace.getConfiguration();
  const maxTests = cfg.get('competitiveCompanion.testCount', 50);
  const toMs     = (cfg.get('competitiveCompanion.testTimeout', 2) * 1000);

  // point at your extension’s own folder:
  const outDir = path.resolve(__dirname, '..', '..', 'stress tester');

  // prepare cumulative buffers
  let allInput    = '';
  let allSolOut   = '';
  let allofficialOut = '';

  for (let i = 1; i <= maxTests; i++) {
    panel.webview.postMessage({ command:'progress', i, total: maxTests });

    // 1) generate
    execSync(`./gen > input.txt`, { cwd: work });
    const inp = fs.readFileSync(path.join(work, 'input.txt'), 'utf8');

    // 2) run solution
    let solOut;
    try {
      solOut = execSync(`./solution < input.txt`, { cwd: work, timeout: toMs })
                .toString().trim();
    } catch (err) {
      solOut = `<<ERROR: ${err.killed ? 'timeout' : err.message}>>`;
    }

    // 3) run official
    let bruOut;
    try {
      bruOut = execSync(`./official < input.txt`, { cwd: work, timeout: toMs })
                .toString().trim();
    } catch (err) {
      bruOut = `<<ERROR: ${err.killed ? 'timeout' : err.message}>>`;
    }

    // 4) append to cumulative buffers (with separators)
    allInput    += `=== Test #${i} ===\n${inp}\n\n`;
    allSolOut   += `=== Test #${i} ===\n${solOut}\n\n`;
    allofficialOut += `=== Test #${i} ===\n${bruOut}\n\n`;

    // 5) if mismatch, write out the three files and report failure immediately
    if (solOut !== bruOut) {
      // write cumulative files
      fs.writeFileSync(path.join(outDir, 'all_input.txt'),    allInput);
      fs.writeFileSync(path.join(outDir, 'all_solution.txt'), allSolOut);
      fs.writeFileSync(path.join(outDir, 'all_official.txt'),    allofficialOut);

      // report just this one failure
      return panel.webview.postMessage({
        command:   'fail',
        caseIndex: i,
        input:     inp,
        expected:  bruOut,
        solution:  solOut
      });
    }

    // otherwise passed test i
    panel.webview.postMessage({ command:'pass', caseIndex: i });
  }

  // if we finish all tests with no mismatches, write out the files one last time:
  fs.writeFileSync(path.join(outDir, 'all_input.txt'),    allInput);
  fs.writeFileSync(path.join(outDir, 'all_solution.txt'), allSolOut);
  fs.writeFileSync(path.join(outDir, 'all_official.txt'),    allofficialOut);

  return panel.webview.postMessage({ command:'done' });
}


  throw new Error(`Unknown mode: ${mode}`);
}

/**
 * common failure handler: writes out input/sol/official, then posts 'fail'
 */
function report(idx, label, err, work, outDir, panel, solOut = '', bruOut = '') {
  const inp     = fs.readFileSync(path.join(work,'input.txt'),'utf8');
  const expected= bruOut || '';
  const solution= solOut || '';

  // also dump into outDir if available
  if (outDir) {
    fs.writeFileSync(path.join(outDir, `input_${idx}.txt`),          inp);
    fs.writeFileSync(path.join(outDir, `solution_${idx}.txt`),     solution);
    fs.writeFileSync(path.join(outDir, `official_${idx}.txt`),        expected);
  }

  panel.webview.postMessage({
    command:   'fail',
    caseIndex: idx,
    input:     inp,
    expected,
    solution,
    error:     label + (err ? `: ${err.message}` : '')
  });
}

module.exports = { handleFetchAndStress }
