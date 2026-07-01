import {
  TextChannel,
  Collection,
  Message,
  Snowflake,
} from "discord.js";
import { Ticket } from "../types/index";

export async function fetchAllMessages(channel: TextChannel): Promise<Message[]> {
  const all: Message[] = [];
  let before: Snowflake | undefined;

  for (let page = 0; page < 10; page++) {
    const batch: Collection<string, Message> = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
    });
    if (batch.size === 0) break;
    all.push(...batch.values());
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }

  return all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

export async function buildTranscript(
  channel: TextChannel,
  ticket: Ticket & { ticket_type?: string }
): Promise<Buffer> {
  const messages = await fetchAllMessages(channel);

  const typeLabel =
    ticket.ticket_type === "purchase"
      ? "Purchase Ticket"
      : ticket.ticket_type === "sell"
      ? "Sell Ticket"
      : "Support Ticket";

  const lines: string[] = [
    "========================================",
    "           VALERIE HELPER BOT           ",
    "            TICKET TRANSCRIPT           ",
    "========================================",
    `Ticket ID   : #${ticket.id}`,
    `Type        : ${typeLabel}`,
    `Subject     : ${ticket.subject ?? "N/A"}`,
    `Opened by   : User ID ${ticket.user_id}`,
    `Claimed by  : ${ticket.claimed_by ? `User ID ${ticket.claimed_by}` : "Unclaimed"}`,
    `Status      : ${ticket.status}`,
    `Created     : ${ticket.created_at.toUTCString()}`,
    `Closed      : ${ticket.closed_at?.toUTCString() ?? "Still open"}`,
    `Messages    : ${messages.length}`,
    "========================================",
    "",
    "--- MESSAGE LOG ---",
    "",
  ];

  for (const msg of messages) {
    const time = msg.createdAt.toISOString().replace("T", " ").split(".")[0];
    const author = `${msg.author.username}#${msg.author.discriminator}`;
    const isBot = msg.author.bot ? " [BOT]" : "";
    let content = msg.content || "";

    if (msg.embeds.length > 0 && !content) {
      content = `[${msg.embeds.length} embed(s)]`;
    }
    if (msg.attachments.size > 0) {
      const urls = [...msg.attachments.values()].map((a) => a.url).join(", ");
      content += content ? `\n  [Attachments: ${urls}]` : `[Attachments: ${urls}]`;
    }
    if (!content) content = "[No text content]";

    lines.push(`[${time} UTC] ${author}${isBot}: ${content}`);
  }

  lines.push("");
  lines.push("========================================");
  lines.push(`  Generated: ${new Date().toUTCString()}`);
  lines.push("========================================");

  return Buffer.from(lines.join("\n"), "utf-8");
}
