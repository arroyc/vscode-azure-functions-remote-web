import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

suite('Web Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	const workspaceFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
	assert.ok(workspaceFolder, 'Expecting an open folder');

	const workspaceFolderUri = workspaceFolder.uri;

	function getUri(path: string): vscode.Uri {
		return vscode.Uri.joinPath(workspaceFolderUri, path);
	}

	async function assertStats(path: string, isFile: boolean, expectedSize?: number) {
		let stats = await vscode.workspace.fs.stat(getUri(path));
		assert.deepStrictEqual(stats.type, isFile ? vscode.FileType.File : vscode.FileType.Directory);
		assert.deepStrictEqual(typeof stats.mtime, 'number');
		assert.deepStrictEqual(typeof stats.ctime, 'number');
		if (expectedSize !== undefined) {
			assert.deepStrictEqual(stats.size, expectedSize);
		} else {
			assert.deepStrictEqual(typeof stats.size, 'number');
		}
	}
	async function assertNotExisting(path: string, isFile: boolean) {
		await assert.rejects(async () => {
			await assertStats(path, isFile);
		});
	}


	test('Sample test', async () => {
		await assertNotExisting('rand/folder', false);
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('test #2', async () => {
		await assertNotExisting('rand/folder', false);
	})
});
