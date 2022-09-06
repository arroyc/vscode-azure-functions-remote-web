const { DefaultAzureCredential } = require("@azure/identity");
const { ContainerAppsAPIClient } = require("@azure/arm-appcontainers");
const { default: axios } = require("axios");
const { TableClient } = require("@azure/data-tables");

let cred = new DefaultAzureCredential();
const account = "limelightfilestorage";
const tableName = "limelightworkerstatus";

const subscriptionId = "edc48857-dd0b-4085-a2a9-5e7df12bd2fd";
const resourceGroupName = "limelight";
let containerAppClient = new ContainerAppsAPIClient(cred, subscriptionId);

const tableClient = new TableClient(
  `https://${account}.table.core.windows.net`,
  tableName,
  cred
);

module.exports = async function (context, timer) {
  context.log(
    `Starting cleaning up orphaned container apps....${new Date().toISOString()}`
  );

  let containerApps =
    containerAppClient.containerApps.listByResourceGroup("limelight");

  for await (const containerAppPage of containerApps.byPage()) {
    for (const containerApp of containerAppPage) {
      // check if containerApp is active
      const hostname = containerApp.configuration.ingress.fqdn;
      const containerAppName = containerApp.name;

      if (!containerAppName.startsWith("ll")) {
        continue;
      }

      context.log(`Worker container app ${containerAppName}`);
      let workerContainerAppRecord;
      try {
        workerContainerAppRecord = await tableClient.getEntity(
          containerAppName,
          containerAppName
        );
      } catch (e) {
        context.log(`${containerAppName} not recorded in table.`);
      }

      context.log(
        `Worker container app ${containerAppName} - ${workerContainerAppRecord.pingFailureCount}`
      );
      let pingFailureCount = 0;

      if (!workerContainerAppRecord) {
        await tableClient.createEntity({
          partitionKey: containerAppName,
          rowKey: containerAppName,
          pingFailureCount,
        });
      } else {
        pingFailureCount = workerContainerAppRecord.pingFailureCount;
      }

      try {
        context.log(
          `Container app ${containerAppName}'s provisioning state is ${containerApp.provisioningState}`
        );
        context.log(`Pinging container app ${containerAppName}...`);
        await axios.get(`https://${hostname}:443/limelight/ping`, {
          timeout: 5000,
        });
        pingFailureCount = 0;
        await tableClient.updateEntity({
          partitionKey: containerAppName,
          rowKey: containerAppName,
          pingFailureCount,
        });
      } catch (e) {
        // container app is down, delete it
        pingFailureCount++;
        context.log(
          `Container app ${containerAppName} cant be pinged, updating status..`
        );
        // context.log(e);
        if (pingFailureCount >= 3) {
          await tableClient.deleteEntity(containerAppName, containerAppName);
          context.log(`Deleting container app ${containerAppName} ....`);
          await containerAppClient.containerApps.beginDeleteAndWait(
            resourceGroupName,
            containerApp.name
          );
          context.log(`Container app ${containerAppName} deleted....`);
        } else {
          await tableClient.updateEntity({
            partitionKey: containerAppName,
            rowKey: containerAppName,
            pingFailureCount,
          });
        }
      }
    }
  }

  // find all inactive ones by pinging and delete them
  context.log(
    `Complete cleaning up orphaned container apps....${new Date().toISOString()}`
  );
};
