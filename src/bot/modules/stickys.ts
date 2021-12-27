import { stripIndents } from 'common-tags';
import { Client, Snowflake, TextChannel, MessageOptions } from 'discord.js';
import { commandsChannel, correctionsChannel, suggestionsChannel } from '../constants';
import Jokes from '../../jokes';

export default class Stickys {
  public client: Client;

  constructor(client: Client) {
    this.client = client;

    setInterval(() => this.sticky(suggestionsChannel, this.suggestsMessage()), 10000);
    setInterval(() => this.sticky(correctionsChannel, this.correctionsMessage()), 10000);
  }

  suggestsMessage() {
    return {
      embeds: [
        {
          title: 'Bienvenue à toi ! 👋',
          description: stripIndents`
            Si tu le souhaites, tu peux proposer tes blagues afin qu'elles soient ajoutées à l'API Blagues-API, elle regroupe actuellement **${Jokes.count}** blagues françaises.
            Elles sont toutes issues de ce salon proposées par la communauté.

            > \`/suggestion\` dans le salon <#${commandsChannel}>
          `,
          fields: [
            {
              name: 'Règles:',
              value: stripIndents`
              > - Espace avant les caractères: \`?\` et \`!\`.
              > - Ponctuation de fin de phrase si elle contient un verbe.
              > - 130 caractères maximum par partie d'une blague.
              > - Majuscule en début de phrase à moins quelle ne soit précédée de \`...\`
            `
            }
          ],
          color: 0x0067ad
        }
      ]
    };
  }

  correctionsMessage() {
    return {
      embeds: [
        {
          title: 'Bienvenue à toi ! 👋',
          description: stripIndents`
            Si tu le souhaites, tu peux proposer des corrections aux blagues de l'API Blagues API qui regroupe actuellement **${Jokes.count}** blagues françaises.

            > \`/correction\` dans le salon <#${commandsChannel}>
          `,
          color: 0x0067ad
        }
      ]
    };
  }

  async sticky(targetChannel: Snowflake, messagePayload: MessageOptions) {
    const channel = this.client.channels.cache.get(targetChannel) as TextChannel;
    if (!channel) return;

    const messages = await channel.messages.fetch({ limit: 10 }).catch(() => null);
    if (!messages) return;

    const message = messages.find(
      (m) => m.author.id === this.client.user!.id && m.embeds?.[0]?.title === messagePayload.embeds?.[0]?.title
    );
    const last_message = messages.first();
    if (!message || !last_message || message.id !== last_message.id) {
      if (message) await message.delete();

      return channel.send(messagePayload);
    }
  }
}