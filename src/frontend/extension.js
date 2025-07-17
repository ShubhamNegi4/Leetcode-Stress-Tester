console.log('🔧 [CC-V2] extension.js loaded');
const vscode = require('vscode');
const { openWebview } = require('./webview.js');
const { handleFetchProblem } = require('../utils/stressRunner.js');

function activate(context) {
    // Register showStressTester command
    const showDisposable = vscode.commands.registerCommand(
        'competitive-companion-v2.showStressTester',
        () => {
            openWebview(context);
        }
    );
    
    // Register fetchProblem command
    const fetchDisposable = vscode.commands.registerCommand(
        'competitive-companion-v2.fetchProblem',
        async (slug) => {
            try {
                await handleFetchProblem(slug);
                vscode.window.showInformationMessage(`Problem ${slug} fetched successfully!`);
            } catch (error) {
                vscode.window.showErrorMessage(`Fetch failed: ${error.message}`);
            }
        }
    );
    
    context.subscriptions.push(showDisposable, fetchDisposable);
}

function deactivate() {}

module.exports = { activate, deactivate };