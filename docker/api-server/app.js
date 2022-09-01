// Third-party modules
const express = require("express");
const cors = require("cors");
const uuid = require("uuid");
const { DefaultAzureCredential } = require("@azure/identity");
const { body } = require("express-validator");

// Custom modules
const SecretManager = require("./secretUtility.js");
const FileManager = require("./fileUtility.js");
const ContainerAppsManager = require("./containerAppUtility.js");

// Constants
const serverPort = 443;

// Env vars
const subscriptionId = "edc48857-dd0b-4085-a2a9-5e7df12bd2fd";
const resourceGroupName = "limelight";
const managedEnvironmentName = "limelight-container-app-env";
const volumeMountingFolder = "functionapp";
const secretKeyVaultUrl = "https://limelight-key-vault.vault.azure.net/";
const limelightContainerRegistryPwd = "ll-registry-pword";
let storageName;
const shareName = "limelightfs";
const { default: axios } = require("axios");

// Env initialization
const app = express();
const router = express.Router();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send(err);
});

const defaultCred = new DefaultAzureCredential();

const secretManager = new SecretManager(secretKeyVaultUrl, defaultCred);

let registryP;

(async () => {
  // TODO: does this raise error if not authenticated
  registryP = await secretManager.getSecret(limelightContainerRegistryPwd);
})();

const containerAppManager = new ContainerAppsManager(
  defaultCred,
  subscriptionId
);

// Endpoints
router.get("/ping", (req, res) => {
  return res.send("ok");
});

router.post(
  "/session/start",
  body("directoryPath").isLength({ min: 1 }),
  async (req, res) => {
    const requestId = uuid.v4().toString();
    try {
      console.log(
        `${requestId} Starting limelight session at time ${req.body.calledWhen}`
      );
      storageName = req.body.storageName;
      const containerAppName =
        "ll" + uuid.v4().replace(/-/g, "").substring(0, 15);
      const storageEnvelope = {
        properties: {
          azureFile: {
            accessMode: "ReadWrite",
            accountKey: req.body.accountKey,
            accountName: req.body.storageName,
            shareName: shareName,
          },
        },
      };

      const containerAppEnvelope = {
        identity: {
          type: "UserAssigned",
          userAssignedIdentities: {
            "/subscriptions/edc48857-dd0b-4085-a2a9-5e7df12bd2fd/resourceGroups/290459317/providers/Microsoft.ManagedIdentity/userAssignedIdentities/limelight-api-server":
              {
                principalId: "90f60ced-54ac-4bc3-b20c-bae5ba85e7fa",
                clientId: "acf5c5a9-bccf-479e-aa83-c97d0afcc37a",
              },
          },
        },
        configuration: {
          dapr: { enabled: false },
          ingress: {
            external: true,
            targetPort: serverPort,
          },
          secrets: [
            {
              name: "reg-pp",
              value: registryP,
            },
          ],
          registries: [
            {
              server: "vscodedev.azurecr.io",
              identity:
                "/subscriptions/edc48857-dd0b-4085-a2a9-5e7df12bd2fd/resourceGroups/290459317/providers/Microsoft.ManagedIdentity/userAssignedIdentities/limelight-api-server",
              username: "vscodedev",
              passwordSecretRef: "reg-pp",
            },
          ],
        },
        location: "Central US",
        managedEnvironmentId: `/subscriptions/edc48857-dd0b-4085-a2a9-5e7df12bd2fd/resourceGroups/limelight/providers/Microsoft.App/managedEnvironments/${managedEnvironmentName}`,
        template: {
          containers: [
            {
              name: containerAppName,
              image: "vscodedev.azurecr.io/vscodedev:v9",
              resources: {
                cpu: 2,
                memory: "4Gi",
              },
              volumeMounts: [
                {
                  volumeName: "cx-app-vol",
                  mountPath: `/${volumeMountingFolder}`,
                },
              ],
            },
          ],
          scale: {
            maxReplicas: 1,
            minReplicas: 0,
          },
          volumes: [
            {
              name: "cx-app-vol",
              storageType: "AzureFile",
              storageName: storageName,
            },
          ],
        },
      };

      await containerAppManager.createOrUpdateManagedEnvStorage(
        resourceGroupName,
        managedEnvironmentName,
        storageName,
        storageEnvelope
      );

      const workerContainer =
        await containerAppManager.createOrUpdateContainerApp(
          resourceGroupName,
          containerAppName,
          containerAppEnvelope
        );

      console.log(`${requestId} limelight session started`);
      return res.json({
        status: true,
        data: workerContainer,
      });
    } catch (e) {
      console.log(`${requestId} Failed to start limelight session`);
      console.error(e);
      res.status(500).json({
        status: false,
        error: `${e.message} `,
      });
    }
  }
);

router.post(
  "/file/sync",
  body("hostname").isLength({ min: 1 }),
  body("username").isLength({ min: 1 }),
  body("connStr").isLength({ min: 1 }),
  body("srcURL").isLength({ min: 1 }),
  async (req, res) => {
    const requestId = uuid.v4().toString();
    try {
      const hostname = req.body.hostname;
      const username = req.body.username;
      const connStr = req.body.connStr;
      const srcURL = req.body.srcURL;
      const srcBlob = parseSourceBlob(srcURL);
      const fileManager = new FileManager(connStr, srcBlob, srcURL, shareName);

      console.log(
        `${requestId} Starting sync file at hostname: ${hostname} at ${new Date().toISOString()}`
      );

      await deleteExistingDeploymentZips(username, srcBlob, srcURL, hostname);

      await fileManager.copyZipBetweenDirectories(
        `Deployment/${username}`,
        `Staging/${username}`
      );

      await extractDeployZipContent(username, srcBlob, hostname);
      console.log(
        `${requestId} Done sync file at hostname: ${hostname} at ${new Date().toISOString()}`
      );

      res.json({
        status: true,
        data: `${requestId} function app file synced`,
      });
    } catch (e) {
      console.log(`${requestId} Failed to sync cx function app files`);
      console.error(e);
      res.status(500).json({
        status: false,
        error: `${requestId} ${e.message}`,
      });
    }

    async function extractDeployZipContent(username, srcBlob, hostname) {
      const reqBody = {
        deploymentDirectoryPath: `/${volumeMountingFolder}/Deployment/${username}`,
        stagingDirectoryPath: `/${volumeMountingFolder}/Staging/${username}`,
        zipFileName: srcBlob,
      };
      // Call staging endpoint here
      console.log(
        `${requestId} Start unzipping to staging at hostname: ${hostname} at ${new Date().toISOString()}`
      );
      await axios.put(`https://${hostname}:443/limelight/staging`, reqBody);
      console.log(
        `${requestId} Done unzipping to Staging at hostname: ${hostname} at ${new Date().toISOString()}`
      );
    }

    async function deleteExistingDeploymentZips(
      username,
      srcBlob,
      srcURL,
      hostname
    ) {
      const requestBody = {
        directoryPath: `/${volumeMountingFolder}/Deployment/${username}/`,
        srcBlob,
        srcURL,
      };
      console.log(
        `${requestId} Starting deleting zips at hostname: ${hostname} at ${new Date().toISOString()}`
      );
      await axios.put(
        `https://${hostname}:443/limelight/delete/zips`,
        requestBody
      );
      console.log(
        `${requestId} Done deleting zips at hostname: ${hostname} at ${new Date().toISOString()}`
      );
    }

    function parseSourceBlob(srcUrl) {
      let srcUrlParts = srcUrl.split("?");
      srcUrlParts = srcUrlParts[0].split("/");
      const srcBlob = srcUrlParts[srcUrlParts.length - 1];
      return srcBlob;
    }
  }
);

app.use("/limelight", router);

app.listen(serverPort, () => {
  console.log(
    `Container Service server listening on localhost: ${serverPort}!`
  );
});
