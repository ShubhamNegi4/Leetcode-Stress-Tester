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

  // load UI
  const htmlPath = path.join(context.extensionPath, 'src', 'frontend', 'webview.html');
  panel.webview.html = fs.readFileSync(htmlPath, 'utf8');

  panel.webview.onDidReceiveMessage(msg => {
    handleFetchAndStress(msg.value, panel, msg.command)
      .catch(err => {
        panel.webview.postMessage({ command: 'error', error: err.message });
      });
  });
}

module.exports = { openWebview };
