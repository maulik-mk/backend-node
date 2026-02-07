import { DefaultAzureCredential } from '@azure/identity';
import env from '#config/env.js';

/**
 * Shared DefaultAzureCredential instance for all Azure services.
 * In production, this uses Managed Identity.
 * If AZURE_CLIENT_ID is provided, it targets a specific User-Assigned Managed Identity.
 */
export const azureCredential = new DefaultAzureCredential({
   managedIdentityClientId: env.AZURE_CLIENT_ID,
});
