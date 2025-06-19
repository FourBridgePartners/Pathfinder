export interface LPContact {
  name: string;
  firm?: string;
  role?: string;
  school?: string;
  degree?: string;
  startDate?: string;
  endDate?: string;
  source?: {
    type: string;
    filename?: string;
    sourceName?: string;
  };
  confidence?: {
    overall: number;
    [key: string]: number;
  };
  [key: string]: any;
} 