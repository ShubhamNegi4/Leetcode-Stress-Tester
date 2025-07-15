const vscode = require('vscode');
const { openWebview } = require('./webview');

function activate(context) {
  console.log("Activating extension");
  const disposable = vscode.commands.registerCommand(
    'competitive-companion-v2.showStressTester',
    async () => {
      console.log('command handler invoked');
      try {
        // lazy‑load your webview so any errors land here instead of at module‐load time
        await openWebview(context);
      } catch (err) {
        console.error('openWebview failed:', err);
        vscode.window.showErrorMessage(`Failed to open webview: ${err.message}`);
      }
    }
  );
  context.subscriptions.push(disposable);
}

function deactivate() {
  console.log('[ext] deactivating');
}

module.exports = { activate, deactivate };
