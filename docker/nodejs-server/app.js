const express = require("express");
const cors = require("cors");
const app = express();
const router = express.Router();
const AdmZip = require("adm-zip");
const sanitize = require("sanitize-filename");
const { body } = require("express-validator");
const fs = require("fs");
const fsPromises = fs.promises;
console.log("modules imported..");
app.use(cors());
// Constants
const PORT = 443;
const forceTimeout = 18000000;
const inactiveTimeout = 900000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// forced timeout
setTimeout(() => {
  // TODO: inform extension side so user can know session is timed out
  console.log(
    `Your limelight session has reached max timeout of ${
      forceTimeout / 1000
    } minutes, shutting down...`
  );
  process.exit(0);
}, forceTimeout);

// timer
let timer;

router.get("/ping", (req, res) => {
  return res.send("ok");
});

router.get("/pat", (req, res) => {
  if (timer) {
    clearTimeout(timer);
  }
  timer = setTimeout(() => {
    // TODO: inform extension side so user can know session is timed out
    console.log(
      `Your limelight session has been idle for ${
        inactiveTimeout / 1000
      } minutes, shutting down...`
    );
    process.exit(0);
  }, inactiveTimeout);
  return res.send("ok");
});

router.put("/delete/zips", async (req, res) => {
  console.log("Deleting zips...");
  const fsPromises = fs.promises;
  const DIR = req.body.directoryPath;
  try {
    const filesInDirectory = await fsPromises.readdir(DIR);
    for (const file of filesInDirectory) {
      if (file.endsWith("zip")) {
        fs.unlinkSync(DIR + file);
        console.log(`Removed ${file}`);
      }
    }
    console.log("Existing zips deleted");
    res.send("Existing zips deleted");
  } catch (error) {
    console.log("Deleting existing zips failed");
    console.log("ERROR: " + error);
    res.status(500).send("deleting existing zips failed");
  }
});

router.put(
  "/staging",
  body("deploymentDirectoryPath").isLength({ min: 1 }),
  body("stagingDirectoryPath").isLength({ min: 1 }),
  body("zipFileName").isLength({ min: 1 }),
  async (req, res) => {
    // TODO: get rid of timeout
    setTimeout(async () => {
      try {
        const deploymentDirectoryPath = req.body.deploymentDirectoryPath;
        const stagingDirectoryPath = req.body.stagingDirectoryPath;
        const zipFileName = req.body.zipFileName;

        await extractZipContentToDirectory(
          deploymentDirectoryPath,
          stagingDirectoryPath,
          zipFileName
        );
        res.send(`Renamed zip to ${zipFileName}`);
      } catch (error) {
        console.log("Unzipping failed: " + error.message);
        res.send("unzipping failed");
      }
    }, 3000);
  }
);

router.post(
  "/code-server/start",
  body("tunnelId").isLength({ min: 1 }),
  body("hostToken").isLength({ min: 1 }),
  body("tunnelName").isLength({ min: 1 }),
  body("cluster").isLength({ min: 1 }),
  (req, res) => {
    const tunnelId = req.body.tunnelId;
    const hostToken = req.body.hostToken;
    const tunnelName = req.body.tunnelName;
    const cluster = req.body.cluster;

    const { spawn } = require("child_process");

    const codeServerStartCommand = `yes | code-server --accept-server-license-terms --verbose serve --tunnel-id ${tunnelId} --host-token ${hostToken} --tunnel-name ${tunnelName} --cluster ${cluster}`;
    console.log(`Starting code-server: ${codeServerStartCommand}`);
    const ls = spawn(codeServerStartCommand, {
      cwd: "/root",
      shell: true,
      detached: true,
    });
    let clientUrl = undefined;
    ls.stdout.on(`data`, (data) => {
      console.log(Buffer.from(data).toString());
      const urlInd = data.indexOf("https");
      if (urlInd >= 0) {
        clientUrl = data.toString().substring(urlInd);
      }
    });

    ls.stderr.on("data", (data) => {
      console.error(`stderr: ${data}`);
      const urlInd = data.indexOf("https");
      if (urlInd >= 0) {
        clientUrl = data.toString().substring(urlInd);
      }
    });

    ls.on("close", (code) => {
      console.log(`child process exited with code ${code}`);
    });

    setTimeout(() => {
      if (clientUrl) {
        res.status(200).send("code server started");
      } else {
        res.status(500).send("code server failed");
      }
    }, 15000);
  }
);

app.use("/limelight-worker", router);

console.log("endpoints defined..");

app.listen(PORT, () => {
  console.log(`Example app listening on localhost: ${PORT} !`);
});

async function deleteZipFilesInDirectory(directoryPath) {
  const filesInDirectory = await fsPromises.readdir(directoryPath);
  for (let file of filesInDirectory) {
    if (file.endsWith("zip")) {
      fs.unlinkSync(directoryPath + file);
      console.log(`Removed ${file}`);
    }
  }
  console.log(`Zip files in the directory ${directoryPath} are deleted`);
}

async function extractZipContentToDirectory(
  sourceDirectory,
  targetDirectory,
  zipFileName
) {
  console.log(
    `Starting unzipping ${zipFileName} at path: ${sourceDirectory}/${zipFileName}`
  );
  const zipLocation = sourceDirectory + "/" + zipFileName;
  const file = new AdmZip(zipLocation);
  file.extractAllTo(targetDirectory);
  const timestamp = Date.now();
  var newFileName = zipFileName;
  var arr = newFileName.split(".");
  newFileName = arr[0] + timestamp.toString() + "." + arr[1];
  const newZipLocation = sourceDirectory + "/" + newFileName;
  await fs.promises.rename(zipLocation, newZipLocation);
  console.log("Successfully finished staging call");
}
