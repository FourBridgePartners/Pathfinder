export interface Connection {
  name: string;
  currentRole?: string;
  currentCompany?: string;
  mutualConnections?: number;
  direction?: 'incoming' | 'outgoing' | 'mutual';
  connectionStrength?: number;
  lastSeen?: string;
  notes?: string;
  source?: string;
} 