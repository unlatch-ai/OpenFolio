import type { ContactsAccessStatus } from "@openfolio/shared-types";

const CONTACTS_SETTINGS_PATH = "System Settings > Privacy & Security > Contacts";

export function withContactsAccessGuidance(status: ContactsAccessStatus): ContactsAccessStatus {
  if (status.status !== "denied" || status.details.includes(CONTACTS_SETTINGS_PATH)) {
    return status;
  }

  return {
    ...status,
    details: `${status.details} Open ${CONTACTS_SETTINGS_PATH} and enable OpenFolio, then retry the sync.`,
  };
}
