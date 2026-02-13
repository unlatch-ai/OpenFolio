export const APP_PEOPLE_BASE_PATH = "/app/people";
export const APP_COMPANIES_BASE_PATH = "/app/companies";
export const APP_INTERACTIONS_BASE_PATH = "/app/interactions";

export function getAppPersonPath(personId: string) {
  return `${APP_PEOPLE_BASE_PATH}/${personId}`;
}

export function getAppCompanyPath(companyId: string) {
  return `${APP_COMPANIES_BASE_PATH}/${companyId}`;
}

export function getAppInteractionPath(interactionId: string) {
  return `${APP_INTERACTIONS_BASE_PATH}/${interactionId}`;
}
