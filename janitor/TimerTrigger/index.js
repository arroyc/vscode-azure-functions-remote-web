const { ManagedIdentityCredential } = require("@azure/identity");
const { ContainerAppsAPIClient } = require("@azure/arm-appcontainers");
const { default: axios } = require("axios");
const cred = new ManagedIdentityCredential(
  "24132823-22c0-487e-bd77-648ad2226994"
);
const subscriptionId = "edc48857-dd0b-4085-a2a9-5e7df12bd2fd";
const resourceGroupName = "limelight";
const containerAppClient = new ContainerAppsAPIClient(cred, subscriptionId);

module.exports = async function (context, timer) {
  context.log(
    `Starting cleaning up orphaned container apps....${new Date().toISOString()}`
  );
  // list all container apps starting with ll
  const containerApps =
    containerAppClient.containerApps.listByResourceGroup("limelight");

  for await (const containerAppPage of containerApps.byPage()) {
    for (const containerApp of containerAppPage) {
      // check if containerApp is active
      const hostname = containerApp.configuration.ingress.fqdn;
      const containerAppName = containerApp.name;

      try {
        context.log(`Pinging container app ${containerAppName} ....`);
        await axios.get(`https://${hostname}:443/limelight/ping`);
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
