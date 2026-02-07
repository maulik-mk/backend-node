export const userTypeDefs = `
  type User { 
    publicId: ID! 
    username: String! 
    email: String! 
    deliveryEmail: String!
    firstName: String!
    lastName: String!
    avatarId: String
    isTwoFactorEnabled: Boolean! 
  }

  type Session {
    sessionId: String!
    publicId: String!
    email: String!
    username: String!
    browser: String!
    os: String!
    deviceType: String!
    ip: String!
    location: String!
    createdAt: Float!
    lastAccessedAt: Float!
    latitude: Float
    longitude: Float
    isCurrent: Boolean!
    isOnline: Boolean!
  }

  type Query {
    me: User!
    mySessions: [Session!]!
  }

  type TwoFactorSetup { 
    secret: String! 
    qrCode: String! 
  }

  type Mutation { 
    setup2FA: TwoFactorSetup!
    confirm2FA(token: String!): Boolean!
    disable2FA(token: String!): Boolean!
    requestPasswordChange: Boolean!
    changePassword(newPassword: String!, code: String!): Boolean!
    updateName(firstName: String!, lastName: String!): Boolean!
    requestDeliveryEmailChange(newEmail: String!): Boolean!
    confirmDeliveryEmailChange(otp: String!): Boolean!
    signout: Boolean! 
    signoutAll: Boolean! 
    signoutSession(sessionId: String!): Boolean! 
  }
`;
