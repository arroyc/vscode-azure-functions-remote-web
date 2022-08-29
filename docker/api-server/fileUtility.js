const { ShareServiceClient, ShareClient } = require("@azure/storage-file-share");
const axios = require("axios");

class FileManager {
  constructor(connStr, srcBlob, srcURL, shareName) {
    this.srcBlob = srcBlob;
    this.srcCopyURL = srcURL;
      // "https://limelightfilestorage.blob.core.windows.net/scm-releases/funcapppy.zip?sp=r&st=2022-08-18T19:52:51Z&se=2027-05-09T03:52:51Z&sv=2021-06-08&sr=b&sig=GTIR2JNDQ3EU6XL%2FP4QklilnAOoYlT9EdH5uYPQa%2BAg%3D";
    // "https://limelightfilestorage.blob.core.windows.net/scm-releases/funcapppy.zip?sp=r&st=2022-08-11T16:54:19Z&se=2022-11-30T01:54:19Z&spr=https&sv=2021-06-08&sr=b&sig=PCwQGpM7BcMLGK4ZTpYKQAnt%2BhqeEj%2BecQf%2FzsDVtn8%3D";
    
    const share = new ShareClient(connStr, shareName);
    share.createIfNotExists();
    this.shareClient = ShareServiceClient.fromConnectionString(
      connStr
    ).getShareClient(shareName);
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
      const path = dirName.split('/');
      const directoryClient = this.shareClient.getDirectoryClient(path[0]);
      console.log(
        `Start creating directory ${dirName} at ${new Date().toISOString()}`
      );
      // Create Deployment directory
      await directoryClient.createIfNotExists();
      console.log(
        `Create directory ${dirName} successfully at ${new Date().toISOString()}`
      );
      for (var i = 1; i < path.length; i++) {
        // Create t-tomabraham subdirectory under Deployment directory
        await this.shareClient.getDirectoryClient(path[i - 1]).createSubdirectory(path[i]);
        console.log(
          `Create subdirectory ${path[i]} successfully at ${new Date().toISOString()}`
        );
      }
    } catch (error) {
      console.log("Directory exists already");
      
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

  async syncCode(dirName) {
    try {
      console.log(`Starting syncing code at ${new Date().toISOString()}`);
      await this.createDirectory(dirName);
    } catch (error) {
      console.log(error);
      console.log(
        dirName +
          " Folder already exists, overwriting zip to match latest deployment"
      );
    } finally {
      await this.copyZip(dirName);
      console.log(`Done syncing code at ${new Date().toISOString()}`);
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
