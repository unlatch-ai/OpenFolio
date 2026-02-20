import type { IntegrationConnector } from "./types";
import { csvConnector } from "./connectors/csv";
import { gmailConnector } from "./connectors/gmail";
import { googleCalendarConnector } from "./connectors/google-calendar";
import { googleContactsConnector } from "./connectors/google-contacts";
import { microsoftMailConnector } from "./connectors/microsoft-mail";
import { microsoftCalendarConnector } from "./connectors/microsoft-calendar";
import { microsoftContactsConnector } from "./connectors/microsoft-contacts";

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
registerConnector(microsoftMailConnector);
registerConnector(microsoftCalendarConnector);
registerConnector(microsoftContactsConnector);
