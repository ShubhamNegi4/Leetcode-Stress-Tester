const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const vscode = require('vscode');
const os = require('os');

const {
    fetchProblemByName,
    fetchProblemById,
    fetchOfficialSolution,
    fetchGithubSolution
} = require('./fetch.js');

const { extractSamples } = require('./parseProblem.js');
const { CANONICAL_TEMPLATE } = require('./canonicalTemplate');

// Import spawn from child_process
const { spawn } = require('child_process');

// --- UTILITY FUNCTIONS ---

function getWorkspaceRoot() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || !folders.length) throw new Error('No workspace folder open. Please open a project folder.');
    return folders[0].uri.fsPath;
}

function parseNumbers(str) {
    if (typeof str !== 'string') return [];
    const m = str.match(/-?\d+/g);
    return m ? m.map(Number) : [];
}

function formatSampleInput(input) {
    // Try to extract numbers and target from the sample input string
    // e.g. 'nums = [2,7,11,15], target = 9' => '[2,7,11,15]\n9'
    const arrMatch = input.match(/\[.*?\]/);
    const numArr = arrMatch ? arrMatch[0] : '[]';
    const targetMatch = input.match(/target\s*=\s*(-?\d+)/);
    const target = targetMatch ? targetMatch[1] : '0';
    // If the input is already in JSON-per-line, just return it
    if (/^\s*\[.*\]\s*\n\s*-?\d+\s*$/.test(input.trim())) {
        return input.trim();
    }
    // If we can't parse, log a warning and return the original
    if (!arrMatch || !targetMatch) {
        return input.trim();
    }
    return `${numArr}\n${target}`;
}

function getMTime(file) {
    try {
        return fs.statSync(file).mtimeMs;
    } catch {
        return 0;
    }
}

// --- SAMPLE MANAGEMENT ---

/**
 * Loads samples from input.txt file, maintaining user's ability to edit them
 */
function loadSamplesFromFile(workDir) {
    const inputTxtPath = path.join(workDir, 'textIO', 'input.txt');
    if (!fs.existsSync(inputTxtPath)) {
        throw new Error('input.txt not found. Please add your samples to textIO/input.txt or fetch the problem again.');
    }

    const fileContent = fs.readFileSync(inputTxtPath, 'utf8');
    // Match all blocks of: input, --- (on its own line), output
    const regex = /([\s\S]*?)\n\s*---+\s*\n([\s\S]*?)(?=\n\S|\n*$)/g;
    const samples = [];
    let match;
    while ((match = regex.exec(fileContent)) !== null) {
        const input = match[1].trim();
        const output = match[2].trim();
        if (input && output) {
            samples.push({ input, output });
        }
    }
    if (samples.length === 0) {
        throw new Error('No valid samples found in input.txt.');
    }
    return samples;
}

// --- CORE LOGIC: COMPILATION ---

/**
 * Compiles a C++ source file if it's newer than the executable or if the executable doesn't exist.
 * Throws a detailed error on compilation failure.
 */
function compileIfNeeded(options) {
    const { src, exe, flags, cwd, compiler } = options;
    const srcPath = path.join(cwd, src);
    const exePath = path.join(cwd, exe);

    if (!fs.existsSync(srcPath)) {
        return `Source file not found: ${src}`;
    }
    // Always recompile, regardless of timestamps
    const cmd = [compiler, ...flags, srcPath, '-o', exePath];
    const start = Date.now();
    try {
        const result = spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: 'utf8', shell: false });
        const elapsed = ((Date.now() - start) / 1000).toFixed(2);
        if (result.status !== 0) {
            let errorMsg = `Compilation failed for ${src} (took ${elapsed}s):\n`;
            errorMsg += (result.stderr || '') + (result.stdout || '');
            return errorMsg.trim();
        }
    } catch (e) {
        return `Compilation command failed for ${src}: ${e.message}`;
    }
    return null; // No error
}

/**
 * Manages the compilation of all necessary C++ files.
 */
function compileSources(workDir, mode, panel) {
    const isWindows = process.platform === 'win32';
    const exeExt = isWindows ? '.exe' : '';
    let compiler;
    try {
        execSync('clang++ --version', { stdio: 'ignore' });
        compiler = 'clang++';
    } catch {
        try {
            execSync('g++ --version', { stdio: 'ignore' });
            compiler = 'g++';
        } catch {
            throw new Error('No C++ compiler found. Please install g++ or clang++.');
        }
    }
    panel.webview.postMessage({ command: 'log', message: `Using compiler: ${compiler}` });
    const getFlags = (baseFlagsArr) => {
        if (compiler === 'clang++') {
            return baseFlagsArr.map(flag =>
                flag === '-march=native' ? '-march=native' :
                flag === '-mtune=native' ? '' :
                flag === '-flto' ? '-flto=thin' :
                flag
            ).filter(Boolean);
        }
        return baseFlagsArr;
    };
    // In compileSources, add precompiled header generation
    const pchDir = path.join(workDir, 'pch');
    if (!fs.existsSync(pchDir)) {
        fs.mkdirSync(pchDir);
    }
    const stdcppHeader = path.join(pchDir, 'stdc++.h');
    const pchPath = path.join(pchDir, 'stdc++.h.gch');
    if (!fs.existsSync(pchPath)) {
        panel.webview.postMessage({ command: 'log', message: 'Generating precompiled header...' });
        fs.writeFileSync(stdcppHeader, '#include <bits/stdc++.h>');
        const pchCmd = `${compiler} -std=c++17 "${stdcppHeader}" -o "${pchPath}"`;
        spawnSync(pchCmd, { cwd: pchDir, shell: true });
    }
    const pchFlagArr = fs.existsSync(pchPath) ? ['-include', stdcppHeader] : [];
    // Change solFlags to -O2 for faster compile
    const solFlags = getFlags(['-std=c++17', '-O2', '-pipe', '-march=native', '-DNDEBUG', ...pchFlagArr]);
    const bruteFlags = getFlags(['-std=c++17', '-O1', '-pipe', '-DNDEBUG', ...pchFlagArr]);
    const genFlags = getFlags(['-std=c++17', '-O2', '-pipe', '-DNDEBUG', ...pchFlagArr]);
    const compilations = [];
    if (mode === 'runSamples' || mode === 'runStress') {
        compilations.push({ src: 'solution.cpp', exe: `solution${exeExt}`, flags: solFlags, cwd: workDir, compiler });
    }
    if (mode === 'runStress') {
        compilations.push({ src: 'gen.cpp', exe: `gen${exeExt}`, flags: genFlags, cwd: workDir, compiler });
        compilations.push({ src: 'brute.cpp', exe: `brute${exeExt}`, flags: bruteFlags, cwd: workDir, compiler });
    }
    const start = Date.now();
    for (const comp of compilations) {
        panel.webview.postMessage({ command: 'log', message: `Compiling ${comp.src}...` });
        const error = compileIfNeeded(comp);
        if (error) {
            if (comp.src !== 'brute.cpp') {
                panel.webview.postMessage({ command: 'status', text: `Compilation error in ${comp.src}: ${error}`, type: 'error' });
                throw new Error(error);
            } else {
                panel.webview.postMessage({ command: 'log', message: `Warning: Could not compile ${comp.src}. Stress test requires it.` });
            }
        }
    }
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    panel.webview.postMessage({ command: 'log', message: `Compilation finished in ${elapsed}s.` });
    return { exeExt, compiler };
}

// --- CORE LOGIC: TEST RUNNERS ---

function getOutput(proc, name, timeLimitMs) {
    if (proc.error) {
        if (proc.error.code === 'ETIMEDOUT') {
            return { error: 'timeout', message: `⏰ ${name}.cpp: Time Limit Exceeded (${timeLimitMs} ms)` };
        }
        return { error: 'exec', message: `<<ERROR: ${proc.error.message}>>` };
    }
    if (proc.signal) {
        return { error: 'signal', message: `💥 ${name}.cpp: Process terminated by signal: ${proc.signal}` };
    }
    if (proc.status !== 0) {
        let reason = proc.stderr ? proc.stderr.split('\n').find(line => line.trim()) : '';
        reason = reason || `Exited with code ${proc.status}`;
        return { error: 'runtime', message: `❌ ${name}.cpp: ${reason}` };
    }
    if (!proc.stdout.trim()) {
        return { error: 'no_output', message: `⚠️ ${name}.cpp: No output produced` };
    }
    return { error: null, output: proc.stdout.trim() };
}

/**
 * Runs sample tests in parallel using a worker pool.
 * Samples are loaded from textIO/input.txt but passed in-memory to avoid disk I/O during testing.
 */
async function runSampleTests(workDir, exeExt, panel) {
    let samples;
    try {
        samples = loadSamplesFromFile(workDir);
    } catch (err) {
        panel.webview.postMessage({ command: 'status', text: err.message, type: 'error' });
        return;
    }
    if (!samples.length) {
        panel.webview.postMessage({ command: 'status', text: 'No valid samples found.', type: 'error' });
        return;
    }
    const isWindows = process.platform === 'win32';
    const cpuCount = Math.min(isWindows ? 4 : Math.max(4, os.cpus().length), 16);
    const solCmd = path.join(workDir, `solution${exeExt}`);
    let nextSampleIndex = 0;
    let failFound = false;
    const startAll = Date.now();
    const worker = async () => {
        while (true) {
            const i = nextSampleIndex++;
            if (i >= samples.length || failFound) {
                return;
            }
            const testStart = Date.now();
            panel.webview.postMessage({ command: 'progress', i: i + 1, total: samples.length });
            const { input, output: expected } = samples[i];
            const formattedInput = formatSampleInput(input);
            let solProc = spawnSync(solCmd, { input: formattedInput, encoding: 'utf8', shell: false, timeout: 2000 });
            const solResult = getOutput(solProc, 'solution', 2000);
            const elapsed = ((Date.now() - testStart) / 1000).toFixed(2);
            if (solResult.error && !failFound) {
                failFound = true;
                panel.webview.postMessage({ command: 'status', text: `${solResult.message} (Test ${i + 1}, ${elapsed}s)`, type: 'error' });
                return;
            }
            let solRaw = solResult.output;
            if (!solRaw) solRaw = "<<NO OUTPUT>>";
            const ok = JSON.stringify(parseNumbers(solRaw)) === JSON.stringify(parseNumbers(expected));
            if (!ok && !failFound) {
                failFound = true;
                panel.webview.postMessage({
                    command: 'fail',
                    caseIndex: i + 1,
                    input: formattedInput,
                    expected,
                    solution: solRaw,
                    time: elapsed
                });
                return;
            }
            panel.webview.postMessage({
                command: 'sample',
                caseIndex: i + 1,
                input: formattedInput,
                expected,
                solution: solRaw,
                passed: ok,
                time: elapsed
            });
        }
    };
    const workers = Array.from({ length: Math.min(cpuCount, samples.length) }, () => worker());
    await Promise.all(workers);
    const totalElapsed = ((Date.now() - startAll) / 1000).toFixed(2);
    panel.webview.postMessage({ command: 'log', message: `Sample tests finished in ${totalElapsed}s.` });
    if (!failFound) {
        panel.webview.postMessage({ command: 'done' });
    }
}

/**
 * Runs stress tests in parallel using a worker pool.
 */
async function runStressTests(workDir, exeExt, panel) {
    const cfg = vscode.workspace.getConfiguration('leetcodeStressTester');
    const maxTests = cfg.get('testCount', 100);
    const timeLimit = cfg.get('timeLimitMs', 2000);
    const isWindows = process.platform === 'win32';
    const cpuCount = Math.min(isWindows ? 4 : Math.max(4, os.cpus().length), 16);

    const genCmd = path.join(workDir, `gen${exeExt}`);
    const solCmd = path.join(workDir, `solution${exeExt}`);
    const bruteCmd = path.join(workDir, `brute${exeExt}`);
    
    if (!fs.existsSync(bruteCmd)) {
        panel.webview.postMessage({ command: 'status', text: 'Cannot run stress test: `brute` executable not found. Ensure `brute.cpp` exists and compiles.', type: 'error' });
        return;
    }
    if (!fs.existsSync(genCmd)) {
        panel.webview.postMessage({ command: 'status', text: 'Cannot run stress test: `gen` executable not found. Ensure `gen.cpp` exists and compiles.', type: 'error' });
        return;
    }
    if (!fs.existsSync(solCmd)) {
        panel.webview.postMessage({ command: 'status', text: 'Cannot run stress test: `solution` executable not found. Ensure `solution.cpp` exists and compiles.', type: 'error' });
        return;
    }

    let nextTestIndex = 1;
    let failFound = false;
    let allInput = '';
    let allSolOut = '';
    let allBruteOut = '';
    const startAll = Date.now();

    const worker = async () => {
        while (true) {
            const i = nextTestIndex++;
            if (i > maxTests || failFound) {
                return;
            }
            const testStart = Date.now();
            panel.webview.postMessage({ command: 'progress', i, total: maxTests });
            // Generate input
            const genProc = spawnSync(genCmd, { encoding: 'utf8', shell: false });
            const genResult = getOutput(genProc, 'gen', timeLimit);
            if (genResult.error && !failFound) {
                failFound = true;
                panel.webview.postMessage({ command: 'status', text: `${genResult.message} (Test ${i})`, type: 'error' });
                return;
            }
            const input = genResult.output;
            // Run solution and brute force
            const solProc = spawnSync(solCmd, { input, encoding: 'utf8', shell: false, timeout: timeLimit });
            const bruteProc = spawnSync(bruteCmd, { input, encoding: 'utf8', shell: false, timeout: timeLimit });
            const solResult = getOutput(solProc, 'solution', timeLimit);
            const bruteResult = getOutput(bruteProc, 'brute', timeLimit);
            const elapsed = ((Date.now() - testStart) / 1000).toFixed(2);
            if (solResult.error && !failFound) {
                failFound = true;
                panel.webview.postMessage({ command: 'status', text: `${solResult.message} (Test ${i}, ${elapsed}s)`, type: 'error' });
                return;
            }
            if (bruteResult.error && !failFound) {
                failFound = true;
                panel.webview.postMessage({ command: 'status', text: `${bruteResult.message} (Test ${i}, ${elapsed}s)`, type: 'error' });
                return;
            }
            allInput += `=== Test #${i} ===\n${input}\n\n`;
            allSolOut += `=== Test #${i} ===\n${solResult.output}\n\n`;
            allBruteOut += `=== Test #${i} ===\n${bruteResult.output}\n\n`;
            if (solResult.output !== bruteResult.output && !failFound) {
                failFound = true;
                panel.webview.postMessage({
                    command: 'fail',
                    caseIndex: i,
                    input: input,
                    expected: bruteResult.output,
                    solution: solResult.output,
                    time: elapsed
                });
                return;
            }
            if (!failFound) {
                panel.webview.postMessage({ command: 'pass', caseIndex: i, time: elapsed });
            }
        }
    };
    const workers = Array.from({ length: Math.min(cpuCount, maxTests) }, () => worker());
    await Promise.all(workers);
    const totalElapsed = ((Date.now() - startAll) / 1000).toFixed(2);
    panel.webview.postMessage({ command: 'log', message: `Stress tests finished in ${totalElapsed}s.` });

    // Save stress test outputs for debugging
    const textIODir = path.join(workDir, 'textIO');
    if (!fs.existsSync(textIODir)) {
        fs.mkdirSync(textIODir, { recursive: true });
    }
    fs.writeFileSync(path.join(textIODir, 'all_input.txt'), allInput);
    fs.writeFileSync(path.join(textIODir, 'solution_output.txt'), allSolOut);
    fs.writeFileSync(path.join(textIODir, 'brute_output.txt'), allBruteOut);

    if (!failFound) {
        panel.webview.postMessage({ command: 'done' });
    }
}

// --- PROBLEM FETCHING ---

async function handleFetchProblem(slug, panel) {
    try {
        const workspaceRoot = getWorkspaceRoot();
        const workDir = path.join(workspaceRoot, 'stress tester');
        // Normalize slug: lowercase, replace spaces with dashes, preserve numbers
        let normalizedSlug = slug;
        if (!/^\d+$/.test(slug)) {
            normalizedSlug = slug.trim().toLowerCase().replace(/\s+/g, '-');
        }
        const isInteger = /^\d+$/.test(normalizedSlug);
        const problemTitle = isInteger
            ? await fetchProblemById(Number(normalizedSlug))
            : normalizedSlug;

        if (!problemTitle) throw new Error("Problem not found");

        const q = await fetchProblemByName(problemTitle);
        const cppSnippet = q.codeSnippets?.find(s => s.langSlug === 'cpp')?.code;
        if (!cppSnippet) throw new Error('No C++ solution snippet found');

        // Create stress tester directory if needed
        if (!fs.existsSync(workDir)) {
            fs.mkdirSync(workDir, { recursive: true });
        }

        const utilsDir = path.join(workDir, 'utils');
        const textIODir = path.join(workDir, 'textIO');
        if (!fs.existsSync(utilsDir)) {
            fs.mkdirSync(utilsDir, { recursive: true });
        }
        if (!fs.existsSync(textIODir)) {
            fs.mkdirSync(textIODir, { recursive: true });
        }

        // Ensure json.hpp exists
        const jsonSrc = path.resolve(__dirname, '..', '..', 'stress tester', 'json.hpp');
        const jsonDst = path.join(utilsDir, 'json.hpp');
        if (fs.existsSync(jsonSrc) && !fs.existsSync(jsonDst)) {
            fs.copyFileSync(jsonSrc, jsonDst);
        }

        // Save all sample test cases to textIO/input.txt, separated by blank lines
        const samples = extractSamples(q.content);
        function toLeetCodeJsonInput(sampleInput) {
            // Try to extract numbers and target from the sample input string
            // e.g. 'nums = [2,7,11,15], target = 9' => '[2,7,11,15]\n9'
            const arrMatch = sampleInput.match(/\[.*?\]/);
            const numArr = arrMatch ? arrMatch[0] : '[]';
            const targetMatch = sampleInput.match(/target\s*=\s*(-?\d+)/);
            const target = targetMatch ? targetMatch[1] : '0';
            // If the input is already in JSON-per-line, just return it
            if (/^\s*\[.*\]\s*\n\s*-?\d+\s*$/.test(sampleInput.trim())) {
                return sampleInput.trim();
            }
            // If we can't parse, log a warning and return the original
            if (!arrMatch || !targetMatch) {
                return sampleInput.trim();
            }
            return `${numArr}\n${target}`;
        }
        if (samples.length > 0) {
            const sampleContent = samples.map(s => `${toLeetCodeJsonInput(s.input)}\n---\n${s.output.trim()}`).join('\n\n');
            fs.writeFileSync(path.join(textIODir, 'input.txt'), sampleContent);
        } else if (q.sampleTestCase) {
            // Split sampleTestCase into input/output pairs if possible
            const lines = q.sampleTestCase.split(/\n+/).map(l => l.trim()).filter(Boolean);
            let formatted = '';
            for (let i = 0; i < lines.length; i += 2) {
                const input = lines[i];
                const output = lines[i + 1] || '';
                formatted += `${toLeetCodeJsonInput(input)}\n---\n${output}\n\n`;
            }
            fs.writeFileSync(path.join(textIODir, 'input.txt'), formatted.trim());
        } else {
            throw new Error('No sample test cases found');
        }

        // Always copy template.cpp and gen.cpp if not present
        const templateSrc = path.resolve(__dirname, '..', '..', 'stress tester', 'template.cpp');
        const templateDst = path.join(utilsDir, 'template.cpp');
        if (fs.existsSync(templateSrc) && !fs.existsSync(templateDst)) {
            fs.copyFileSync(templateSrc, templateDst);
        }
        const genSrc = path.resolve(__dirname, '..', '..', 'stress tester', 'gen.cpp');
        const genDst = path.join(workDir, 'gen.cpp');
        if (fs.existsSync(genSrc) && !fs.existsSync(genDst)) {
            fs.copyFileSync(genSrc, genDst);
        }

        // Ensure canonical template.cpp exists in stress tester/utils
        const canonicalTemplatePath = path.resolve(workspaceRoot, 'stress tester', 'utils', 'template.cpp');
        if (!fs.existsSync(canonicalTemplatePath)) {
            fs.writeFileSync(canonicalTemplatePath, CANONICAL_TEMPLATE);
        }
        const templateContent = fs.readFileSync(canonicalTemplatePath, 'utf8');

        // Parse function name and params from cppSnippet (LeetCode user solution)
        let funcMatch = cppSnippet.match(/([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
        let funcName = 'FUNCTION_NAME';
        let funcParams = 'PARAMS';
        if (funcMatch) {
            funcName = funcMatch[1];
            funcParams = funcMatch[2].split(',').map(s => s.trim().split(' ').pop().replace(/&|\*/g, '')).filter(Boolean).join(', ');
        }
        // Replace all [i] and [j] with .at(i) and .at(j) in the user code for safety
        let safeCppSnippet = cppSnippet.replace(/([a-zA-Z0-9_]+)\s*\[\s*([a-zA-Z0-9_]+)\s*\]/g, '$1.at($2)');
        let solutionContent = templateContent.replace('sol.FUNCTION_NAME(PARAMS)', `sol.${funcName}(${funcParams})`);
        solutionContent = solutionContent.replace('// $LEETCODE_FUNCTION$', safeCppSnippet);
        fs.writeFileSync(path.join(workDir, 'solution.cpp'), solutionContent);

        // Fetch official solution
        let isAvailable = await fetchOfficialSolution(problemTitle, workDir);
        if (!isAvailable) {
            isAvailable = await fetchGithubSolution(problemTitle, workDir);
        }

        // Always use the canonical template for brute.cpp, inserting the official solution if available
        const brutePath = path.join(workDir, 'brute.cpp');
        let bruteContent = templateContent;
        if (isAvailable && fs.existsSync(brutePath)) {
            const bruteSnippet = fs.readFileSync(brutePath, 'utf8');
            let bFuncMatch = bruteSnippet.match(/([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
            let bFuncName = 'FUNCTION_NAME';
            let bFuncParams = 'PARAMS';
            if (bFuncMatch) {
                bFuncName = bFuncMatch[1];
                bFuncParams = bFuncMatch[2].split(',').map(s => s.trim().split(' ').pop().replace(/&|\*/g, '')).filter(Boolean).join(', ');
            }
            // Replace all [i] and [j] with .at(i) and .at(j) in the brute code for safety
            let safeBruteSnippet = bruteSnippet.replace(/([a-zA-Z0-9_]+)\s*\[\s*([a-zA-Z0-9_]+)\s*\]/g, '$1.at($2)');
            bruteContent = bruteContent.replace('sol.FUNCTION_NAME(PARAMS)', `sol.${bFuncName}(${bFuncParams})`);
            bruteContent = bruteContent.replace('// $LEETCODE_FUNCTION$', safeBruteSnippet);
        } else {
            bruteContent = bruteContent.replace('// $LEETCODE_FUNCTION$', '// No official solution available for this problem.');
            bruteContent = bruteContent.replace('sol.FUNCTION_NAME(PARAMS)', 'sol.FUNCTION_NAME(PARAMS)');
        }
        fs.writeFileSync(brutePath, bruteContent);

        // At the end, write a marker file to indicate successful fetch (store the canonical slug/titleSlug)
        fs.writeFileSync(path.join(workDir, '.fetched'), problemTitle);
    } catch (error) {
        vscode.window.showErrorMessage(`Fetch failed: ${error.message}`);
        if (panel && panel.webview) {
            panel.webview.postMessage({
                command: 'status',
                text: `Fetch failed: ${error.message}`,
                type: 'error'
            });
        }
        // Remove marker if fetch failed
        try {
            const workspaceRoot = getWorkspaceRoot();
            const workDir = path.join(workspaceRoot, 'stress tester');
            const marker = path.join(workDir, '.fetched');
            if (fs.existsSync(marker)) fs.unlinkSync(marker);
        } catch {}
        throw error;
    }
}

async function handleFetchAndStress(slug, panel, mode) {
    try {
        const workspaceRoot = getWorkspaceRoot();
        const workDir = path.join(workspaceRoot, 'stress tester');
        if (!fs.existsSync(workDir)) {
            fs.mkdirSync(workDir, { recursive: true });
        }

        // Normalize slug: lowercase, replace spaces with dashes, preserve numbers
        let normalizedSlug = slug;
        if (!/^\d+$/.test(slug)) {
            normalizedSlug = slug.trim().toLowerCase().replace(/\s+/g, '-');
        }

        // Check for marker file and match slug
        const marker = path.join(workDir, '.fetched');
        if (!fs.existsSync(marker)) {
            panel.webview.postMessage({
                command: 'status',
                text: 'This problem was not successfully fetched. Please fetch a valid problem before running tests.',
                type: 'error'
            });
            return;
        }
        // Read the fetched problem slug/title
        const fetchedSlug = fs.readFileSync(marker, 'utf8').trim();
        const isInteger = /^\d+$/.test(normalizedSlug);
        const problemTitle = isInteger ? await fetchProblemById(Number(normalizedSlug)) : normalizedSlug;
        if (!problemTitle) throw new Error("Problem not found");
        // Only allow running if the fetched problem matches the requested one
        if (problemTitle !== fetchedSlug) {
            panel.webview.postMessage({
                command: 'status',
                text: 'The problem you are trying to test was not the one most recently fetched. Please fetch this problem first.',
                type: 'error'
            });
            return;
        }

        // --- Step 1: Fetch problem data ---
        panel.webview.postMessage({ command: 'log', message: 'Fetching problem data...' });
        const q = await fetchProblemByName(problemTitle);
        const samples = extractSamples(q.content);
        if (samples.length === 0 && q.sampleTestCase) {
            samples.push({ input: q.sampleTestCase, output: "Expected output not available in this format" });
        }
        if (samples.length === 0) {
            throw new Error('No sample test cases found for this problem.');
        }
        
        // --- Step 2: Compile binaries ---
        const { exeExt } = compileSources(workDir, mode, panel);
        panel.webview.postMessage({ command: 'log', message: 'Compilation complete.' });

        // --- Step 3: Run selected mode ---
        if (mode === 'runSamples') {
            panel.webview.postMessage({ command: 'log', message: 'Running sample tests...' });
            await runSampleTests(workDir, exeExt, panel);
        } else if (mode === 'runStress') {
            panel.webview.postMessage({ command: 'log', message: 'Starting stress test...' });
            await runStressTests(workDir, exeExt, panel);
        } else {
            throw new Error(`Unknown mode: ${mode}`);
        }

    } catch (error) {
        panel.webview.postMessage({ command: 'error', error: error.message });
    }
}

module.exports = { handleFetchProblem, handleFetchAndStress };