import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ChatInputCommandInteraction,
  InteractionResponse
} from 'discord.js';
import Command from '../lib/command';
import { CategoriesRefsFull, Category } from '../../typings';
import { commandsChannelId } from '../constants';
import { interactionInfo, interactionValidate, isGodfather } from '../utils';
import prisma from '../../prisma';

export default class IgnoreCommand extends Command {
  public constructor() {
    super({
      name: 'ignore',
      description: "Permet d'ignorer un type de blagues.",
      type: ApplicationCommandType.ChatInput,
      options: [
        {
          type: ApplicationCommandOptionType.String,
          name: 'category',
          description: Object.values(CategoriesRefsFull).join(', '),
          required: true,
          choices: Object.entries(CategoriesRefsFull).map(([key, name]) => ({
            name,
            value: key
          }))
        }
      ]
    });
  }

  public async run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void | InteractionResponse> {
    // TODO: Refactor le bloc de code pour check le salon commande dans une fonction
    if (interaction.channelId !== commandsChannelId) {
      return interaction.reply(
        interactionInfo(`Préférez utiliser cette commande dans le salon <#${commandsChannelId}>.`)
      );
    }

    if (!isGodfather(interaction.member)) {
      return interaction.reply(interactionInfo('Seul les parrains peuvent utiliser cette commande.'));
    }

    const godfather = await prisma.godfather.findUnique({
      where: {
        user_id: interaction.user.id
      },
      select: {
        id: true,
        ignored_categories: true
      }
    });

    if (!godfather) {
      return interaction.reply(
        interactionInfo('Veuillez approuver plusieurs blagues avant de faire la fine bouche ! 😜')
      );
    }

    const category = interaction.options.getString('category', true) as Category;
    const isAlreadyIgnored = godfather.ignored_categories.includes(category);

    const ignoredCategories = isAlreadyIgnored
      ? godfather.ignored_categories.filter((ignoredCategory) => ignoredCategory !== category)
      : [...godfather.ignored_categories, category];

    prisma.godfather.update({
      where: {
        id: godfather.id
      },
      data: {
        ignored_categories: ignoredCategories
      }
    });

    return interaction.reply(
      interactionValidate(
        `Vous avez ${isAlreadyIgnored ? 'désignoré' : 'ignoré'} la catégorie \`${
          CategoriesRefsFull[category]
        }\` avec succès!`
      )
    );
  }
}
