const vscode = require('vscode');
// Correctly require PanelProvider from the same directory
const { PanelProvider } = require('./PanelProvider'); 
// Correctly require the placeholder functions from the utils directory
const { handleFetchProblem } = require('../utils/stressRunner'); 

/**
 * This function is called when your extension is activated.
 * @param {vscode.ExtensionContext} context The extension context provided by VS Code.
 */
function activate(context) {
    // Create a new instance of our PanelProvider.
    const provider = new PanelProvider(context.extensionUri);

    // Register the provider for the 'leetcodeStressPanelView' view.
    // This is the ID we defined in package.json.
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(PanelProvider.viewType, provider)
    );

    // Register the 'fetchProblem' command. This can be called from anywhere in VS Code.
    context.subscriptions.push(
        vscode.commands.registerCommand('leetcode-stress-tester.fetchProblem', async () => {
            const slug = await vscode.window.showInputBox({
                prompt: 'Enter the problem slug or ID',
                placeHolder: 'e.g., two-sum',
                title: 'Fetch LeetCode Problem'
            });

            if (!slug) return; // Exit if the user cancels

            try {
                if (!vscode.workspace.workspaceFolders) {
                    throw new Error('Please open a folder or workspace first.');
                }
                
                // Call your actual logic to fetch the problem.
                await handleFetchProblem(slug); 
                vscode.window.showInformationMessage(`Successfully fetched: ${slug}`);

                // If the panel is open, send a message to its webview to log the success.
                if (provider.view) {
                    provider.view.webview.postMessage({
                        command: 'log',
                        text: `✅ Fetched: ${slug}`
                    });
                }

            } catch (err) {
                vscode.window.showErrorMessage(`Fetch Failed: ${err.message}`);
                // If the panel is open, log the error there too.
                if (provider.view) {
                    provider.view.webview.postMessage({
                        command: 'log',
                        text: `❌ Fetch Failed: ${err.message}`
                    });
                }
            }
        })
    );

    // The 'runSamples' and 'runStress' commands are now initiated from the webview,
    // so we don't need to register them here anymore. The logic is handled in PanelProvider.
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
