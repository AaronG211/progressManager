export type MentionWorkspaceMember = {
  userId: string;
  email: string;
  name: string | null;
};

function normalizeAlias(value: string): string {
  return value.trim().toLowerCase();
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.,!?;:)}\]\"]+$/g, "");
}

function toNameAliases(name: string): string[] {
  const trimmed = name.trim().toLowerCase();

  if (!trimmed) {
    return [];
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);

  return [...new Set([trimmed, trimmed.replace(/\s+/g, ""), ...parts])];
}

export function extractMentionTokens(text: string): string[] {
  const matches = text.match(/@([^\s@][^\s]*)/g) ?? [];

  return [...new Set(matches.map((match) => stripTrailingPunctuation(match.slice(1))).filter(Boolean))];
}

export function resolveMentionedMemberIds(
  text: string,
  members: MentionWorkspaceMember[],
): string[] {
  const mentionTokens = extractMentionTokens(text).map((token) => normalizeAlias(token));

  if (mentionTokens.length === 0 || members.length === 0) {
    return [];
  }

  const aliasToUserId = new Map<string, string>();

  for (const member of members) {
    const normalizedEmail = normalizeAlias(member.email);
    const emailLocalPart = normalizedEmail.split("@")[0] || "";
    const aliases = new Set<string>([normalizedEmail, emailLocalPart]);

    if (member.name) {
      for (const alias of toNameAliases(member.name)) {
        aliases.add(alias);
      }
    }

    for (const alias of aliases) {
      if (!alias) {
        continue;
      }

      if (!aliasToUserId.has(alias)) {
        aliasToUserId.set(alias, member.userId);
      }
    }
  }

  const recipientIds = new Set<string>();

  for (const token of mentionTokens) {
    const recipientId = aliasToUserId.get(token);

    if (recipientId) {
      recipientIds.add(recipientId);
    }
  }

  return [...recipientIds];
}
