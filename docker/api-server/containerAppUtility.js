const { ContainerAppsAPIClient } = require("@azure/arm-appcontainers");

class ContainerAppsManager {
  constructor(credential, subscriptionId) {
    this.containerAppClient = new ContainerAppsAPIClient(
      credential,
      subscriptionId
    );
  }

  async createOrUpdateManagedEnvStorage(
    resourceGroupName,
    environmentName,
    storageName,
    storageEnvelope
  ) {
    return await this.containerAppClient.managedEnvironmentsStorages.createOrUpdate(
      resourceGroupName,
      environmentName,
      storageName,
      storageEnvelope
    );
  }

  async createOrUpdateContainerApp(
    resourceGroupName,
    containerAppName,
    containerAppEnvelope
  ) {
    const containerAppInfo =
      await this.containerAppClient.containerApps.beginCreateOrUpdateAndWait(
        resourceGroupName,
        containerAppName,
        containerAppEnvelope
      );

    return containerAppInfo;
  }
}

module.exports = ContainerAppsManager;
