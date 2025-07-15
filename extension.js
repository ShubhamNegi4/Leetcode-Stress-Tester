const vscode = require('vscode');

function activate(context) {
  // Register the command that shows our stress‑tester panel
  const disposable = vscode.commands.registerCommand(
    'competitive-companion-v2.showStressTester',
    () => {
      const panel = vscode.window.createWebviewPanel(
        'competitiveCompanionView',               // viewType
        'Competitive Companion: Stress Tester',   // title
        vscode.ViewColumn.Two,                    // show next to current editor
        { enableScripts: true }                   // allow JS inside the webview
      );
      
      panel.webview.html = getWebviewContent();

      panel.webview.onDidReceiveMessage(message => {
        console.log('Message from Webview:', message);
        // TODO: handle 'runAll' or 'newTest' messages here
      });
    }
  );

  context.subscriptions.push(disposable);
}

function getWebviewContent() {
  return /* html */`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <style>
        body { font-family: sans-serif; padding: 1em; }
        button { margin-right: .5em; }
      </style>
    </head>
    <body>
      <h2>Competitive Companion: Stress Tester</h2>
      <div id="results">
        <p>No tests run yet.</p>
      </div>
      <button id="runAll">Run All</button>
      <button id="newTest">New Test</button>

      <script>
        const vscode = acquireVsCodeApi();

        document.getElementById('runAll').addEventListener('click', () => {
          vscode.postMessage({ command: 'runAll' });
        });

        document.getElementById('newTest').addEventListener('click', () => {
          vscode.postMessage({ command: 'newTest' });
        });
      </script>
    </body>
    </html>
  `;
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate
};
