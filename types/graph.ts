export interface GraphNode {
  id: string;
  labels: string[];
  properties: Record<string, any>;
}

export interface GraphRelationship {
  id: string;
  type: string;
  fromId: string;
  toId: string;
  properties: Record<string, any>;
} 