const {
  // ManagedIdentityCredential,
  DefaultAzureCredential,
} = require("@azure/identity");
const { ContainerAppsAPIClient } = require("@azure/arm-appcontainers");
const { default: axios } = require("axios");
// let cred = new ManagedIdentityCredential(
//   "24132823-22c0-487e-bd77-648ad2226994"
// );
let cred = new DefaultAzureCredential();
const subscriptionId = "edc48857-dd0b-4085-a2a9-5e7df12bd2fd";
const resourceGroupName = "limelight";
let containerAppClient = new ContainerAppsAPIClient(cred, subscriptionId);

module.exports = async function (context, timer) {
  context.log(
    `Starting cleaning up orphaned container apps....${new Date().toISOString()}`
  );

  let containerApps;
  try {
    containerApps =
      containerAppClient.containerApps.listByResourceGroup("limelight");
  } catch (e) {
    // cred = new ManagedIdentityCredential(
    //   "24132823-22c0-487e-bd77-648ad2226994"
    // );
    cred = new DefaultAzureCredential();
    containerAppClient = new ContainerAppsAPIClient(cred, subscriptionId);
    containerApps =
      containerAppClient.containerApps.listByResourceGroup("limelight");
    context.log(e);
  }

  for await (const containerAppPage of containerApps.byPage()) {
    for (const containerApp of containerAppPage) {
      // check if containerApp is active
      const hostname = containerApp.configuration.ingress.fqdn;
      const containerAppName = containerApp.name;

      if (!containerAppName.startsWith("ll")) {
        continue;
      }

      try {
        context.log(
          `Container app ${containerAppName}'s provisioning state is ${containerApp.provisioningState}`
        );
        if (containerApp.provisioningState === "Succeeded") {
          context.log(`Pinging container app ${containerAppName}...`);
          await setTimeout(25000);
          await axios.get(`https://${hostname}:443/limelight/ping`, {
            timeout: 5000,
          });
        }
      } catch (e) {
        // container app is down, delete it
        context.log(e);

        context.log(`Deleting container app ${containerAppName} ....`);
        await containerAppClient.containerApps.beginDeleteAndWait(
          resourceGroupName,
          containerApp.name
        );
        context.log(`Container app ${containerAppName} deleted....`);
      }
    }
  }

  // find all inactive ones by pinging and delete them
  context.log(
    `Complete cleaning up orphaned container apps....${new Date().toISOString()}`
  );
};
