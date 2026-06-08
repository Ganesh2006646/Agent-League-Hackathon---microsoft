require('isomorphic-fetch');
const { ClientSecretCredential } = require('@azure/identity');
const { Client } = require('@microsoft/microsoft-graph-client');
const { TokenCredentialAuthenticationProvider } = require('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials');

const credential = new ClientSecretCredential(
  process.env.TENANT_ID,
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET
);

const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ['https://graph.microsoft.com/.default']
});

const graphClient = Client.initWithMiddleware({ authProvider });

/**
 * Returns the initialized Microsoft Graph client.
 * @returns {Client}
 */
function getGraphClient() {
  return graphClient;
}

/**
 * Acquires a raw access token for direct REST calls.
 * @returns {Promise<string>}
 */
async function getAccessToken() {
  const tokenResponse = await credential.getToken('https://graph.microsoft.com/.default');
  return tokenResponse.token;
}

module.exports = { getGraphClient, getAccessToken };
