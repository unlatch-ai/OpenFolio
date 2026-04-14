import Contacts
import Foundation

struct PermissionStatus: Codable {
  let status: String
  let details: String
  let canPrompt: Bool
}

struct ExportedContact: Codable {
  let identifier: String
  let displayName: String
  let givenName: String?
  let familyName: String?
  let organizationName: String?
  let jobTitle: String?
  let emails: [String]
  let phones: [String]
}

struct ExportPayload: Codable {
  let contacts: [ExportedContact]
}

struct ContactsBridge {
  static func authorizationString(_ status: CNAuthorizationStatus) -> String {
    switch status {
    case .authorized:
      return "granted"
    case .denied:
      return "denied"
    case .restricted:
      return "restricted"
    case .notDetermined:
      return "not-determined"
    @unknown default:
      return "restricted"
    }
  }

  static func currentPermissionStatus() -> PermissionStatus {
    let status = CNContactStore.authorizationStatus(for: .contacts)

    switch status {
    case .authorized:
      return PermissionStatus(
        status: authorizationString(status),
        details: "OpenFolio can read your Contacts database.",
        canPrompt: false
      )
    case .notDetermined:
      return PermissionStatus(
        status: authorizationString(status),
        details: "OpenFolio has not requested Contacts access yet.",
        canPrompt: true
      )
    case .denied:
      return PermissionStatus(
        status: authorizationString(status),
        details: "Contacts access was denied. Enable OpenFolio under System Settings > Privacy & Security > Contacts.",
        canPrompt: false
      )
    case .restricted:
      return PermissionStatus(
        status: authorizationString(status),
        details: "Contacts access is restricted by macOS and cannot be changed from OpenFolio.",
        canPrompt: false
      )
    @unknown default:
      return PermissionStatus(
        status: "restricted",
        details: "Contacts access is unavailable on this Mac.",
        canPrompt: false
      )
    }
  }

  static func requestPermission() throws -> PermissionStatus {
    if CNContactStore.authorizationStatus(for: .contacts) != .notDetermined {
      return currentPermissionStatus()
    }

    let store = CNContactStore()
    let semaphore = DispatchSemaphore(value: 0)
    var requestError: Error?

    store.requestAccess(for: .contacts) { _, error in
      requestError = error
      semaphore.signal()
    }

    semaphore.wait()

    if let requestError {
      throw requestError
    }

    return currentPermissionStatus()
  }

  static func exportContacts() throws -> [ExportedContact] {
    guard CNContactStore.authorizationStatus(for: .contacts) == .authorized else {
      throw NSError(
        domain: "OpenFolioContacts",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Contacts access is not granted."]
      )
    }

    let store = CNContactStore()
    let keys: [CNKeyDescriptor] = [
      CNContactIdentifierKey as CNKeyDescriptor,
      CNContactGivenNameKey as CNKeyDescriptor,
      CNContactFamilyNameKey as CNKeyDescriptor,
      CNContactOrganizationNameKey as CNKeyDescriptor,
      CNContactJobTitleKey as CNKeyDescriptor,
      CNContactEmailAddressesKey as CNKeyDescriptor,
      CNContactPhoneNumbersKey as CNKeyDescriptor,
      CNContactFormatter.descriptorForRequiredKeys(for: .fullName),
    ]

    let request = CNContactFetchRequest(keysToFetch: keys)
    var contacts: [ExportedContact] = []

    try store.enumerateContacts(with: request) { contact, _ in
      let displayName = CNContactFormatter.string(from: contact, style: .fullName)?
        .trimmingCharacters(in: .whitespacesAndNewlines)
      let emails = contact.emailAddresses
        .map { ($0.value as String).trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
      let phones = contact.phoneNumbers
        .map { $0.value.stringValue.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
      let fallbackName = displayName?.isEmpty == false ? displayName! : (
        contact.organizationName.isEmpty ? (emails.first ?? phones.first ?? "Unknown Contact") : contact.organizationName
      )

      if fallbackName.isEmpty && emails.isEmpty && phones.isEmpty {
        return
      }

      contacts.append(
        ExportedContact(
          identifier: contact.identifier,
          displayName: fallbackName,
          givenName: contact.givenName.isEmpty ? nil : contact.givenName,
          familyName: contact.familyName.isEmpty ? nil : contact.familyName,
          organizationName: contact.organizationName.isEmpty ? nil : contact.organizationName,
          jobTitle: contact.jobTitle.isEmpty ? nil : contact.jobTitle,
          emails: emails,
          phones: phones
        )
      )
    }

    return contacts
  }

  static func writeJSON<T: Encodable>(_ value: T) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.withoutEscapingSlashes]
    let data = try encoder.encode(value)
    FileHandle.standardOutput.write(data)
  }
}

let command = CommandLine.arguments.dropFirst().first ?? "status"

do {
  switch command {
  case "status":
    try ContactsBridge.writeJSON(ContactsBridge.currentPermissionStatus())
  case "request":
    try ContactsBridge.writeJSON(ContactsBridge.requestPermission())
  case "export":
    try ContactsBridge.writeJSON(ExportPayload(contacts: try ContactsBridge.exportContacts()))
  default:
    fputs("Unknown command: \(command)\n", stderr)
    exit(2)
  }
} catch {
  fputs("\(error.localizedDescription)\n", stderr)
  exit(1)
}
