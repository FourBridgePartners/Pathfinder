export interface FourBridgeMember {
  name: string;
  username: string;
  password: string;
}

/**
 * Get FourBridge members from environment variables
 */
export function getFourBridgeMembers(): FourBridgeMember[] {
  const members: FourBridgeMember[] = [];

  // Jon
  if (process.env.LINKEDIN_JON_USERNAME && process.env.LINKEDIN_JON_PASSWORD) {
    members.push({
      name: 'Jon',
      username: process.env.LINKEDIN_JON_USERNAME,
      password: process.env.LINKEDIN_JON_PASSWORD
    });
  }

  // Chris
  if (process.env.LINKEDIN_CHRIS_USERNAME && process.env.LINKEDIN_CHRIS_PASSWORD) {
    members.push({
      name: 'Chris',
      username: process.env.LINKEDIN_CHRIS_USERNAME,
      password: process.env.LINKEDIN_CHRIS_PASSWORD
    });
  }

  // Ted
  if (process.env.LINKEDIN_TED_USERNAME && process.env.LINKEDIN_TED_PASSWORD) {
    members.push({
      name: 'Ted',
      username: process.env.LINKEDIN_TED_USERNAME,
      password: process.env.LINKEDIN_TED_PASSWORD
    });
  }

  // Tejas
  if (process.env.LINKEDIN_TEJAS_USERNAME && process.env.LINKEDIN_TEJAS_PASSWORD) {
    members.push({
      name: 'Tejas',
      username: process.env.LINKEDIN_TEJAS_USERNAME,
      password: process.env.LINKEDIN_TEJAS_PASSWORD
    });
  }

  return members;
}

/**
 * Get FourBridge members for display (without passwords)
 */
export function getFourBridgeMembersForDisplay(): Array<{ name: string; username: string }> {
  return getFourBridgeMembers().map(member => ({
    name: member.name,
    username: member.username
  }));
}

/**
 * Get required environment variable names for FourBridge members
 */
export function getRequiredEnvVars(): string[] {
  return [
    'LINKEDIN_JON_USERNAME', 'LINKEDIN_JON_PASSWORD',
    'LINKEDIN_CHRIS_USERNAME', 'LINKEDIN_CHRIS_PASSWORD',
    'LINKEDIN_TED_USERNAME', 'LINKEDIN_TED_PASSWORD',
    'LINKEDIN_TEJAS_USERNAME', 'LINKEDIN_TEJAS_PASSWORD'
  ];
}

/**
 * Check if any FourBridge member credentials are available
 */
export function hasFourBridgeMembers(): boolean {
  return getFourBridgeMembers().length > 0;
} 