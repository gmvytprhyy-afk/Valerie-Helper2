import {
  Client,
  Events,
  GuildMember,
  Collection,
  Invite,
  TextChannel,
  EmbedBuilder,
  ColorResolvable,
} from "discord.js";
import { inviteCache } from "../utils/invite-cache";
import { queryOne, query } from "../database";
import { addCrystals } from "../utils/crystals";
import { getOrCreateGuildSettings } from "../utility";
import { logger } from "../utils/logger";
import config from "../../config.json";

async function sendWelcomeMessage(member: GuildMember): Promise<void> {
  const settings = await getOrCreateGuildSettings(member.guild.id);
  if (!settings.welcome_channel || !settings.welcome_message) return;

  const channel = member.guild.channels.cache.get(settings.welcome_channel) as TextChannel | undefined;
  if (!channel) return;

  const text = settings.welcome_message
    .replace(/\{user\}/g, `<@${member.id}>`)
    .replace(/\{server\}/g, member.guild.name)
    .replace(/\{count\}/g, String(member.guild.memberCount));

  const embed = new EmbedBuilder()
    .setColor(config.color.success as ColorResolvable)
    .setTitle(`👋 Welcome to ${member.guild.name}!`)
    .setDescription(text)
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

async function handleInviteTracking(member: GuildMember): Promise<void> {
  const { guild } = member;
  const guildId = guild.id;
  const inviteeId = member.id;

  let currentInvites: Collection<string, Invite>;
  try {
    currentInvites = await guild.invites.fetch();
  } catch {
    logger.warn("GuildMemberAdd", `No permission to fetch invites in ${guildId}`);
    return;
  }

  const cached = inviteCache.get(guildId) ?? new Collection<string, Invite>();
  inviteCache.set(guildId, currentInvites);

  let usedCode: string | null = null;
  let inviterId: string | null = null;

  for (const [code, invite] of currentInvites) {
    const old = cached.get(code);
    const oldUses = old?.uses ?? 0;
    const newUses = invite.uses ?? 0;
    if (newUses > oldUses) {
      usedCode = code;
      inviterId = invite.inviterId ?? invite.inviter?.id ?? null;
      break;
    }
  }

  if (!usedCode || !inviterId) {
    logger.debug("GuildMemberAdd", `Could not determine invite for ${inviteeId}`);
    return;
  }

  const hasPreviousJoin = await queryOne<{ id: number }>(
    `SELECT id FROM invite_joins
     WHERE invitee_id = $1 AND guild_id = $2
     LIMIT 1`,
    [inviteeId, guildId]
  );

  const isFarming = hasPreviousJoin !== null;

  await query(
    `INSERT INTO invite_joins
       (guild_id, invitee_id, inviter_id, invite_code, crystal_awarded, is_farming)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [guildId, inviteeId, inviterId, usedCode, !isFarming, isFarming]
  );

  if (!isFarming) {
    await addCrystals(inviterId, guildId, 1n);
    logger.info("GuildMemberAdd", `Awarded 1 crystal to ${inviterId} for inviting ${inviteeId}`);
  } else {
    logger.info(
      "GuildMemberAdd",
      `Skipped crystal for ${inviterId} — ${inviteeId} rejoined (farming prevention)`
    );
  }
}

export function registerGuildMemberAdd(client: Client): void {
  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    // Welcome message and invite tracking are fully independent
    await Promise.allSettled([
      sendWelcomeMessage(member).catch((err) =>
        logger.error("GuildMemberAdd", "Failed to send welcome:", err)
      ),
      handleInviteTracking(member).catch((err) =>
        logger.error("GuildMemberAdd", "Invite tracking error:", err)
      ),
    ]);
  });
}
