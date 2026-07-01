import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  Client,
} from "discord.js";

export interface Command {
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;
  execute: (
    interaction: ChatInputCommandInteraction,
    client: Client
  ) => Promise<void>;
}

export interface GuildSettings {
  guild_id: string;
  prefix: string;
  log_channel: string | null;
  mod_channel: string | null;
  welcome_channel: string | null;
  welcome_message: string | null;
  leave_channel: string | null;
  leave_message: string | null;
  mute_role: string | null;
  ticket_category: string | null;
  ticket_log: string | null;
  automod_enabled: boolean;
  ping_roles: string[];
  sell_roles: string[];
  created_at: Date;
  updated_at: Date;
}

export interface Economy {
  user_id: string;
  guild_id: string;
  balance: bigint;
  bank: bigint;
  xp: bigint;
  level: number;
  daily_last: Date | null;
  work_last: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface MessageCount {
  user_id: string;
  guild_id: string;
  count: bigint;
  updated_at: Date;
}

export interface InviteTracking {
  invite_code: string;
  guild_id: string;
  inviter_id: string;
  uses: number;
  created_at: Date;
  updated_at: Date;
}

export interface ShopPanel {
  id: number;
  guild_id: string;
  name: string;
  description: string | null;
  channel_id: string | null;
  message_id: string | null;
  created_at: Date;
}

export interface ShopItem {
  id: number;
  panel_id: number;
  guild_id: string;
  name: string;
  description: string | null;
  price: bigint;
  role_id: string | null;
  quantity: number | null;
  created_at: Date;
}

export interface SellPanel {
  id: number;
  guild_id: string;
  name: string;
  description: string | null;
  looking_for: string | null;
  channel_id: string | null;
  message_id: string | null;
  created_at: Date;
}

export interface SellItem {
  id: number;
  panel_id: number;
  guild_id: string;
  name: string;
  description: string | null;
  price: bigint;
  created_at: Date;
}

export interface Ticket {
  id: number;
  guild_id: string;
  channel_id: string;
  user_id: string;
  subject: string | null;
  status: "open" | "closed" | "claimed";
  claimed_by: string | null;
  ticket_type: "purchase" | "sell" | "support";
  panel_id: number | null;
  created_at: Date;
  closed_at: Date | null;
}

export interface SupportPanel {
  id: number;
  guild_id: string;
  title: string;
  description: string | null;
  channel_id: string | null;
  message_id: string | null;
  created_at: Date;
}

export interface TicketMessage {
  id: number;
  ticket_id: number;
  user_id: string;
  content: string;
  created_at: Date;
}

export interface ModerationLog {
  id: number;
  guild_id: string;
  target_id: string;
  moderator_id: string;
  action: string;
  reason: string | null;
  duration: bigint | null;
  expires_at: Date | null;
  created_at: Date;
}

export interface Note {
  id: number;
  guild_id: string;
  target_id: string;
  moderator_id: string;
  content: string;
  created_at: Date;
}

export interface AutoModSettings {
  guild_id: string;
  anti_spam: boolean;
  anti_invite: boolean;
  anti_link: boolean;
  anti_caps: boolean;
  anti_mention_spam: boolean;
  max_mentions: number;
  caps_threshold: number;
  spam_threshold: number;
  spam_window_seconds: number;
  log_channel: string | null;
  exempt_roles: string[];
  exempt_channels: string[];
  updated_at: Date;
}
