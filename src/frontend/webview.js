const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { handleFetchAndStress } = require('../utils/stressRunner.js');

function openWebview(context) {
    const panel = vscode.window.createWebviewPanel(
        'competitiveCompanionView',
        'Competitive Companion: Stress Tester',
        vscode.ViewColumn.Two,
        { enableScripts: true }
    );

    const htmlPath = path.join(context.extensionPath, 'src', 'frontend', 'webview.html');
    panel.webview.html = fs.readFileSync(htmlPath, 'utf8');

    panel.webview.onDidReceiveMessage(msg => {
        if (msg.command === 'fetchProblem') {
            // Execute the fetch command
            vscode.commands.executeCommand('competitive-companion-v2.fetchProblem', msg.value)
                .catch(err => {
                    panel.webview.postMessage({ command: 'error', error: err.message });
                });
        } else if (msg.command === 'runSamples' || msg.command === 'runStress') {
            handleFetchAndStress(msg.value, panel, msg.command)
                .catch(err => {
                    panel.webview.postMessage({ command: 'error', error: err.message });
                });
        }
    });
}

module.exports = { openWebview };