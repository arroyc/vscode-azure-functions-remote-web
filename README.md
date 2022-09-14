vscode-azure-functions-remote-web

To set up:

1. Follow this guide https://devdiv.visualstudio.com/OnlineServices/_artifacts/feed/VS/connect/npm
2. npm install
3. npm run watch-web
4. npm run host
5. go to https://insiders.vscode.dev/
6. open command palette: shft+ctrl+p
7. Click developer: install web extension
8. fill extension hosted url and install the extension
9. Open this link, https://insiders.vscode.dev/+aHR0cDovL2xvY2FsaG9zdDo1MDAw/edc48857-dd0b-4085-a2a9-5e7df12bd2fd+limelight+limelight-funcapp+wangbill/code/user/wangbill/limelight-funcapp?version=edit

(FYI: https://insiders.vscode.dev/+ms-azuretools.vscode-azure-functions-remote-web/{subscriptionid}+{resourcegroupname}+{functionappname}+{user account id}/code/user/{user account id}/{functionappname}?version={'edit' or 'deploy'}
version value is chosen based on user selection for an existing function app, for new function app (which has no functions published) the version should be set to 'edit')
