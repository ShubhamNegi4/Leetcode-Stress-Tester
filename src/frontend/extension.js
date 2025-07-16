console.log('🔧 [CC‑V2] extension.js loaded');
const vscode = require('vscode');
const { openWebview } = require('./webview.js');

function activate(context) {
  const disposable = vscode.commands.registerCommand(
    'competitive-companion-v2.showStressTester',
    () => openWebview(context)
  );
  context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = { activate, deactivate };
