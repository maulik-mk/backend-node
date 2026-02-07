import { CosmosClient } from '@azure/cosmos';

import env from '#config/env.js';
import { azureCredential } from '#config/identity.js';

let cosmosClient: CosmosClient | null = null;

if (env.COSMOS_ENDPOINT) {
   if (env.COSMOS_KEY) {
      cosmosClient = new CosmosClient({
         endpoint: env.COSMOS_ENDPOINT,
         key: env.COSMOS_KEY,
      });
   } else {
      cosmosClient = new CosmosClient({
         endpoint: env.COSMOS_ENDPOINT,
         aadCredentials: azureCredential,
      });
   }
}

export const auditDb = cosmosClient?.database('audit_db');
export const auditLogsContainer = auditDb?.container('audit_logs');
export const authLogsContainer = auditDb?.container('auth_logs');

export default cosmosClient;
