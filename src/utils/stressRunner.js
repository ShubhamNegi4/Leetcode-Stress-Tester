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
        console.warn('Could not parse sample input, using raw:', input);
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
        throw new Error('input.txt not found. Please add your samples to textIO/input.txt.');
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

    if (!fs.existsSync(exePath) || getMTime(srcPath) > getMTime(exePath)) {
        const cmd = `${compiler} ${flags} "${srcPath}" -o "${exePath}"`;
        try {
            const result = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8' });
            if (result.status !== 0) {
                // Extract the first error line and message
                const lines = (result.stderr || result.stdout || '').split('\n').filter(Boolean);
                let errorLine = lines.find(l => l.includes(src));
                if (!errorLine && lines.length > 0) errorLine = lines[0];
                let concise = errorLine ? errorLine.trim() : 'Compilation failed.';
                // Try to extract file, line, and error reason
                const match = concise.match(/([^:]+):(\d+):(\d+):\s*error: (.*)/);
                if (match) {
                    concise = `${match[1]}:${match[2]}:${match[3]}: ${match[4]}`;
                }
                return concise;
            }
        } catch (e) {
            return `Compilation command failed for ${src}: ${e.message}`;
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
            if (comp.src !== 'brute.cpp') {
                // Send concise error to panel
                panel.webview.postMessage({ command: 'status', text: `Compilation error in ${comp.src}: ${error}`, type: 'error' });
                throw new Error(error);
            } else {
                panel.webview.postMessage({ command: 'log', message: `Warning: Could not compile ${comp.src}. Stress test requires it.` });
            }
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
    console.log('Starting runSampleTests, samples:', samples.length);
    if (!samples.length) {
        panel.webview.postMessage({ command: 'status', text: 'No valid samples found.', type: 'error' });
        return;
    }
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
            let solProc;
            try {
                solProc = spawnSync(solCmd, { input: formattedInput, encoding: 'utf8', shell: false, timeout: 2000 });
            } catch (err) {
                panel.webview.postMessage({ command: 'status', text: 'Error running C++ solution: ' + err.message, type: 'error' });
                failFound = true;
                return;
            }
            let solRaw;
            if (solProc.error) {
                solRaw = `<<ERROR: ${solProc.error.message}>>`;
                panel.webview.postMessage({ command: 'status', text: solRaw, type: 'error' });
                failFound = true;
                return;
            } else if (solProc.status !== 0) {
                solRaw = `<<RUNTIME ERROR>>\n${solProc.stderr}`;
                panel.webview.postMessage({ command: 'status', text: solRaw, type: 'error' });
                failFound = true;
                return;
            } else {
                solRaw = solProc.stdout.trim();
                if (!solRaw) solRaw = "<<NO OUTPUT>>";
            }

            // Debugging: log command, input, and output
            console.log('Running sample:', {
                index: i + 1,
                command: solCmd,
                input: formattedInput,
                status: solProc.status,
                error: solProc.error,
                stdout: solProc.stdout,
                stderr: solProc.stderr,
                solRaw: solRaw
            });

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
    console.log('Finished runSampleTests');
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
                console.warn('Could not parse sample input, using raw:', sampleInput);
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
        const canonicalTemplateContent = `#include <bits/stdc++.h>
#include "./utils/json.hpp"
using namespace std;
using json = nlohmann::json;

// $LEETCODE_FUNCTION$

int main() {
    string line;
    getline(cin, line); vector<int> nums = json::parse(line);
    getline(cin, line); int n = json::parse(line);
    Solution sol;
    auto result = sol.FUNCTION_NAME(PARAMS);

    // For int or string:
    // cout << result << endl;

    // For vector<int>:
    cout << "[";
    for (int i = 0; i < result.size(); ++i) {
        cout << result[i];
        if (i + 1 < result.size()) cout << ",";
    }
    cout << "]" << endl;

    // For vector<vector<int>>:
    // cout << "[";
    // for (int i = 0; i < result.size(); ++i) {
    //     cout << "[";
    //     for (int j = 0; j < result[i].size(); ++j) {
    //         cout << result[i][j];
    //         if (j + 1 < result[i].size()) cout << ",";
    //     }
    //     cout << "]";
    //     if (i + 1 < result.size()) cout << ",";
    // }
    // cout << "]" << endl;

    return 0;
}
// Example usage (use as needed):
// getline(cin, line); int n = json::parse(line);
// getline(cin, line); string s = json::parse(line);
// getline(cin, line); vector<int> nums = json::parse(line);
// getline(cin, line); vector<vector<int>> matrix = json::parse(line);
`;
        if (!fs.existsSync(canonicalTemplatePath)) {
            fs.writeFileSync(canonicalTemplatePath, canonicalTemplateContent);
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
        let solutionContent = templateContent.replace('sol.FUNCTION_NAME(PARAMS)', `sol.${funcName}(${funcParams})`);
        solutionContent = solutionContent.replace('// $LEETCODE_FUNCTION$', cppSnippet);
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
            bruteContent = bruteContent.replace('sol.FUNCTION_NAME(PARAMS)', `sol.${bFuncName}(${bFuncParams})`);
            bruteContent = bruteContent.replace('// $LEETCODE_FUNCTION$', bruteSnippet);
        } else {
            bruteContent = bruteContent.replace('// $LEETCODE_FUNCTION$', '// No official solution available for this problem.');
            bruteContent = bruteContent.replace('sol.FUNCTION_NAME(PARAMS)', 'sol.FUNCTION_NAME(PARAMS)');
        }
        fs.writeFileSync(brutePath, bruteContent);

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
