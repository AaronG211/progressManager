import { describe, expect, it } from "vitest";
import { extractMentionTokens, resolveMentionedMemberIds } from "@/lib/stage2/mentions";

describe("stage2 mention parsing", () => {
  it("extracts unique mention tokens", () => {
    expect(extractMentionTokens("hi @alice, check with @bob and @alice")).toEqual([
      "alice",
      "bob",
    ]);
  });

  it("resolves mentions against email and name aliases", () => {
    const members = [
      {
        userId: "user_1",
        email: "alice@example.com",
        name: "Alice Chen",
      },
      {
        userId: "user_2",
        email: "bob@example.com",
        name: "Bob Li",
      },
    ];

    expect(resolveMentionedMemberIds("@alice @bob @AliceChen", members)).toEqual([
      "user_1",
      "user_2",
    ]);
    expect(resolveMentionedMemberIds("@bob@example.com @alice@example.com", members)).toEqual([
      "user_2",
      "user_1",
    ]);
  });
});
