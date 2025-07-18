const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const vscode = require('vscode');
const https = require('https');

const {
    fetchProblemByName,
    fetchProblemById,
    fetchOfficialSolution,
    fetchGithubSolution
} = require('./fetch.js');

const { copyTemplates } = require('./makeDirs.js');
const { extractSamples } = require('./parseProblem.js');

function getWorkspaceRoot() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || !folders.length) throw new Error('No workspace folder open');
    return folders[0].uri.fsPath;
}

function parseNumbers(str) {
    const m = str.match(/-?\d+/g);
    return m ? m.map(Number) : [];
}

// Format LeetCode sample input to match program's expected format
function formatSampleInput(input) {
    const numbers = input.match(/-?\d+/g) || [];
    if (numbers.length < 2) return input;
    const target = numbers.pop();
    const array = `[${numbers.join(',')}]`;
    return `${array}\n${target}\n`;
}

async function ensureJsonHpp(workDir) {
    const jsonPath = path.join(workDir, 'json.hpp');
    if (fs.existsSync(jsonPath)) return;
    const url = 'https://github.com/nlohmann/json/releases/latest/download/json.hpp';
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(jsonPath);
        https.get(url, response => {
            if (response.statusCode !== 200) {
                fs.unlinkSync(jsonPath);
                return reject(new Error('Failed to download json.hpp'));
            }
            response.pipe(file);
            file.on('finish', () => file.close(resolve));
        }).on('error', err => {
            fs.unlinkSync(jsonPath);
            reject(err);
        });
    });
}

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

        // Ensure json.hpp exists
        const jsonSrc = path.resolve(__dirname, '..', '..', 'stress tester', 'json.hpp');
        const jsonDst = path.join(workDir, 'json.hpp');
        if (fs.existsSync(jsonSrc) && !fs.existsSync(jsonDst)) {
            fs.copyFileSync(jsonSrc, jsonDst);
        }

        // Save all sample test cases to input.txt, separated by blank lines
        const samples = extractSamples(q.content);
        if (samples.length > 0) {
            const sampleContent = samples.map(s => `${s.input.trim()}\n---\n${s.output.trim()}`).join('\n\n');
            fs.writeFileSync(path.join(workDir, 'input.txt'), sampleContent);
        } else if (q.sampleTestCase) {
            fs.writeFileSync(path.join(workDir, 'input.txt'), q.sampleTestCase);
        } else {
            throw new Error('No sample test cases found');
        }

        // Always copy template.cpp and gen.cpp if not present
        const templateSrc = path.resolve(__dirname, '..', '..', 'stress tester', 'template.cpp');
        const templateDst = path.join(workDir, 'template.cpp');
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

        // Open solution.cpp in editor
        // (No longer auto-opening solution.cpp to avoid focus issues)
    } catch (error) {
        vscode.window.showErrorMessage(`Fetch failed: ${error.message}`);
    }
}

async function handleFetchAndStress(slug, panel, mode) {
    try {
        const workspaceRoot = getWorkspaceRoot();
        const work = path.join(workspaceRoot, 'stress tester');
        const isInteger = /^\d+$/.test(slug);
        const problemTitle = isInteger
            ? await fetchProblemById(Number(slug))
            : slug;

        if (!problemTitle) throw new Error("Problem not found");

        if (!fs.existsSync(work)) {
            fs.mkdirSync(work, { recursive: true });
        }
        // Do NOT overwrite solution.cpp here! Just use the existing file.
        // Only copy template.cpp if needed
        const tplDir = path.resolve(__dirname, '..', '..', 'stress tester');
        const templateSrc = path.join(tplDir, 'template.cpp');
        const templateDst = path.join(work, 'template.cpp');
        if (fs.existsSync(templateSrc)) {
            fs.copyFileSync(templateSrc, templateDst);
        }

        // Platform detection for cross-platform binary extension
        const isWindows = process.platform === 'win32';
        const exeExt = isWindows ? '.exe' : '';
        const compileCmd = 'g++ -std=c++17 -O2 -pipe -Wall -Wextra -Wshadow -Wconversion -Wpedantic -march=native';

        if (mode === 'runSamples') {
            // Ensure gen.cpp exists for user to edit before running stress
            const genSrc = path.resolve(__dirname, '..', '..', 'stress tester', 'gen.cpp');
            const genDst = path.join(work, 'gen.cpp');
            if (fs.existsSync(genSrc) && !fs.existsSync(genDst)) {
                fs.copyFileSync(genSrc, genDst);
            }
            // ONLY COMPILE SOLUTION.CPP FOR SAMPLE TESTS
            execSync(`${compileCmd} solution.cpp -o solution${exeExt}`, { cwd: work });
            // Always read the latest input.txt for samples
            const inputTxtPath = path.join(work, 'input.txt');
            let samples = [];
            if (fs.existsSync(inputTxtPath)) {
                const fileContent = fs.readFileSync(inputTxtPath, 'utf8');
                // Split samples by blank lines
                const rawSamples = fileContent.split(/\n\s*\n/).filter(Boolean);
                for (const raw of rawSamples) {
                    const parts = raw.split(/\n---\n/);
                    if (parts.length === 2) {
                        samples.push({ input: parts[0].trim(), output: parts[1].trim() });
                    } else {
                        // If not in correct format, skip or show error
                        return panel.webview.postMessage({
                            command: 'error',
                            error: 'Each sample in input.txt must have input, a line with --- and expected output, separated by blank lines.'
                        });
                    }
                }
            } else {
                return panel.webview.postMessage({
                    command: 'error',
                    error: 'input.txt not found. Please add your samples to input.txt.'
                });
            }

            if (!samples.length) {
                return panel.webview.postMessage({
                    command: 'error',
                    error: 'No valid samples found in input.txt.'
                });
            }

            for (let i = 0; i < samples.length; i++) {
                panel.webview.postMessage({ command: 'progress', i: i+1, total: samples.length });
                const { input, output: expected } = samples[i];

                // Format input to match program's expected format
                const formattedInput = formatSampleInput(input);
                const tempInputFile = path.join(work, 'input_sample_tmp.txt');
                fs.writeFileSync(tempInputFile, formattedInput);

                const solRaw = execSync('./solution < input_sample_tmp.txt', { cwd: work }).toString().trim();
                const ok = JSON.stringify(parseNumbers(solRaw)) === JSON.stringify(parseNumbers(expected));

                // Delete the temp input file after use
                try { fs.unlinkSync(tempInputFile); } catch (e) { /* ignore */ }

                if (!ok) {
                    return panel.webview.postMessage({
                        command: 'fail',
                        caseIndex: i+1,
                        input: formattedInput,
                        expected,
                        solution: solRaw
                    });
                }

                panel.webview.postMessage({
                    command: 'sample',
                    caseIndex: i+1,
                    input: formattedInput,
                    expected,
                    solution: solRaw
                });
            }
            // After all samples, ensure temp file is deleted
            try { fs.unlinkSync(path.join(work, 'input_sample_tmp.txt')); } catch (e) { /* ignore */ }
            return panel.webview.postMessage({ command: 'done' });
        }

        if (mode === 'runStress') {
            // For stress tests, compile all files
            // Check if brute.cpp exists (should have been created during fetch)
            const brutePath = path.join(work, 'brute.cpp');
            if (!fs.existsSync(brutePath)) {
                throw new Error("No brute solution available. Please fetch the problem first.");
            }

            ['gen.cpp','brute.cpp','solution.cpp'].forEach(src => {
                const exe = path.basename(src, '.cpp');
                execSync(`${compileCmd} ${src} -o ${exe}${exeExt}`, { cwd: work });
            });

            const cfg = vscode.workspace.getConfiguration();
            const maxTests = cfg.get('leetcodeStressTester.testCount', 50);
            const toMs = (cfg.get('leetcodeStressTester.timeLimitMs', 2) * 1000);
            const outDir = work;

            let allInput = '';
            let allSolOut = '';
            let allBruteOut = '';

            let stressTempInput = path.join(work, 'input_stress_tmp.txt');

            for (let i = 1; i <= maxTests; i++) {
                panel.webview.postMessage({ command: 'progress', i, total: maxTests });

                execSync(`./gen > input_stress_tmp.txt`, { cwd: work });
                const inp = fs.readFileSync(stressTempInput, 'utf8');

                let solOut;
                try {
                    solOut = execSync('./solution < input_stress_tmp.txt', { cwd: work, timeout: toMs }).toString().trim();
                } catch (err) {
                    solOut = `<<ERROR: ${err.killed ? 'timeout' : err.message}>>`;
                }

                let bruteOut;
                try {
                    bruteOut = execSync('./brute < input_stress_tmp.txt', { cwd: work, timeout: toMs }).toString().trim();
                } catch (err) {
                    bruteOut = `<<ERROR: ${err.killed ? 'timeout' : err.message}>>`;
                }

                allInput += `=== Test #${i} ===\n${inp}\n\n`;
                allSolOut += `=== Test #${i} ===\n${solOut}\n\n`;
                allBruteOut += `=== Test #${i} ===\n${bruteOut}\n\n`;

                if (solOut !== bruteOut) {
                    fs.writeFileSync(path.join(outDir, 'all_input.txt'), allInput);
                    fs.writeFileSync(path.join(outDir, 'solution_output.txt'), allSolOut);
                    fs.writeFileSync(path.join(outDir, 'brute_output.txt'), allBruteOut);
                    // Do NOT append to input.txt anymore
                    return panel.webview.postMessage({
                        command: 'fail',
                        caseIndex: i,
                        input: inp,
                        expected: bruteOut,
                        solution: solOut
                    });
                }

                panel.webview.postMessage({ command: 'pass', caseIndex: i });
            }

            fs.writeFileSync(path.join(outDir, 'all_input.txt'), allInput);
            fs.writeFileSync(path.join(outDir, 'solution_output.txt'), allSolOut);
            fs.writeFileSync(path.join(outDir, 'brute_output.txt'), allBruteOut);
            // After all stress tests, ensure temp file is deleted
            try { fs.unlinkSync(stressTempInput); } catch (e) { /* ignore */ }

            return panel.webview.postMessage({ command: 'done' });
        }

        throw new Error(`Unknown mode: ${mode}`);
    } catch (error) {
        panel.webview.postMessage({ command: 'error', error: error.message });
    }
}

module.exports = { handleFetchProblem, handleFetchAndStress };