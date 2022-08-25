const express = require("express");
const cors = require("cors");
const app = express();
const router = express.Router();
const AdmZip = require("adm-zip");
const sanitize = require("sanitize-filename");
const fs = require("fs");
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
  // setTimeout(() => {
  //   try {
  //     const DIR = req.body.stagingDirectoryPath;
  //     fs.readdir(DIR, (error, filesInDirectory) => {
  //       if (error) throw error
  //       for (let file of filesInDirectory) {
  //         if (file.endsWith("zip")) {
  //           fs.unlinkSync(DIR + file);
  //           console.log("Removed: " + file);
  //         }

  //       }
  //     })
  //     res.send("deleted existing zips succesfully");
  //   } catch (error) {
  //     console.log(error.message);
  //     res.send("deleting existing zips failed");
  //   }
  // }, 2000);
  console.log("Deleting zips...");

  const fsPromises = fs.promises;
  const DIR = req.body.stagingDirectoryPath;
  try {
    const filesInDirectory = await fsPromises.readdir(DIR);
    for (let file of filesInDirectory) {
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
    res.send("deleting existing zips failed");
  }
});

router.put("/staging", async (req, res) => {
  setTimeout(async () => {
    try {
      const deploymentDirectoryPath = req.body.deploymentDirectoryPath;
      const stagingDirectoryPath = req.body.stagingDirectoryPath;
      const zipFileName = req.body.zipFileName;
      console.log(
        "Starting unzipping " +
          zipFileName +
          " at path: " +
          deploymentDirectoryPath +
          "/" +
          zipFileName
      );
      const zipLocation = deploymentDirectoryPath + "/" + zipFileName;
      const file = new AdmZip(zipLocation);
      file.extractAllTo(stagingDirectoryPath, true);
      const timestamp = Date.now();
      var newFileName = zipFileName;
      var arr = newFileName.split(".");
      newFileName = arr[0] + timestamp.toString() + "." + arr[1];
      const newZipLocation = deploymentDirectoryPath + "/" + newFileName;
      await fs.promises.rename(
        zipLocation,
        newZipLocation
      );
      console.log("Successfully finished staging call");
      res.send("Renamed zip to " + newFileName);
    } catch (error) {
      console.log("Unzipping failed: " + error.message);
      res.send("unzipping failed");
    }
  }, 3000);
});

router.post("/code-server/start", (req, res) => {
  const tunnelId = req.body.tunnelId;
  const hostToken = req.body.hostToken;
  const tunnelName = req.body.tunnelName;
  const cluster = req.body.cluster;

  checkExists("tunnelId", tunnelId);
  checkExists("hostToken", hostToken);
  checkExists("tunnelName", tunnelName);
  checkExists("cluster", cluster);

  const { spawn } = require("child_process");

  const codeServerStartCommand = `yes | code-server --accept-server-license-terms --verbose serve --tunnel-id ${tunnelName} --host-token ${hostToken} --tunnel-name ${tunnelName} --cluster ${cluster}`;
  console.log(`Starting code-server: ${codeServerStartCommand}`);
  const ls = spawn(codeServerStartCommand, {
    cwd: "/root",
    shell: true,
    detached: true,
  });
  let clientUrl = undefined;
  ls.stdout.on(`data`, (data) => {
    console.log(Buffer.from(data).toString());
    // console.log(new Buffer(data).toString('ascii'))
    // return res.send(data)
    const url_Ind = data.indexOf("https");
    if (url_Ind >= 0) {
      clientUrl = data.toString().substring(url_Ind);
    }
  });

  ls.stderr.on("data", (data) => {
    console.error(`stderr: ${data}`);
    const url_Ind = data.indexOf("https");
    if (url_Ind >= 0) {
      clientUrl = data.toString().substring(url_Ind);
    }
  });

  ls.on("close", (code) => {
    console.log(`child process exited with code ${code}`);
    // console.log(dataBuffer.toString())
    // if (!returned) {
    //   returned = true;
    //   res.status(500).send(`child process exited with code ${code}`);
    // }
  });

  setTimeout(() => {
    if (clientUrl) {
      res.status(200).send("code server started");
    } else {
      res.status(500).send("code server failed");
    }
  }, 15000);
});

app.use("/limelight", router);

console.log("endpoints defined..");

function checkExists(name, value) {
  if (!value) {
    throw new Error(`variable ${name} is undefined!`);
  }
}

app.listen(PORT, () => {
  console.log(`Example app listening on localhost: ${PORT} !`);
});
