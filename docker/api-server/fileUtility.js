const { ShareServiceClient } = require("@azure/storage-file-share");
const axios = require("axios");

class FileManager {
  constructor(accountKey, registryP, dirName, connStr) {
    this.accountKey = accountKey;
    this.registryP = registryP;
    this.dirName = dirName;
    this.shareName = "limelight";
    this.srcBlob = "funcapppy.zip";
    this.srcCopyURL =
      "https://limelightfilestorage.blob.core.windows.net/scm-releases/funcapppy.zip?sp=r&st=2022-08-11T16:54:19Z&se=2022-11-30T01:54:19Z&spr=https&sv=2021-06-08&sr=b&sig=PCwQGpM7BcMLGK4ZTpYKQAnt%2BhqeEj%2BecQf%2FzsDVtn8%3D";
    this.shareClient = ShareServiceClient.fromConnectionString(
      connStr
    ).getShareClient(this.shareName);
  }

  async copyZip() {
    // Copy Zip
    const fileClient = this.shareClient
      .getDirectoryClient(this.dirName)
      .getFileClient(this.srcBlob);
    await fileClient.startCopyFromURL(this.srcCopyURL);
    console.log(
      `Done copying ${this.srcCopyURL} from ${this.srcBlob} to 
      ${this.dirName} at ${new Date().toISOString()}`
    );
  }

  async createDirectory() {
    // Create Directory
    const directoryClient = this.shareClient.getDirectoryClient(this.dirName);
    await directoryClient.create();
    console.log(
      `Create directory ${
        this.dirName
      } successfully at ${new Date().toISOString()}`
    );
  }

  async deleteZip() {
    try {
      console.log(
        `Delete zip ${this.srcBlob} successfully at ${new Date().toISOString()}`
      );
      const directoryClient = this.shareClient.getDirectoryClient(this.dirName);
      const fileClient = directoryClient.getFileClient(this.srcBlob);
      await fileClient.delete();
    } catch (error) {
      console.log(error);
      console.log("Zip not found");
    }
  }

  async syncCode() {
    try {
      await this.createDirectory();
      await this.copyZip();
    } catch (error) {
      console.log(error);
      console.log(
        this.dirName +
          " Folder already exists, overwriting zip to match latest deployment"
      );
      await this.deleteZip();
      await this.copyZip();
    }
  }
  //     finally {
  //       const reqBody = {
  //         stagingDirectoryPath: "/functionapp/Staging",
  //         zipFileName: "funcapppy.zip",
  //       };
  //       console.log(`Hostname: ${hostname} at ${new Date().toISOString()}`);
  //       // Call staging endpoint here
  //       await axios.put(`https://${hostname}:443/limelight/staging`, reqBody);
  //       console.log(
  //         `${reqBody.zipFileName} has been unzipped at ${reqBody.stagingDirectoryPath}`
  //       );
  //     }
  //   }
}

module.exports = FileManager;
