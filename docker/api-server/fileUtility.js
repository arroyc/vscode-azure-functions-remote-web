const {
  ShareServiceClient,
  ShareClient,
} = require("@azure/storage-file-share");
const axios = require("axios");

class FileManager {
  constructor(connStr, srcBlob, srcURL, shareName) {
    this.srcBlob = srcBlob;
    this.srcCopyURL = srcURL;
    const share = new ShareClient(connStr, shareName);
    share.createIfNotExists();
    this.shareClient =
      ShareServiceClient.fromConnectionString(connStr).getShareClient(
        shareName
      );
  }

  async copyZip(dirName) {
    // Copy Zip
    console.log(
      `Start copying ${this.srcCopyURL} from ${this.srcBlob} to 
      ${dirName} at ${new Date().toISOString()}`
    );
    const fileClient = this.shareClient
      .getDirectoryClient(dirName)
      .getFileClient(this.srcBlob);
    await fileClient.startCopyFromURL(this.srcCopyURL);
    console.log(
      `Done copying ${this.srcCopyURL} from ${this.srcBlob} to 
      ${dirName} at ${new Date().toISOString()}`
    );
  }

  async createDirectory(dirName) {
    try {
      // Ex: Deployment/t-tomabraham
      const path = dirName.split("/");
      const directoryClient = this.shareClient.getDirectoryClient(path[0]);
      console.log(
        `Start creating directory ${dirName} at ${new Date().toISOString()}`
      );
      await directoryClient.createIfNotExists();
      console.log(
        `Create directory ${dirName} successfully at ${new Date().toISOString()}`
      );
      for (var i = 1; i < path.length; i++) {
        // Create subdirectory under parent directory
        await this.shareClient
          .getDirectoryClient(path[i - 1])
          .createSubdirectory(path[i]);
        console.log(
          `Create subdirectory ${
            path[i]
          } successfully at ${new Date().toISOString()}`
        );
      }
    } catch (error) {
      //TODO: different error cases: https://docs.microsoft.com/en-us/rest/api/storageservices/create-directory
      console.log(`Directory ${dirName} exists already`);
    }
  }

  async deleteZip(dirName) {
    try {
      console.log(
        `Start deleting zip ${this.srcBlob} at ${new Date().toISOString()}`
      );
      const directoryClient = this.shareClient.getDirectoryClient(dirName);
      const fileClient = directoryClient.getFileClient(this.srcBlob);
      await fileClient.delete();
      console.log(`Deleted zip ${this.srcBlob} at ${new Date().toISOString()}`);
    } catch (error) {
      console.log(error);
      console.log("Zip not found");
    }
  }

  async copyZipBetweenDirectories(
    deploymentDirectoryName,
    stagingDirectoryName
  ) {
    try {
      console.log(
        `Starting copying zip from directory ${deploymentDirectoryName} to directory ${stagingDirectoryName} at ${new Date().toISOString()}`
      );
      await Promise.all([
        this.createDirectory(deploymentDirectoryName),
        this.createDirectory(stagingDirectoryName),
      ]);
    } catch (error) {
      console.log(`Unexpected error when creating directory: ${error}`);
    } finally {
      await this.copyZip(deploymentDirectoryName);
      console.log(
        `Done copying function app zip to deployment directory ${deploymentDirectoryName} at ${new Date().toISOString()}`
      );
    }
  }
}

module.exports = FileManager;
