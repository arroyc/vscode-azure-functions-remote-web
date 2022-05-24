// Extension ID: ms-vscode.vscode-ai-remote-web
// http://localhost:3000/+aHR0cDovL2xvY2FsaG9zdDo1MDAw/L3N1YnNjcmlwdGlvbnMvYjg1NmZmODctMDBkMS00MjA1LWFmNTYtM2FmNTQzNWFlNDAxL3Jlc291cmNlR3JvdXBzL3NldmlsbGFsX3dzX3JnL3Byb3ZpZGVycy9NaWNyb3NvZnQuTWFjaGluZUxlYXJuaW5nU2VydmljZXMvd29ya3NwYWNlcy9zZXZpbGxhbF93cy9jb21wdXRlcy9zZXZpbGxhbC1jaS10ZXN0/home/azureuser/cloudfiles/code

import * as vscode from 'vscode';
import { checkForUpdates } from './web/launcher';

export async function activate(context: vscode.ExtensionContext) {
    function registerResourceLabelFormatter(authority: string, ciDisplayName: string) {
        context.subscriptions.push(
            vscode.workspace.registerResourceLabelFormatter({
                scheme: 'vscode-remote',
                authority,
                formatting: {
                    label: '${path}',
                    separator: '/',
                    workspaceSuffix: ciDisplayName,
                    tildify: true,
                    normalizeDriveLetter: true
                }
            })
        );
    }

    function getMyWebviewContent(webview: vscode.Webview, context: any): string { 
        let html: string = ``;
        
        // construct your HTML code
        html += `
                <!DOCTYPE html>
                <html>
                    <head>
                      <link rel="stylesheet" />    
                    </head>
                    <body>
                      <div class="main"> 
                          <div>Welcome to Project Limelight!</div>
                          <div>1. Create a new function app!<div>
                          <div>2. Edit an existing funtion app<div>
                          <br></br>
                          <div>Create or edit a function app, and hit deploy once you're ready. Your app will show up in your storage account in your user-specific folder<div>
                      </div>
                    </body>
                 </html>
        `;
        // -----------------------
        return html;
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('mypanel.start', (new_func_app: Boolean) => {
            // Create and show panel
            if (new_func_app == true) {
                const panel = vscode.window.createWebviewPanel(
                    'mypanel',  // <--- identifier
                    'Limelight Welcome', // <--- title
                    vscode.ViewColumn.One,
                    {}
                );
            
                // And set its HTML content
                panel.webview.html = getMyWebviewContent(panel.webview, context);   // <--- HTML
            }
        }),
        vscode.commands.registerCommand('vscode-azure-functions-remote-web.helloWorld', () => {
         	vscode.window.showInformationMessage('Hello World!');
        }),
        vscode.commands.registerCommand('azureml-remote.browser.isConnectedToRemote', async (authority: string, ciDisplayName: string) => {
            registerResourceLabelFormatter(authority, ciDisplayName);
            setTimeout(() => checkForUpdates(), 3_000);
        }),
        vscode.commands.registerCommand('azureml-remote.browser.generateComputeInstanceUrl', async () => {
            const computeInstanceId = await vscode.window.showInputBox({
                prompt: 'Enter the Compute instance id',
                ignoreFocusOut: true,
                placeHolder:
                    '/subscriptions/{SUBSCRIPTION_ID}/resourceGroups/{RESOURCE_GROUP}/providers/Microsoft.MachineLearningServices/workspaces/{WORKSPACE_NAME}/computes/${COMPUTE_INSTANCE_NAME}'
            });
            if (!computeInstanceId) {
                throw new Error('Compute instance id is rquired');
            }

            const encodedComputeInstanceId = btoa(computeInstanceId);
            // /subscriptions/b856ff87-00d1-4205-af56-3af5435ae401/resourceGroups/sevillal_ws_rg/providers/Microsoft.MachineLearningServices/workspaces/sevillal_ws/computes/sevillal-ci-test
            const url = `https://insiders.vscode.dev/+ms-toolsai.vscode-ai-remote-web/${encodedComputeInstanceId}/home/azureuser/cloudfiles/code`;
            console.log(url);

            const result: string | undefined = await vscode.window.showInformationMessage(
                `Copy the following url to your browser to connect to the Compute instance: ${url}`,
                { modal: true },
                'Copy',
                'Open'
            );
            if (result === 'Copy') {
                await vscode.env.clipboard.writeText(url);
            } else if (result === 'Open') {
                await vscode.env.openExternal(vscode.Uri.parse(url));
            }
        })
    );
}

export function deactivate() {}
