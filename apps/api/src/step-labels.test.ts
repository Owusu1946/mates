import { describe, expect, it } from "vitest";
import { describeStep } from "./step-labels.js";

describe("step labels", () => {
  it("says what is being written in Notion", () => {
    expect(describeStep("NOTION_CREATE_NOTION_PAGE", { title: "Zanzibar Trip — 21–27 December 2026 (2 Travellers)" })).toBe("Creating “Zanzibar Trip — 21–27 December 2026…” in Notion");
    expect(describeStep("NOTION_ADD_PAGE_CONTENT", { content_block: { block_property: "heading_2", content: "Day 1: Stone Town" } })).toBe("Writing the heading “Day 1: Stone Town”");
    expect(describeStep("NOTION_ADD_PAGE_CONTENT", { content_block: { block_property: "to_do", content: "Passport" } })).toBe("Adding a checklist");
    expect(describeStep("NOTION_ADD_PAGE_CONTENT", { content_block: { block_property: "bulleted_list_item", content: "Sunscreen" } })).toBe("Adding a list");
    expect(describeStep("NOTION_ADD_PAGE_CONTENT", { content_block: { block_property: "paragraph", content: "Stone Town is…" } })).toBe("Writing a paragraph");
  });

  it("names the section when a batch of blocks has a heading", () => {
    const content_blocks = [
      { type: "heading_2", heading_2: { rich_text: [{ text: { content: "Budget" } }] } },
      { type: "paragraph", paragraph: { rich_text: [{ text: { content: "Mid-range." } }] } },
    ];
    expect(describeStep("NOTION_ADD_MULTIPLE_PAGE_CONTENT", { content_blocks })).toBe("Writing the “Budget” section");
  });

  it("includes who an email goes to and what an event is", () => {
    expect(describeStep("GMAIL_SEND_EMAIL", { recipient_email: "ama@example.com" })).toBe("Sending the email to ama@example.com");
    expect(describeStep("GMAIL_FETCH_EMAILS", { query: "from:airline" })).toBe("Searching your inbox for “from:airline”");
    expect(describeStep("GOOGLECALENDAR_CREATE_EVENT", { summary: "Flight to Zanzibar" })).toBe("Adding “Flight to Zanzibar” to your calendar");
    expect(describeStep("SLACK_SEND_MESSAGE", { channel: "launch" })).toBe("Posting in #launch");
  });

  it("reads any other tool as verb, object and app", () => {
    expect(describeStep("NOTION_CREATE_COMMENT")).toBe("Creating a comment in Notion");
    expect(describeStep("LINEAR_UPDATE_ISSUE")).toBe("Updating an issue in Linear");
    expect(describeStep("TRELLO_GET_BOARDS")).toBe("Reading boards in Trello");
    expect(describeStep("HUBSPOT_SEARCH_CONTACTS")).toBe("Searching contacts in HubSpot");
    expect(describeStep("SOMEAPP_DO_THING")).toBe("Working on do thing");
    expect(describeStep("COMPOSIO_MANAGE_CONNECTIONS")).toBe("Working with your apps");
    expect(describeStep("COMPOSIO_SEARCH_TOOLS")).toBe("Finding the right app");
  });

  it("falls back gracefully when arguments are missing or odd", () => {
    expect(describeStep("NOTION_CREATE_NOTION_PAGE", {})).toBe("Creating a page in Notion");
    expect(describeStep("NOTION_ADD_PAGE_CONTENT", { nothing: 1 })).toBe("Writing on the page");
    expect(describeStep("GMAIL_SEND_EMAIL", { recipient_email: 42 })).toBe("Sending the email");
  });
});
