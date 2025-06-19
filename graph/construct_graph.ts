import { Neo4jService } from '../services/neo4j';
import { LPContact, JobHistoryResponse, Connection } from '../types';
import type { GraphNode, GraphRelationship } from '../types/graph';
import { resolveEntityName, compareEntityNames } from './utils/resolveAliases';
import { Node } from 'neo4j-driver';

type InternalNode = Node;

interface GraphConstructionOptions {
  debug?: boolean;
  includeStructuredList?: boolean;
  minSimilarity?: number;
}

interface MutualConnection {
  id: string;
  name: string;
  headline?: string;
  profileUrl?: string;
  mutualCount: number;
  viaFourBridgeMembers: string[];
}

// New interface for Puppeteer mutual connections
interface PuppeteerMutualConnection {
  name: string;
  profileUrl: string;
  title?: string;
  discoveredBy: string;
  via: 'puppeteer';
}

export class GraphConstructor {
  public neo4j: Neo4jService;
  public driver: any;
  public session: any;

  constructor(driverOverride?: any, sessionOverride?: any) {
    this.neo4j = Neo4jService.getInstance();
    this.driver = driverOverride || this.neo4j.driver;
    this.session = sessionOverride || this.driver.session();
  }

  private isNeo4jNode(node: InternalNode | GraphNode): node is InternalNode {
    return 'identity' in node;
  }

  private getNodeId(node: InternalNode | GraphNode): string {
    if (this.isNeo4jNode(node)) {
      return node.identity.toString();
    }
    return node.id;
  }

  private createPersonNode(contact: LPContact): GraphNode {
    const id = `person_${contact.name.toLowerCase().replace(/\s+/g, '_')}`;
    return {
      id,
      labels: ['Person'],
      properties: {
        ...contact,
        id,
        name: contact.name,
        type: 'Person'
      }
    };
  }

  private createFirmNode(name: string): GraphNode {
    const id = `firm_${name.toLowerCase().replace(/\s+/g, '_')}`;
    return {
      id,
      labels: ['Firm'],
      properties: {
        id,
        name,
        type: 'Firm'
      }
    };
  }

  private createSchoolNode(name: string): GraphNode {
    const id = `school_${name.toLowerCase().replace(/\s+/g, '_')}`;
    return {
      id,
      labels: ['School'],
      properties: {
        id,
        name,
        type: 'School'
      }
    };
  }

  private createWorkedAtRelationship(
    fromId: string,
    toId: string,
    role: string | undefined,
    source: { type: string; filename?: string; sourceName?: string }
  ): GraphRelationship {
    return {
      id: `${fromId}_${toId}_WORKED_AT`,
      type: 'WORKED_AT',
      fromId,
      toId,
      properties: {
        role,
        source
      }
    };
  }

  private createAttendedSchoolRelationship(
    fromId: string,
    toId: string,
    degree: string | undefined,
    source: { type: string; filename?: string; sourceName?: string }
  ): GraphRelationship {
    return {
      id: `${fromId}_${toId}_ATTENDED_SCHOOL`,
      type: 'ATTENDED_SCHOOL',
      fromId,
      toId,
      properties: {
        degree,
        source
      }
    };
  }

  private createKnowsRelationship(
    fromId: string,
    toId: string,
    metadata: {
      source: string;
      mutualConnections?: number;
      lastSeen?: string;
      notes?: string;
      direction?: 'incoming' | 'outgoing' | 'mutual';
    }
  ): GraphRelationship {
    return {
      id: `${fromId}_${toId}_KNOWS`,
      type: 'KNOWS',
      fromId,
      toId,
      properties: {
        ...metadata,
        createdAt: new Date().toISOString()
      }
    };
  }

  private async processPersonalConnections(contact: LPContact, contactNode: Node | GraphNode): Promise<void> {
    if (!contact.personalConnections) return;

    // Handle string-based connections (legacy format)
    if (typeof contact.personalConnections === 'string') {
      const connectionInfo = this.parseLinkedInConnections(contact.personalConnections);
      if (connectionInfo) {
        const targetName = this.extractTargetName(contact.personalConnections);
        if (targetName) {
          try {
            const connectionNode = await this.neo4j.createOrUpdateNode({
              labels: ['Person'],
              properties: {
                name: targetName,
                source: 'LinkedIn',
                lastUpdated: new Date().toISOString()
              }
            });

            await this.neo4j.createOrUpdateRelationship({
              fromNode: this.getNodeId(contactNode),
              toNode: connectionNode.identity.toString(),
              type: 'KNOWS',
              properties: {
                mutualConnections: connectionInfo.mutualConnections || 0,
                lastSeen: connectionInfo.lastSeen || null,
                direction: connectionInfo.direction || 'mutual',
                source: 'LinkedIn',
                notes: connectionInfo.notes || null
              }
            });
          } catch (error: unknown) {
            console.error(`Error processing legacy connection ${targetName}:`, error instanceof Error ? error.message : 'Unknown error');
          }
        }
      }
      return;
    }

    // Handle structured connections
    for (const connection of contact.personalConnections) {
      if (!connection?.name) continue;

      try {
        // Create or update connection node
        const connectionNode = await this.neo4j.createOrUpdateNode({
          labels: ['Person'],
          properties: {
            name: connection.name,
            currentRole: connection.currentRole || null,
            currentCompany: connection.currentCompany || null,
            source: connection.source || contact.source?.type || 'manual',
            lastUpdated: new Date().toISOString()
          }
        });

        // Create KNOWS relationship
        await this.neo4j.createOrUpdateRelationship({
          fromNode: this.getNodeId(contactNode),
          toNode: connectionNode.identity.toString(),
          type: 'KNOWS',
          properties: {
            source: connection.source || contact.source?.type || 'manual',
            mutualConnections: connection.mutualConnections || null,
            lastSeen: connection.lastSeen || null,
            direction: connection.direction || 'mutual',
            notes: connection.notes || null
          }
        });
      } catch (error: unknown) {
        console.error(`Error processing connection ${connection.name}:`, error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }

  private extractTargetName(connectionText: string): string | null {
    const match = connectionText.match(/with\s+([^,]+)/i);
    return match ? match[1].trim() : null;
  }

  private parseLinkedInConnections(connectionText: string): {
    mutualConnections?: number;
    lastSeen?: string;
    notes?: string;
    direction?: 'incoming' | 'outgoing' | 'mutual';
  } | null {
    const mutualMatch = connectionText.match(/(\d+)\s+mutual\s+connections?/i);
    const lastSeenMatch = connectionText.match(/last\s+seen\s+([^,]+)/i);
    const directionMatch = connectionText.match(/(incoming|outgoing|mutual)/i);

    if (!mutualMatch && !lastSeenMatch && !directionMatch) {
      return null;
    }

    return {
      mutualConnections: mutualMatch ? parseInt(mutualMatch[1]) : undefined,
      lastSeen: lastSeenMatch ? lastSeenMatch[1].trim() : undefined,
      direction: directionMatch ? directionMatch[1].toLowerCase() as 'incoming' | 'outgoing' | 'mutual' : undefined
    };
  }

  private async processJobHistory(contact: LPContact, contactNode: InternalNode | GraphNode): Promise<void> {
    if (!contact.jobHistoryRaw) return;

    try {
      const jobHistory = JSON.parse(contact.jobHistoryRaw);
      if (!Array.isArray(jobHistory)) return;

      for (const job of jobHistory) {
        if (!job.company) continue;

        try {
          // Create or update company node
          const companyNode = await this.neo4j.createOrUpdateNode({
            labels: ['Firm'],
            properties: {
              name: job.company,
              source: contact.source?.type || 'manual',
              lastUpdated: new Date().toISOString()
            }
          });

          // Create WORKED_AT relationship
          await this.neo4j.createOrUpdateRelationship({
            fromNode: this.getNodeId(contactNode),
            toNode: companyNode.identity.toString(),
            type: 'WORKED_AT',
            properties: {
              role: job.role || job.title || null,
              startDate: job.startDate || job.startYear || null,
              endDate: job.endDate || job.endYear || null,
              source: contact.source?.type || 'manual'
            }
          });
        } catch (error: unknown) {
          console.error(`Error processing job ${job.company} for ${contact.name}:`, error instanceof Error ? error.message : 'Unknown error');
        }
      }
    } catch (error) {
      console.error('Error parsing job history JSON:', error);
    }
  }

  private async processEducation(contact: LPContact, contactNode: InternalNode | GraphNode): Promise<void> {
    if (!contact.educationRaw) return;

    try {
      const education = JSON.parse(contact.educationRaw);
      if (!Array.isArray(education)) return;

      for (const edu of education) {
        if (!edu.school && !edu.institution) continue;

        try {
          const schoolName = edu.school || edu.institution;
          
          // Create or update school node
          const schoolNode = await this.neo4j.createOrUpdateNode({
            labels: ['School'],
            properties: {
              name: schoolName,
              source: contact.source?.type || 'manual',
              lastUpdated: new Date().toISOString()
            }
          });

          // Create ATTENDED_SCHOOL relationship
          await this.neo4j.createOrUpdateRelationship({
            fromNode: this.getNodeId(contactNode),
            toNode: schoolNode.identity.toString(),
            type: 'ATTENDED_SCHOOL',
            properties: {
              degree: edu.degree || null,
              startDate: edu.startDate || edu.startYear || null,
              endDate: edu.endDate || edu.endYear || edu.graduationYear || null,
              source: contact.source?.type || 'manual'
            }
          });
        } catch (error: unknown) {
          console.error(`Error processing education ${edu.school || edu.institution} for ${contact.name}:`, error instanceof Error ? error.message : 'Unknown error');
        }
      }
    } catch (error) {
      console.error('Error parsing education JSON:', error);
    }
  }

  async constructGraph(contacts: LPContact[], jobHistories: JobHistoryResponse[], options: GraphConstructionOptions = {}): Promise<{ graph: any; connections?: Connection[] }> {
    const { debug = false, minSimilarity = 0.8 } = options;

    try {
      console.log(`[GraphConstructor] Constructing graph with ${contacts.length} contacts and ${jobHistories.length} job histories`);

      const tx = this.session.beginTransaction();
      const personMap = new Map<string, GraphNode>();
      const nodes: GraphNode[] = [];
      const relationships: GraphRelationship[] = [];
      const connections: Connection[] = [];
      let skippedNodes = 0;
      let skippedRels = 0;

      const contactsCopy = contacts.map(c => ({ ...c }));
      const jobHistoriesCopy = jobHistories.map(jh => ({ ...jh, jobs: jh.jobs.map(j => ({ ...j })) }));

      // First pass: Create all nodes
      for (const contact of contactsCopy) {
        // Resolve entity names
        const resolvedPersonName = resolveEntityName(contact.name, { debug, minSimilarity });
        const resolvedFirmName = contact.firm ? resolveEntityName(contact.firm, { debug, minSimilarity }) : null;

        if (debug) {
          console.log(`[Graph] Resolved names for ${contact.name}:`);
          console.log(`  Person: ${contact.name} → ${resolvedPersonName}`);
          if (contact.firm) {
            console.log(`  Firm: ${contact.firm} → ${resolvedFirmName}`);
          }
        }

        const personKey = resolvedPersonName.toLowerCase();
        let personNode = personMap.get(personKey);
        if (!personNode) {
          personNode = this.createPersonNode(contact);
          personMap.set(personKey, personNode);
          nodes.push(personNode);
          if (debug) {
            console.log(`[Graph] Created node: ${personNode.id}, labels: ${personNode.labels.join(', ')}, name: ${personNode.properties.name}`);
          }
        } else {
          skippedNodes++;
          if (debug) {
            console.log(`[Graph] Skipped existing node: ${personNode.id}`);
          }
        }

        // Process personal connections
        await this.processPersonalConnections(contact, personNode);

        // Process job history
        await this.processJobHistory(contact, personNode);

        // Process education
        await this.processEducation(contact, personNode);
      }

      // Removed redundant second pass

      // Commit transaction
      await tx.commit();

      const graph = {
        nodes,
        relationships
      };

      return { graph, connections };
    } catch (error) {
      console.error('Error constructing graph:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.neo4j.close();
  }

  /**
   * Add mutual connections to the graph (API format)
   * Creates CONNECTED_VIA_MUTUAL relationships between FourBridge members and targets
   */
  async addMutualConnectionsToGraph(
    targetProfileUrl: string,
    mutualConnections: MutualConnection[],
    options: { debug?: boolean } = {}
  ): Promise<void> {
    const { debug = false } = options;

    try {
      if (debug) {
        console.log(`[GraphConstructor] Adding ${mutualConnections.length} API mutual connections to graph`);
      }

      for (const mutual of mutualConnections) {
        try {
          // Create or update mutual connection node
          const mutualNode = await this.neo4j.createOrUpdateNode({
            labels: ['Person'],
            properties: {
              id: `linkedin_${mutual.id}`,
              name: mutual.name,
              headline: mutual.headline || null,
              linkedinUrl: mutual.profileUrl || null,
              source: 'LinkedIn',
              type: 'Person',
              lastUpdated: new Date().toISOString()
            }
          });

          // Create CONNECTED_VIA_MUTUAL relationships for each FourBridge member
          for (const fourBridgeMember of mutual.viaFourBridgeMembers) {
            try {
              // Find FourBridge member node
              const fourBridgeMemberNode = await this.neo4j.findNodeByProperty('Person', 'name', fourBridgeMember);
              
              if (!fourBridgeMemberNode) {
                if (debug) {
                  console.log(`[GraphConstructor] FourBridge member not found: ${fourBridgeMember}`);
                }
                continue;
              }

              // Create CONNECTED_VIA_MUTUAL relationship
              await this.neo4j.createOrUpdateRelationship({
                fromNode: fourBridgeMemberNode.identity.toString(),
                toNode: mutualNode.identity.toString(),
                type: 'CONNECTED_VIA_MUTUAL',
                properties: {
                  source: 'LinkedIn',
                  type: 'mutual_connection',
                  via: fourBridgeMember,
                  weight: 0.8,
                  mutualCount: mutual.mutualCount,
                  createdAt: new Date().toISOString()
                }
              });

              // Create CONNECTED_VIA_MUTUAL relationship from mutual to target
              // First, we need to find the target node
              const targetNode = await this.findTargetNodeByLinkedInUrl(targetProfileUrl);
              
              if (targetNode) {
                await this.neo4j.createOrUpdateRelationship({
                  fromNode: mutualNode.identity.toString(),
                  toNode: targetNode.identity.toString(),
                  type: 'CONNECTED_VIA_MUTUAL',
                  properties: {
                    source: 'LinkedIn',
                    type: 'mutual_connection',
                    via: fourBridgeMember,
                    weight: 0.8,
                    mutualCount: mutual.mutualCount,
                    createdAt: new Date().toISOString()
                  }
                });
              }

              if (debug) {
                console.log(`[GraphConstructor] Created API mutual connection: ${fourBridgeMember} -> ${mutual.name} -> target`);
              }
            } catch (error) {
              console.error(`[GraphConstructor] Error creating API mutual connection for ${fourBridgeMember}:`, error);
            }
          }
        } catch (error) {
          console.error(`[GraphConstructor] Error processing API mutual connection ${mutual.name}:`, error);
        }
      }

      if (debug) {
        console.log(`[GraphConstructor] Successfully added API mutual connections to graph`);
      }
    } catch (error) {
      console.error('[GraphConstructor] Error adding API mutual connections to graph:', error);
      throw error;
    }
  }

  /**
   * Add Puppeteer mutual connections to the graph
   * Creates CONNECTED_VIA_MUTUAL relationships with source: 'puppeteer'
   */
  async addPuppeteerMutualConnectionsToGraph(
    targetProfileUrl: string,
    puppeteerMutuals: PuppeteerMutualConnection[],
    options: { debug?: boolean } = {}
  ): Promise<void> {
    const { debug = false } = options;

    try {
      if (debug) {
        console.log(`[GraphConstructor] Adding ${puppeteerMutuals.length} Puppeteer mutual connections to graph`);
      }

      for (const mutual of puppeteerMutuals) {
        try {
          // Create or update mutual connection node
          const mutualNode = await this.neo4j.createOrUpdateNode({
            labels: ['Person'],
            properties: {
              id: `puppeteer_${mutual.name.toLowerCase().replace(/\s+/g, '_')}`,
              name: mutual.name,
              headline: mutual.title || null,
              linkedinUrl: mutual.profileUrl || null,
              source: 'Puppeteer',
              type: 'Person',
              lastUpdated: new Date().toISOString()
            }
          });

          // Find FourBridge member node
          const fourBridgeMemberNode = await this.neo4j.findNodeByProperty('Person', 'name', mutual.discoveredBy);
          
          if (!fourBridgeMemberNode) {
            if (debug) {
              console.log(`[GraphConstructor] FourBridge member not found: ${mutual.discoveredBy}`);
            }
            continue;
          }

          // Create CONNECTED_VIA_MUTUAL relationship from FourBridge member to mutual
          await this.neo4j.createOrUpdateRelationship({
            fromNode: fourBridgeMemberNode.identity.toString(),
            toNode: mutualNode.identity.toString(),
            type: 'CONNECTED_VIA_MUTUAL',
            properties: {
              source: 'puppeteer',
              type: 'mutual_connection',
              via: mutual.discoveredBy,
              weight: 0.7, // Slightly lower weight for Puppeteer connections
              discoveredBy: mutual.discoveredBy,
              createdAt: new Date().toISOString()
            }
          });

          // Create CONNECTED_VIA_MUTUAL relationship from mutual to target
          const targetNode = await this.findTargetNodeByLinkedInUrl(targetProfileUrl);
          
          if (targetNode) {
            await this.neo4j.createOrUpdateRelationship({
              fromNode: mutualNode.identity.toString(),
              toNode: targetNode.identity.toString(),
              type: 'CONNECTED_VIA_MUTUAL',
              properties: {
                source: 'puppeteer',
                type: 'mutual_connection',
                via: mutual.discoveredBy,
                weight: 0.7,
                discoveredBy: mutual.discoveredBy,
                createdAt: new Date().toISOString()
              }
            });
          }

          if (debug) {
            console.log(`[GraphConstructor] Created Puppeteer mutual connection: ${mutual.discoveredBy} -> ${mutual.name} -> target`);
          }
        } catch (error) {
          console.error(`[GraphConstructor] Error processing Puppeteer mutual connection ${mutual.name}:`, error);
        }
      }

      if (debug) {
        console.log(`[GraphConstructor] Successfully added Puppeteer mutual connections to graph`);
      }
    } catch (error) {
      console.error('[GraphConstructor] Error adding Puppeteer mutual connections to graph:', error);
      throw error;
    }
  }

  /**
   * Find target node by LinkedIn URL
   */
  private async findTargetNodeByLinkedInUrl(linkedInUrl: string): Promise<Node | null> {
    try {
      const result = await this.session.run(
        'MATCH (n:Person) WHERE n.linkedin = $linkedInUrl OR n.linkedinUrl = $linkedInUrl RETURN n LIMIT 1',
        { linkedInUrl }
      );

      if (result.records.length > 0) {
        return result.records[0].get('n');
      }

      return null;
    } catch (error) {
      console.error('[GraphConstructor] Error finding target node:', error);
      return null;
    }
  }
}

// Export the constructGraph function
export const constructGraph = async (
  contacts: LPContact[],
  jobHistories: JobHistoryResponse[],
  options: GraphConstructionOptions = {}
): Promise<{ graph: any; connections?: Connection[] }> => {
  const graphConstructor = new GraphConstructor();
  return await graphConstructor.constructGraph(contacts, jobHistories, options);
};