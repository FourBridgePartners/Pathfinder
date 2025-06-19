import neo4j, { Driver, Session, Node, Relationship } from 'neo4j-driver';

interface NodeProperties {
  labels: string[];
  properties: Record<string, any>;
}

interface RelationshipProperties {
  fromNode: string;
  toNode: string;
  type: string;
  properties?: Record<string, any>;
}

export class Neo4jService {
  private static instance: Neo4jService;
  public driver: Driver;

  private constructor() {
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'password';

    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }

  public static getInstance(): Neo4jService {
    if (!Neo4jService.instance) {
      Neo4jService.instance = new Neo4jService();
    }
    return Neo4jService.instance;
  }

  public getSession(): Session {
    return this.driver.session();
  }

  public async createOrUpdateNode({ labels, properties }: NodeProperties): Promise<Node> {
    const session = this.driver.session();
    try {
      // Create a unique constraint on id if it doesn't exist
      await session.run(`
        CREATE CONSTRAINT IF NOT EXISTS FOR (n:${labels[0]}) REQUIRE n.id IS UNIQUE
      `);

      // Merge the node with the given properties
      const result = await session.run(`
        MERGE (n:${labels.join(':')} {id: $id})
        SET n += $properties
        RETURN n
      `, {
        id: properties.id,
        properties
      });

      return result.records[0].get('n');
    } finally {
      await session.close();
    }
  }

  public async createOrUpdateRelationship({ fromNode, toNode, type, properties = {} }: RelationshipProperties): Promise<Relationship> {
    const session = this.driver.session();
    try {
      console.log(`[Neo4j] Creating relationship: ${fromNode} → ${toNode}, type: ${type}`);
      const result = await session.run(`
        MATCH (from {id: $fromNode})
        MATCH (to {id: $toNode})
        MERGE (from)-[r:${type}]->(to)
        SET r += $properties
        RETURN r
      `, {
        fromNode,
        toNode,
        properties
      });

      return result.records[0].get('r');
    } finally {
      await session.close();
    }
  }

  public async findNodeByProperty(label: string, property: string, value: any): Promise<Node | null> {
    const session = this.driver.session();
    try {
      const result = await session.run(`
        MATCH (n:${label} {${property}: $value})
        RETURN n
        LIMIT 1
      `, { value });

      if (result.records.length > 0) {
        return result.records[0].get('n');
      }

      return null;
    } finally {
      await session.close();
    }
  }

  public async getGraph(): Promise<any> {
    const session = this.driver.session();
    try {
      const result = await session.run(`
        MATCH (n)
        OPTIONAL MATCH (n)-[r]->(m)
        RETURN n, r, m
      `);
      return result.records;
    } finally {
      await session.close();
    }
  }

  public async close(): Promise<void> {
    await this.driver.close();
  }
} 