const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { handleFetchAndStress } = require('../utils/stress');

function openWebview(context) {
  const panel = vscode.window.createWebviewPanel(
    'competitiveCompanionView',
    'Competitive Companion: Stress Tester',
    vscode.ViewColumn.Two,
    { enableScripts: true }
  );

  // Load the HTML from disk so we never worry about escaping backticks.
  const htmlPath = path.join(context.extensionPath, 'src/frontend', 'webview.html');
  panel.webview.html = fs.readFileSync(htmlPath, 'utf8');

  panel.webview.onDidReceiveMessage(msg => {
    if (msg.command === 'fetchProblemInfo') {
      handleFetchAndStress(msg.id, panel);
    }
  });
}

module.exports = { openWebview };