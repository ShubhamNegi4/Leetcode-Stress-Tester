const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const vscode = require('vscode');

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

        // Save sample test cases
        const samples = extractSamples(q.content);
        if (samples.length > 0) {
            const sampleContent = samples.map(s => s.input).join('\n');
            fs.writeFileSync(path.join(workDir, 'input.txt'), sampleContent);
        } else if (q.sampleTestCase) {
            fs.writeFileSync(path.join(workDir, 'input.txt'), q.sampleTestCase);
        } else {
            throw new Error('No sample test cases found');
        }

        // Merge solution snippet with template
        const templatePath = path.join(workDir, 'template.cpp');
        let templateContent = fs.existsSync(templatePath)
            ? fs.readFileSync(templatePath, 'utf8')
            : `#include <bits/stdc++.h>\nusing namespace std;\n\n// $SOLUTION_PLACEHOLDER\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    \n    // Your code here\n    \n    return 0;\n}`;

        templateContent = templateContent.replace(
            '// $SOLUTION_PLACEHOLDER',
            cppSnippet
        );
        fs.writeFileSync(path.join(workDir, 'solution.cpp'), templateContent);

        // Fetch official solution
        let isAvailable = await fetchOfficialSolution(problemTitle, workDir);
        if (!isAvailable) {
            isAvailable = await fetchGithubSolution(problemTitle, workDir);
        }

        // Merge official solution into template for official.cpp
        const officialPath = path.join(workDir, 'official.cpp');
        if (isAvailable) {
            // The fetchOfficialSolution or fetchGithubSolution should have created the official.cpp file
            if (fs.existsSync(officialPath)) {
                const officialSnippet = fs.readFileSync(officialPath, 'utf8');
                let officialTemplate = fs.existsSync(templatePath)
                    ? fs.readFileSync(templatePath, 'utf8')
                    : `#include <bits/stdc++.h>\nusing namespace std;\n\n// $SOLUTION_PLACEHOLDER\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    \n    // Your code here\n    \n    return 0;\n}`;
                officialTemplate = officialTemplate.replace(
                    '// $SOLUTION_PLACEHOLDER',
                    officialSnippet
                );
                fs.writeFileSync(officialPath, officialTemplate);
            }
        } else {
            vscode.window.showWarningMessage(
                'No official solution found. Using empty official.cpp'
            );
            fs.writeFileSync(officialPath, '');
        }

        // Open solution.cpp in editor
        const solutionPath = path.join(workDir, 'solution.cpp');
        const uri = vscode.Uri.file(solutionPath);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
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

        if (mode === 'runSamples') {
            // ONLY COMPILE SOLUTION.CPP FOR SAMPLE TESTS
            execSync('g++ -std=c++17 -O2 solution.cpp -o solution', { cwd: work });
            // Fetch problem for sample extraction only
            const q = await fetchProblemByName(problemTitle);
            const samples = extractSamples(q.content);

            if (!samples.length) throw new Error('No samples found');

            for (let i = 0; i < samples.length; i++) {
                panel.webview.postMessage({ command: 'progress', i: i+1, total: samples.length });
                const { input, output: expected } = samples[i];

                // Format input to match program's expected format
                const formattedInput = formatSampleInput(input);
                fs.writeFileSync(path.join(work, 'input.txt'), formattedInput);

                const solRaw = execSync('./solution < input.txt', { cwd: work }).toString().trim();
                const ok = JSON.stringify(parseNumbers(solRaw)) === JSON.stringify(parseNumbers(expected));

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

            return panel.webview.postMessage({ command: 'done' });
        }

        if (mode === 'runStress') {
            // For stress tests, compile all files
            // Check if official.cpp exists (should have been created during fetch)
            const officialPath = path.join(work, 'official.cpp');
            if (!fs.existsSync(officialPath)) {
                throw new Error("No official solution available. Please fetch the problem first.");
            }

            ['gen.cpp','official.cpp','solution.cpp'].forEach(src => {
                const exe = path.basename(src, '.cpp');
                execSync(`g++ -std=c++17 -O2 ${src} -o ${exe}`, { cwd: work });
            });

            const cfg = vscode.workspace.getConfiguration();
            const maxTests = cfg.get('leetcodeStressTester.testCount', 50);
            const toMs = (cfg.get('leetcodeStressTester.timeLimitMs', 2) * 1000);
            const outDir = work;

            let allInput = '';
            let allSolOut = '';
            let allofficialOut = '';

            for (let i = 1; i <= maxTests; i++) {
                panel.webview.postMessage({ command: 'progress', i, total: maxTests });

                execSync('./gen > input.txt', { cwd: work });
                const inp = fs.readFileSync(path.join(work, 'input.txt'), 'utf8');

                let solOut;
                try {
                    solOut = execSync('./solution < input.txt', { cwd: work, timeout: toMs }).toString().trim();
                } catch (err) {
                    solOut = `<<ERROR: ${err.killed ? 'timeout' : err.message}>>`;
                }

                let bruOut;
                try {
                    bruOut = execSync('./official < input.txt', { cwd: work, timeout: toMs }).toString().trim();
                } catch (err) {
                    bruOut = `<<ERROR: ${err.killed ? 'timeout' : err.message}>>`;
                }

                allInput += `=== Test #${i} ===\n${inp}\n\n`;
                allSolOut += `=== Test #${i} ===\n${solOut}\n\n`;
                allofficialOut += `=== Test #${i} ===\n${bruOut}\n\n`;

                if (solOut !== bruOut) {
                    fs.writeFileSync(path.join(outDir, 'all_input.txt'), allInput);
                    fs.writeFileSync(path.join(outDir, 'all_solution.txt'), allSolOut);
                    fs.writeFileSync(path.join(outDir, 'all_official.txt'), allofficialOut);

                    return panel.webview.postMessage({
                        command: 'fail',
                        caseIndex: i,
                        input: inp,
                        expected: bruOut,
                        solution: solOut
                    });
                }

                panel.webview.postMessage({ command: 'pass', caseIndex: i });
            }

            fs.writeFileSync(path.join(outDir, 'all_input.txt'), allInput);
            fs.writeFileSync(path.join(outDir, 'all_solution.txt'), allSolOut);
            fs.writeFileSync(path.join(outDir, 'all_official.txt'), allofficialOut);

            return panel.webview.postMessage({ command: 'done' });
        }

        throw new Error(`Unknown mode: ${mode}`);
    } catch (error) {
        panel.webview.postMessage({ command: 'error', error: error.message });
    }
}

module.exports = { handleFetchProblem, handleFetchAndStress };