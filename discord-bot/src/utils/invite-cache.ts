import { Collection, Invite } from "discord.js";

export const inviteCache = new Map<string, Collection<string, Invite>>();
