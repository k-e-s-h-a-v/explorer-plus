// extension.js (at the project root)
const vscode = require('vscode');
const { FileExplorerViewProvider } = require('./src/FileExplorerView'); // Path updated

function activate(context) {
    console.log('Congratulations, your extension "file-explorer-webview" is now active!');

    const fileExplorerProvider = new FileExplorerViewProvider(context);

    vscode.window.registerWebviewViewProvider(
        'fileExplorerView', // This ID must match the view ID in package.json
        fileExplorerProvider
    );
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};