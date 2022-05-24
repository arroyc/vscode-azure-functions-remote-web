const { SecretClient } = require("@azure/keyvault-secrets");

// const keyVaultClient = new SecretClient(
//   "https://limelight-key-vault.vault.azure.net/",
//   defaultCred
// );

class SecretManager {
  constructor(vaultUrl, credential) {
    this.keyVaultClient = new SecretClient(vaultUrl, credential);
  }

  async getSecret(secretName) {
    let entry = await this.keyVaultClient.getSecret(secretName);

    return entry.value;
  }
}

module.exports = SecretManager;
