import { Client, Events, Guild } from "discord.js";
import { inviteCache } from "../utils/invite-cache";
import { registerMessageCreate } from "../events/messageCreate";
import { registerGuildMemberAdd } from "../events/guildMemberAdd";
import { registerGuildMemberRemove } from "../events/guildMemberRemove";
import { registerShopInteraction } from "./shopInteraction";
import { registerTicketButtons } from "./ticketButtons";
import { registerAutoMod } from "../events/automod";
import { logger } from "../utils/logger";

async function populateInviteCache(guild: Guild): Promise<void> {
  try {
    const invites = await guild.invites.fetch();
    inviteCache.set(guild.id, invites);
  } catch {
    logger.debug("Events", `No invite permission in guild ${guild.id}`);
  }
}

export function registerAllEvents(client: Client): void {
  registerMessageCreate(client);
  registerGuildMemberAdd(client);
  registerGuildMemberRemove(client);
  registerShopInteraction(client);
  registerTicketButtons(client);
  registerAutoMod(client);

  client.on(Events.GuildCreate, async (guild: Guild) => {
    await populateInviteCache(guild);
  });

  client.on(Events.InviteCreate, async (invite) => {
    if (!invite.guild) return;
    const cached = inviteCache.get(invite.guild.id);
    if (cached && invite.code) {
      cached.set(invite.code, invite as never);
    }
  });

  client.on(Events.InviteDelete, (invite) => {
    if (!invite.guild) return;
    const cached = inviteCache.get(invite.guild.id);
    if (cached && invite.code) {
      cached.delete(invite.code);
    }
  });

  logger.info("Events", "All event handlers registered.");
}

export { populateInviteCache };
