const express = require("express");
const cors = require("cors");
const app = express();
const router = express.Router();
const AdmZip = require("adm-zip");
const fs = require("fs");
console.log("modules imported..");
app.use(cors());
// Constants
const PORT = 443;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// forced timeout
setTimeout(() => {
  console.log("Forced timeout");
  process.exit(0);
}, 300000);

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
    console.log("Inactive timeout");
    process.exit(0);
  }, 150000);
  return res.send("ok");
});

router.put("/staging", (req, res) => {
  setTimeout(() => {
    try {
      const stagingDirectoryPath = req.body.stagingDirectoryPath;
      const zipFileName = req.body.zipFileName;
      console.log("Before admzip" + stagingDirectoryPath + "/" + zipFileName);
      const file = new AdmZip(stagingDirectoryPath + "/" + zipFileName);
      console.log("After ADM zip");
      file.extractAllTo(stagingDirectoryPath);
      const timestamp = Date.now();
      var newFileName = zipFileName;
      var arr = newFileName.split(".");
      newFileName = arr[0] + timestamp.toString() + "." + arr[1];
      fs.rename(
        stagingDirectoryPath + "/" + zipFileName,
        stagingDirectoryPath + "/" + newFileName,
        function (err) {
          if (err) {
            console.log("ERROR: " + err);
          }
        }
      );
      res.send("Renamed zip to " + newFileName);
    } catch (error) {
      console.log(error.message);
      res.send("unzipping failed");
    }
  }, 2000);
});

router.post("/code-server/start", (req, res) => {
  const tunnelId = req.body.tunnelId;
  const hostToken = req.body.hostToken;
  const tunnelName = req.body.tunnelName;

  const cluster = req.body.cluster;
  const { spawn } = require("child_process");

  const ls = spawn(
    `yes | code-server --accept-server-license-terms --verbose serve --tunnel-id ${tunnelName} --host-token ${hostToken} --tunnel-name ${tunnelName} --cluster ${cluster} --port 8000`,
    { cwd: "/root", shell: true, detached: true }
  );
  let client_url = undefined;

  ls.stdout.on(`data`, (data) => {
    console.log(Buffer.from(data).toString());
    // console.log(new Buffer(data).toString('ascii'))
    // return res.send(data)
  });

  ls.stderr.on("data", (data) => {
    console.error(`stderr: ${data}`);
    // const url_Ind = data.indexOf("https");
    // if (url_Ind >= 0) {
    //   client_url = data.toString().substring(url_Ind);
    // }
  });

  ls.on("close", (code) => {
    console.log(`child process exited with code ${code}`);
    // console.log(dataBuffer.toString())
  });

  // setTimeout(() => {
  //   return res.send(client_url);
  // }, 150000);
});

app.use("/limelight", router);

console.log("endpoints defined..");

app.listen(PORT, () => {
  console.log(`Example app listening on localhost: ${PORT} !`);
});
