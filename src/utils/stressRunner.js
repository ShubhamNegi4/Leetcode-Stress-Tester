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
    const numbers = input.match(/-?\d+/g) || [];
    if (numbers.length < 2) return input;
    const target = numbers.pop();
    const array = `[${numbers.join(',')}]`;
    return `${array}\n${target}\n`;
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
        throw new Error('input.txt not found. Please add your samples to textIO/input.txt.');
    }

    const fileContent = fs.readFileSync(inputTxtPath, 'utf8');
    const rawSamples = fileContent.split(/\n\s*\n/).filter(Boolean);
    const samples = [];

    for (const raw of rawSamples) {
        const parts = raw.split(/\n---\n/);
        if (parts.length === 2) {
            samples.push({ 
                input: parts[0].trim(), 
                output: parts[1].trim() 
            });
        } else {
            throw new Error('Each sample in input.txt must have input, a line with --- and expected output, separated by blank lines.');
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

    if (!fs.existsSync(exePath) || getMTime(srcPath) > getMTime(exePath)) {
        const cmd = `${compiler} ${flags} "${srcPath}" -o "${exePath}"`;
        try {
            const result = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8' });
            if (result.status !== 0) {
                throw new Error(`Compilation failed for ${src}:\n${result.stderr || result.stdout}`);
            }
        } catch (e) {
            throw new Error(`Compilation command failed for ${src}: ${e.message}`);
        }
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

    const getFlags = (baseFlags) => {
        if (compiler === 'clang++') {
            return baseFlags
                .replace(/-march=native/g, '-march=native')
                .replace(/-mtune=native/g, '')
                .replace(/-flto/g, '-flto=thin');
        }
        return baseFlags;
    };

    // Check if precompiled header exists
    const pchPath = path.join(workDir, 'pch', 'stdc++.h.gch');
    const pchFlag = fs.existsSync(pchPath) ? '-include pch/stdc++.h.gch' : '';
    
    const solFlags = getFlags(`-std=c++17 -O3 -pipe -march=native -mtune=native -flto -ffast-math -funroll-loops -fomit-frame-pointer -DNDEBUG ${pchFlag}`);
    const bruteFlags = getFlags(`-std=c++17 -O1 -pipe -DNDEBUG ${pchFlag}`);
    const genFlags = getFlags(`-std=c++17 -O2 -pipe -DNDEBUG ${pchFlag}`);

    const compilations = [];
    if (mode === 'runSamples' || mode === 'runStress') {
        compilations.push({ src: 'solution.cpp', exe: `solution${exeExt}`, flags: solFlags, cwd: workDir, compiler });
    }
    if (mode === 'runStress') {
        compilations.push({ src: 'gen.cpp', exe: `gen${exeExt}`, flags: genFlags, cwd: workDir, compiler });
        compilations.push({ src: 'brute.cpp', exe: `brute${exeExt}`, flags: bruteFlags, cwd: workDir, compiler });
    }

    for (const comp of compilations) {
        panel.webview.postMessage({ command: 'log', message: `Compiling ${comp.src}...` });
        const error = compileIfNeeded(comp);
        if (error) {
            if (comp.src !== 'brute.cpp') throw new Error(error);
            else panel.webview.postMessage({ command: 'log', message: `Warning: Could not compile ${comp.src}. Stress test requires it.` });
        }
    }
    return { exeExt, compiler };
}

// --- CORE LOGIC: TEST RUNNERS ---

/**
 * Runs sample tests in parallel using a worker pool.
 * Samples are loaded from textIO/input.txt but passed in-memory to avoid disk I/O during testing.
 */
async function runSampleTests(workDir, exeExt, panel) {
    const samples = loadSamplesFromFile(workDir);
    const cpuCount = Math.min(Math.max(4, os.cpus().length), 16);
    const solCmd = path.join(workDir, `solution${exeExt}`);

    let nextSampleIndex = 0;
    let failFound = false;

    const worker = async () => {
        while (true) {
            const i = nextSampleIndex++;
            if (i >= samples.length || failFound) {
                return;
            }

            panel.webview.postMessage({ command: 'progress', i: i + 1, total: samples.length });

            const { input, output: expected } = samples[i];
            const formattedInput = formatSampleInput(input);
            const solProc = spawnSync(solCmd, { input: formattedInput, encoding: 'utf8', shell: false, timeout: 2000 });
            
            let solRaw;
            if (solProc.error) {
                solRaw = `<<ERROR: ${solProc.error.message}>>`;
            } else if (solProc.status !== 0) {
                 solRaw = `<<RUNTIME ERROR>>\n${solProc.stderr}`;
            } else {
                solRaw = solProc.stdout.trim();
            }

            const ok = JSON.stringify(parseNumbers(solRaw)) === JSON.stringify(parseNumbers(expected));

            if (!ok && !failFound) {
                failFound = true;
                panel.webview.postMessage({
                    command: 'fail',
                    caseIndex: i + 1,
                    input: formattedInput,
                    expected,
                    solution: solRaw
                });
                return;
            }

            panel.webview.postMessage({
                command: 'sample',
                caseIndex: i + 1,
                input: formattedInput,
                expected,
                solution: solRaw,
                passed: ok
            });
        }
    };

    const workers = Array.from({ length: Math.min(cpuCount, samples.length) }, () => worker());
    await Promise.all(workers);

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
    const cpuCount = Math.min(Math.max(4, os.cpus().length), 16);

    const genCmd = path.join(workDir, `gen${exeExt}`);
    const solCmd = path.join(workDir, `solution${exeExt}`);
    const bruteCmd = path.join(workDir, `brute${exeExt}`);
    
    if (!fs.existsSync(bruteCmd)) {
        throw new Error("Cannot run stress test: `brute` executable not found. Ensure `brute.cpp` exists and compiles.");
    }

    let nextTestIndex = 1;
    let failFound = false;
    let allInput = '';
    let allSolOut = '';
    let allBruteOut = '';

    const worker = async () => {
        while (true) {
            const i = nextTestIndex++;
            if (i > maxTests || failFound) {
                return;
            }

            panel.webview.postMessage({ command: 'progress', i, total: maxTests });

            // Generate input
            const genProc = spawnSync(genCmd, { encoding: 'utf8', shell: false });
            if (genProc.status !== 0) {
                if (!failFound) {
                    failFound = true;
                    panel.webview.postMessage({ command: 'error', error: `Generator failed on test #${i}:\n${genProc.stderr}` });
                }
                return;
            }
            const input = genProc.stdout;

            // Run solution and brute force
            const solProc = spawnSync(solCmd, { input, encoding: 'utf8', shell: false, timeout: timeLimit });
            const bruteProc = spawnSync(bruteCmd, { input, encoding: 'utf8', shell: false, timeout: timeLimit });

            const getOutput = (proc, name) => {
                if (proc.error?.code === 'ETIMEDOUT') return '<<TIMEOUT>>';
                if (proc.error) return `<<ERROR: ${proc.error.message}>>`;
                if (proc.status !== 0) return `<<RUNTIME ERROR>>\n${proc.stderr}`;
                return proc.stdout.trim();
            };

            const solOut = getOutput(solProc, 'Solution');
            const bruteOut = getOutput(bruteProc, 'Brute');

            // Store outputs for debugging
            allInput += `=== Test #${i} ===\n${input}\n\n`;
            allSolOut += `=== Test #${i} ===\n${solOut}\n\n`;
            allBruteOut += `=== Test #${i} ===\n${bruteOut}\n\n`;

            if (solOut !== bruteOut && !failFound) {
                failFound = true;
                panel.webview.postMessage({
                    command: 'fail',
                    caseIndex: i,
                    input: input,
                    expected: bruteOut,
                    solution: solOut
                });
                return;
            }
            
            if (!failFound) {
                panel.webview.postMessage({ command: 'pass', caseIndex: i });
            }
        }
    };
    
    const workers = Array.from({ length: Math.min(cpuCount, maxTests) }, () => worker());
    await Promise.all(workers);

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

async function handleFetchProblem(slug) {
    try {
        const workspaceRoot = getWorkspaceRoot();
        const workDir = path.join(workspaceRoot, 'stress tester');
        const isInteger = /^\d+$/.test(slug);
        const problemTitle = isInteger
            ? await fetchProblemById(Number(slug))
            : slug;

        if (!problemTitle) throw new Error("Problem not found");

        const q = await fetchProblemByName(problemTitle);
        const cppSnippet = q.codeSnippets?.find(s => s.langSlug === 'cpp')?.code;
        if (!cppSnippet) throw new Error('No C++ solution snippet found');

        // Create stress tester directory if needed
        if (!fs.existsSync(workDir)) {
            fs.mkdirSync(workDir, { recursive: true });
        }

        // Create subdirectories
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
        if (samples.length > 0) {
            const sampleContent = samples.map(s => `${s.input.trim()}\n---\n${s.output.trim()}`).join('\n\n');
            fs.writeFileSync(path.join(textIODir, 'input.txt'), sampleContent);
        } else if (q.sampleTestCase) {
            fs.writeFileSync(path.join(textIODir, 'input.txt'), q.sampleTestCase);
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

        // Use the full template if present for solution.cpp
        let templateContent = fs.existsSync(templateDst)
            ? fs.readFileSync(templateDst, 'utf8')
            : `#include <bits/stdc++.h>\nusing namespace std;\n\n// $SOLUTION_PLACEHOLDER\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    \n    // Your code here\n    \n    return 0;\n}`;

        // Parse function name and params from cppSnippet (LeetCode user solution)
        let funcMatch = cppSnippet.match(/([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
        let funcName = 'FUNCTION_NAME';
        let funcParams = 'PARAMS';
        if (funcMatch) {
            funcName = funcMatch[1];
            funcParams = funcMatch[2].split(',').map(s => s.trim().split(' ').pop().replace(/&|\*/g, '')).filter(Boolean).join(', ');
        }
        let solutionContent = templateContent.replace('sol.FUNCTION_NAME(PARAMS)', `sol.${funcName}(${funcParams})`);
        solutionContent = solutionContent.replace('// $LEETCODE_FUNCTION$', cppSnippet);
        fs.writeFileSync(path.join(workDir, 'solution.cpp'), solutionContent);

        // Fetch official solution
        let isAvailable = await fetchOfficialSolution(problemTitle, workDir);
        if (!isAvailable) {
            isAvailable = await fetchGithubSolution(problemTitle, workDir);
        }

        // Always use the template for brute.cpp, inserting the official solution if available
        const brutePath = path.join(workDir, 'brute.cpp');
        let bruteTemplate = fs.existsSync(templateDst)
            ? fs.readFileSync(templateDst, 'utf8')
            : `#include <bits/stdc++.h>\nusing namespace std;\n\n// $SOLUTION_PLACEHOLDER\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    \n    // Your code here\n    \n    return 0;\n}`;
        if (isAvailable && fs.existsSync(brutePath)) {
            const bruteSnippet = fs.readFileSync(brutePath, 'utf8');
            let bFuncMatch = bruteSnippet.match(/([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
            let bFuncName = 'FUNCTION_NAME';
            let bFuncParams = 'PARAMS';
            if (bFuncMatch) {
                bFuncName = bFuncMatch[1];
                bFuncParams = bFuncMatch[2].split(',').map(s => s.trim().split(' ').pop().replace(/&|\*/g, '')).filter(Boolean).join(', ');
            }
            let bruteContent = bruteTemplate.replace('sol.FUNCTION_NAME(PARAMS)', `sol.${bFuncName}(${bFuncParams})`);
            bruteContent = bruteContent.replace('// $LEETCODE_FUNCTION$', bruteSnippet);
            fs.writeFileSync(brutePath, bruteContent);
        } else {
            // No official solution available
            fs.writeFileSync(brutePath, '// No official solution available for this problem.\n');
        }

    } catch (error) {
        vscode.window.showErrorMessage(`Fetch failed: ${error.message}`);
    }
}

// --- MAIN HANDLER ---

async function handleFetchAndStress(slug, panel, mode) {
    try {
        const workspaceRoot = getWorkspaceRoot();
        const workDir = path.join(workspaceRoot, 'stress tester');
        if (!fs.existsSync(workDir)) {
            fs.mkdirSync(workDir, { recursive: true });
        }

        // --- Step 1: Fetch problem data ---
        panel.webview.postMessage({ command: 'log', message: 'Fetching problem data...' });
        const isInteger = /^\d+$/.test(slug);
        const problemTitle = isInteger ? await fetchProblemById(Number(slug)) : slug;
        if (!problemTitle) throw new Error("Problem not found");

        const q = await fetchProblemByName(problemTitle);
        const samples = extractSamples(q.content);
        if (samples.length === 0 && q.sampleTestCase) {
            samples.push({ input:w q.sampleTestCase, output: "Expected output not available in this format" });
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
