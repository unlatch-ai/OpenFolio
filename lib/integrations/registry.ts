import type { IntegrationConnector } from "./types";
import { csvConnector } from "./connectors/csv";
import { gmailConnector } from "./connectors/gmail";
import { googleCalendarConnector } from "./connectors/google-calendar";
import { googleContactsConnector } from "./connectors/google-contacts";

const connectors = new Map<string, IntegrationConnector>();

export function registerConnector(connector: IntegrationConnector) {
  connectors.set(connector.id, connector);
}

export function getConnector(id: string): IntegrationConnector | undefined {
  return connectors.get(id);
}

export function listConnectors(): IntegrationConnector[] {
  return Array.from(connectors.values());
}

// Register built-in connectors
registerConnector(csvConnector);
registerConnector(gmailConnector);
registerConnector(googleCalendarConnector);
registerConnector(googleContactsConnector);
