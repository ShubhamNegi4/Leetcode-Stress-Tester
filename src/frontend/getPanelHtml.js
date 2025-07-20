function getPanelHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LeetCode Stress Tester</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 16px;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .container { max-width: 100%; }
        h2 { margin-top: 0; margin-bottom: 16px; color: var(--vscode-editor-foreground); font-size: 16px; font-weight: 600; }
        .input-group { margin-bottom: 16px; }
        input[type="text"] { width: 100%; padding: 8px 12px; border: 1px solid var(--vscode-input-border); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); font-size: 14px; box-sizing: border-box; }
        input[type="text"]:focus { outline: none; border-color: var(--vscode-focusBorder); }
        .button-group { display: flex; flex-direction: column; gap: 8px; }
        button { padding: 8px 16px; border: none; border-radius: 4px; font-size: 13px; font-weight: 500; cursor: pointer; transition: background-color 0.2s; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
        button:hover { background: var(--vscode-button-hoverBackground); }
        button.primary { background:rgb(34, 112, 237); color: #fff; }
        button.primary:hover { background:rgb(27, 78, 189); }
        button.samples-btn { background:rgb(241, 139, 71); color: #fff; }
        button.samples-btn:hover { background:rgb(204, 114, 41); }
        button.stress-btn { background:rgb(13, 169, 70); color: #fff; }
        button.stress-btn:hover { background:rgb(15, 101, 47); }
        .status { margin-top: 12px; padding: 8px 12px; border-radius: 4px; font-size: 12px; display: none; }
        .status.success { background: var(--vscode-notificationsInfoBackground); color: var(--vscode-notificationsInfoForeground); border: 1px solid var(--vscode-notificationsInfoBorder); }
        .status.error { background: var(--vscode-notificationsErrorBackground); color: var(--vscode-notificationsErrorForeground); border: 1px solid var(--vscode-notificationsErrorBorder); }
        .status.info { background: var(--vscode-notificationsInfoBackground); color: var(--vscode-notificationsInfoForeground); border: 1px solid var(--vscode-notificationsInfoBorder); }
        .log { margin-top: 12px; max-height: 200px; overflow-y: auto; font-family: 'Courier New', monospace; font-size: 11px; background: var(--vscode-textBlockQuote-background); border: 1px solid var(--vscode-textBlockQuote-border); border-radius: 4px; padding: 8px; }
        .log-entry { margin-bottom: 4px; word-break: break-all; }
    </style>
</head>
<body>
    <div class="container">
        <h2>LeetCode Stress Tester</h2>
        <div class="input-group">
            <input type="text" id="problemInput" placeholder="Title or ID ( two-sum or 1)" />
        </div>
        <div class="button-group">
            <button class="primary" id="fetchBtn">Fetch Problem</button>
            <button class="samples-btn" id="samplesBtn">Run Samples</button>
            <button class="stress-btn" id="stressBtn">Run Stress Tests</button>
        </div>
        <div id="status" class="status"></div>
        <div id="log" class="log" style="display: none;"></div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const problemInput = document.getElementById('problemInput');
        const fetchBtn = document.getElementById('fetchBtn');
        const samplesBtn = document.getElementById('samplesBtn');
        const stressBtn = document.getElementById('stressBtn');
        const status = document.getElementById('status');
        // Restore state on load
        const state = vscode.getState();
        if (state && state.problemId) {
            problemInput.value = state.problemId;
        }
        function saveProblemId(problemId) {
            vscode.setState({ problemId });
        }
        // Loader and spinner setup
        let loaderWrapper = document.getElementById('status-loader-wrapper');
        if (!loaderWrapper) {
            loaderWrapper = document.createElement('div');
            loaderWrapper.id = 'status-loader-wrapper';
            loaderWrapper.style.textAlign = 'center';
            loaderWrapper.style.marginTop = '8px';
            status.parentNode.insertBefore(loaderWrapper, status.nextSibling);
        }
        // Number bar (replaces progress bar)
        let numberBar = document.getElementById('status-number-bar');
        if (!numberBar) {
            numberBar = document.createElement('div');
            numberBar.id = 'status-number-bar';
            numberBar.style.display = 'none';
            numberBar.style.textAlign = 'center';
            numberBar.style.fontWeight = 'bold';
            numberBar.style.fontSize = '13px';
            numberBar.style.color = 'var(--vscode-editor-foreground)';
            loaderWrapper.appendChild(numberBar);
        }
        function showNumberBar(current, total) {
            numberBar.style.display = 'block';
            numberBar.textContent = \`Running test \${current}/\${total}...\`;
        }
        function hideNumberBar() {
            numberBar.style.display = 'none';
            numberBar.textContent = '';
        }
        const log = document.getElementById('log');
        if (log) log.remove();
        let errorActive = false;
        function showStatus(message, type = 'info', showLoader = false) {
            status.textContent = message;
            status.className = 'status ' + type;
            status.style.display = 'block';
            if (!showLoader) hideNumberBar();
            if (type === 'error' && message !== 'Test case failed.') {
                sampleContainer.innerHTML = '';
                errorActive = true;
            } else if (type === 'info' || type === 'success') {
                errorActive = false;
            }
        }
        function getProblemId() {
            const problemId = problemInput.value.trim();
            if (!problemId) {
                showStatus('Please enter a problem ID or slug', 'error');
                return null;
            }
            return problemId;
        }
        fetchBtn.addEventListener('click', () => {
            const problemId = getProblemId();
            if (problemId) {
                saveProblemId(problemId);
                showStatus('Fetching problem...', 'info', true);
                vscode.postMessage({ type: 'fetchProblem', value: problemId });
            }
        });
        samplesBtn.addEventListener('click', () => {
            const problemId = getProblemId();
            if (problemId) {
                saveProblemId(problemId);
                sampleContainer.innerHTML = '';
                status.textContent = '';
                status.style.display = 'none';
                showStatus('Running sample tests...', 'info', true);
                vscode.postMessage({ type: 'runSamples', value: problemId });
            }
        });
        stressBtn.addEventListener('click', () => {
            const problemId = getProblemId();
            if (problemId) {
                saveProblemId(problemId);
                sampleContainer.innerHTML = '';
                status.textContent = '';
                status.style.display = 'none';
                showStatus('Running stress tests...', 'info', true);
                vscode.postMessage({ type: 'runStress', value: problemId });
            }
        });
        // Add a container for sample cards
        const sampleContainerId = 'sample-cards';
        let sampleContainer = document.getElementById(sampleContainerId);
        if (!sampleContainer) {
            sampleContainer = document.createElement('div');
            sampleContainer.id = sampleContainerId;
            document.querySelector('.container').appendChild(sampleContainer);
        }
        function showSampleCard(caseIndex, input, expected, solution, passed, failed) {
            const card = document.createElement('div');
            card.className = 'log-entry';
            card.style.border = '1px solid ' + (failed ? '#fca5a5' : passed ? '#6ee7b7' : '#cbd5e1');
            card.style.background = failed ? '#fef2f2' : passed ? '#f0fdf4' : '#f8fafc';
            card.style.color = '#1e293b';
            card.style.margin = '8px 0';
            card.style.padding = '8px';
            card.innerHTML =
                '<b>Sample #' + caseIndex + '</b><br/>' +
                '<b>Input:</b> <pre style="color:#334155;background:#f1f5f9">' + input + '</pre>' +
                '<b>Expected:</b> <pre style="color:#334155;background:#f1f5f9">' + expected + '</pre>' +
                '<b>Solution:</b> <pre style="color:#334155;background:#f1f5f9">' + solution + '</pre>' +
                '<b>Status:</b> ' + (failed ? '<span style="color:#b91c1c">Failed</span>' : passed ? '<span style="color:#15803d">Passed</span>' : 'Unknown');
            sampleContainer.appendChild(card);
        }
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'progress':
                    showNumberBar(message.i, message.total);
                    break;
                case 'status':
                    showStatus(message.text, message.type || 'info', false);
                    break;
                case 'sample':
                    if (!errorActive) showSampleCard(message.caseIndex, message.input, message.expected, message.solution, message.passed);
                    break;
                case 'fail':
                    if (!errorActive) {
                        showSampleCard(message.caseIndex, message.input, message.expected, message.solution, false, true);
                        showStatus('Test case failed.', 'error', false);
                    }
                    break;
                case 'done':
                    hideNumberBar();
                    showStatus('All tests passed!', 'success', false);
                    break;
            }
        });
    </script>
</body>
</html>`;
}

module.exports = { getPanelHtml }; 