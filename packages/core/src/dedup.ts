import type { Person } from "@openfolio/shared-types";

export interface DuplicateCandidate {
  left: Person;
  right: Person;
  confidence: number;
  reason: string;
}

function reasonPriority(reason: string) {
  if (reason.startsWith("Same handle:")) {
    return 2;
  }
  if (reason.startsWith("Similar names:")) {
    return 1;
  }
  return 0;
}

export function levenshtein(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const table = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    table[row][0] = row;
  }
  for (let col = 0; col < cols; col += 1) {
    table[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      table[row][col] = left[row - 1] === right[col - 1]
        ? table[row - 1][col - 1]
        : 1 + Math.min(table[row - 1][col], table[row][col - 1], table[row - 1][col - 1]);
    }
  }

  return table[rows - 1][cols - 1];
}

export function nameSimilarity(left: string, right: string) {
  const normalizedLeft = left.trim().toLowerCase();
  const normalizedRight = right.trim().toLowerCase();

  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }
  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  const maxLength = Math.max(normalizedLeft.length, normalizedRight.length);
  return 1 - levenshtein(normalizedLeft, normalizedRight) / maxLength;
}

export function findDuplicatePeople(people: Person[]): DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = [];

  for (let index = 0; index < people.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < people.length; compareIndex += 1) {
      const left = people[index];
      const right = people[compareIndex];

      if (left.primaryHandle && right.primaryHandle && left.primaryHandle === right.primaryHandle) {
        candidates.push({
          left,
          right,
          confidence: 1,
          reason: `Same handle: ${left.primaryHandle}`,
        });
        continue;
      }

      const similarity = nameSimilarity(left.displayName, right.displayName);
      if (similarity >= 0.88) {
        candidates.push({
          left,
          right,
          confidence: similarity,
          reason: `Similar names: ${left.displayName} ~ ${right.displayName}`,
        });
      }
    }
  }

  return candidates.sort((left, right) => {
    const confidenceDelta = right.confidence - left.confidence;
    if (confidenceDelta !== 0) {
      return confidenceDelta;
    }
    return reasonPriority(right.reason) - reasonPriority(left.reason);
  });
}
