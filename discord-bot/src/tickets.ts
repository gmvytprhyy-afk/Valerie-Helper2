import { query, queryOne } from "./database";
import { Ticket, TicketMessage } from "./types/index";

export async function createTicket(
  guildId: string,
  channelId: string,
  userId: string,
  subject?: string
): Promise<Ticket> {
  const ticket = await queryOne<Ticket>(
    `INSERT INTO tickets (guild_id, channel_id, user_id, subject)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [guildId, channelId, userId, subject ?? null]
  );
  return ticket!;
}

export async function getTicketByChannel(channelId: string): Promise<Ticket | null> {
  return queryOne<Ticket>(
    `SELECT * FROM tickets WHERE channel_id = $1`,
    [channelId]
  );
}

export async function getTicketById(id: number): Promise<Ticket | null> {
  return queryOne<Ticket>(
    `SELECT * FROM tickets WHERE id = $1`,
    [id]
  );
}

export async function getUserTickets(
  userId: string,
  guildId: string
): Promise<Ticket[]> {
  return query<Ticket>(
    `SELECT * FROM tickets
     WHERE user_id = $1 AND guild_id = $2
     ORDER BY created_at DESC`,
    [userId, guildId]
  );
}

export async function getOpenTickets(guildId: string): Promise<Ticket[]> {
  return query<Ticket>(
    `SELECT * FROM tickets
     WHERE guild_id = $1 AND status = 'open'
     ORDER BY created_at ASC`,
    [guildId]
  );
}

export async function closeTicket(channelId: string): Promise<Ticket | null> {
  return queryOne<Ticket>(
    `UPDATE tickets
     SET status = 'closed', closed_at = NOW()
     WHERE channel_id = $1
     RETURNING *`,
    [channelId]
  );
}

export async function claimTicket(
  channelId: string,
  moderatorId: string
): Promise<Ticket | null> {
  return queryOne<Ticket>(
    `UPDATE tickets
     SET status = 'claimed', claimed_by = $2
     WHERE channel_id = $1
     RETURNING *`,
    [channelId, moderatorId]
  );
}

export async function logTicketMessage(
  ticketId: number,
  userId: string,
  content: string
): Promise<TicketMessage> {
  const msg = await queryOne<TicketMessage>(
    `INSERT INTO ticket_messages (ticket_id, user_id, content)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [ticketId, userId, content]
  );
  return msg!;
}

export async function getTicketMessages(ticketId: number): Promise<TicketMessage[]> {
  return query<TicketMessage>(
    `SELECT * FROM ticket_messages
     WHERE ticket_id = $1
     ORDER BY created_at ASC`,
    [ticketId]
  );
}
