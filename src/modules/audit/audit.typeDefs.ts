export const auditTypeDefs = `
   type AuditLog {
      id: String!
      action: String!
      operationType: String!
      ipHash: String
      metadata: String
      timestamp: Float!
   }

   extend type Query {
      myAuditLogs(limit: Int, offset: Int): [AuditLog!]!
   }
`;
