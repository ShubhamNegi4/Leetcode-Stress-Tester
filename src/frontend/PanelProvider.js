const vscode = require('vscode');
const path = require('path');
const { handleFetchAndStress } = require('../utils/stressRunner.js');
const { getPanelHtml } = require('./getPanelHtml');

class PanelProvider {
    static viewType = 'leetcodeStressPanelView';

    constructor(extensionUri) {
        this._extensionUri = extensionUri;
        this.view = null;
    }

    resolveWebviewView(webviewView, context, _token) {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'fetchProblem':
                    this._handleFetchProblem(data.value);
                    break;
                case 'runSamples':
                    this._handleRunSamples(data.value);
                    break;
                case 'runStress':
                    this._handleRunStress(data.value);
                    break;
            }
        });
    }

    _getHtmlForWebview(webview) {
        return getPanelHtml();
    }

    async _handleFetchProblem(problemId) {
        try {
            if (!vscode.workspace.workspaceFolders) {
                throw new Error('Please open a folder or workspace first.');
            }

            // Import the fetch function
            const { handleFetchProblem } = require('../utils/stressRunner');
            await handleFetchProblem(problemId, this.view);
            
            this.view.webview.postMessage({
                command: 'status',
                text: `Successfully fetched: ${problemId}`,
                type: 'success'
            });
            
        } catch (error) {
            let errorMsg = error.message;
            if (errorMsg && errorMsg.includes('No C++ solution snippet found')) {
                errorMsg = 'This problem is not available for stress testing.';
            }
            this.view.webview.postMessage({
                command: 'status',
                text: `Fetch failed: ${errorMsg}`,
                type: 'error'
            });
        }
    }

    async _handleRunSamples(problemId) {
        try {
            if (!vscode.workspace.workspaceFolders) {
                throw new Error('Please open a folder or workspace first.');
            }

            await handleFetchAndStress(problemId, this.view, 'runSamples');
            
        } catch (error) {
            this.view.webview.postMessage({
                command: 'status',
                text: `Run samples failed: ${error.message}`,
                type: 'error'
            });
        }
    }

    async _handleRunStress(problemId) {
        try {
            if (!vscode.workspace.workspaceFolders) {
                throw new Error('Please open a folder or workspace first.');
            }

            await handleFetchAndStress(problemId, this.view, 'runStress');
            
        } catch (error) {
            this.view.webview.postMessage({
                command: 'status',
                text: `Run stress tests failed: ${error.message}`,
                type: 'error'
            });
        }
    }
}

module.exports = { PanelProvider }; 