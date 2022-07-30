import { stripIndents } from 'common-tags';
import { CommandInteraction, GuildMember, APIEmbed } from 'discord.js';
import { approveEmoji, Colors, disapproveEmoji, godfatherRoleId } from '../constants';
import { isGodfather, paginate } from '../utils';
import prisma from '../../prisma';
import chunk from 'lodash/chunk';
import partition from 'lodash/partition';
import { Proposal, ProposalType, Vote, VoteType, Approval, Disapproval } from '@prisma/client';

interface MemberProposal extends Proposal {
  votes: Vote[];
  _count: {
    approvals: number;
    disapprovals: number;
  };
}

const reaction = {
  up: `<:vote_up:1000313060860383365>`,
  down: `<:vote_down:1000721148444672072>`
};

type GodfathersDecisions = (Approval | Disapproval)[][];

export default class Stats {
  static async userStats(interaction: CommandInteraction<'cached'>, member: GuildMember, ephemeral: boolean) {
    const [proposals, votes] = await Promise.all([
      prisma.proposal.findMany({
        where: {
          user_id: member.id,
          stale: false
        }
      }),
      prisma.vote.findMany({
        where: {
          user_id: member.id
        },
        include: {
          proposal: true
        }
      })
    ]);

    const [suggestions, corrections] = partition(proposals, (proposal) => proposal.type === ProposalType.SUGGESTION);
    const [suggest_votes, corrections_votes] = partition(
      votes,
      (vote) => vote.proposal.type === ProposalType.SUGGESTION
    );

    const fields = [
      {
        name: 'Suggestions :',
        value: stripIndents`
          Proposées: **${suggestions.length}**
          En attente: **${suggestions.filter((s) => !s.refused && !s.merged).length}**
          Acceptées: **${suggestions.filter((s) => s.merged).length}**
          Votes: **${reaction.up} ${suggest_votes.filter((v) => v.type === VoteType.UP).length} ${reaction.down} ${
          suggest_votes.filter((v) => v.type === VoteType.DOWN).length
        }**
        `,
        inline: true
      },
      {
        name: 'Corrections :',
        value: stripIndents`
          Proposées: **${corrections.length}**
          En attente: **${corrections.filter((s) => !s.refused && !s.merged).length}**
          Acceptées: **${corrections.filter((s) => s.merged).length}**
          Votes: **${reaction.up} ${corrections_votes.filter((v) => v.type === VoteType.UP).length} ${reaction.down} ${
          suggest_votes.filter((v) => v.type === VoteType.DOWN).length
        }**
        `,
        inline: true
      }
    ];

    if (member.roles.cache.has(godfatherRoleId)) {
      const [approvals, disapprovals] = await Promise.all([
        prisma.approval.findMany({
          where: { user_id: member.id },
          include: { proposal: { select: { type: true } } }
        }),
        prisma.disapproval.findMany({
          where: { user_id: member.id },
          include: { proposal: { select: { type: true } } }
        })
      ]);

      const [suggestions, corrections] = partition(
        [...approvals, ...disapprovals],
        (approval) => approval.proposal.type === ProposalType.SUGGESTION
      );

      const totalDecisions = approvals.length + disapprovals.length;
      const approvalsRatio = (approvals.length / totalDecisions) * 100;
      const disapprovalsRatio = (disapprovals.length / totalDecisions) * 100;

      fields.push({
        name: 'Décisions de Parrain :',
        value: stripIndents`
          Décisions totales: **${totalDecisions}**
          Suggestions: **${suggestions.length}**
          Corrections: **${corrections.length}**
          Ratio: **${
            approvalsRatio >= disapprovalsRatio
              ? `${approveEmoji} ${approvalsRatio}%`
              : `${disapproveEmoji} ${disapprovalsRatio}%`
          }**
        `,
        inline: false
      });
    }

    return interaction.reply({
      embeds: [
        {
          author: {
            icon_url: member.displayAvatarURL({ size: 32 }),
            name: `Statistiques de ${member.displayName}`
          },
          fields,
          color: Colors.PRIMARY,
          footer: {
            text: 'Blagues API',
            icon_url: interaction.guild.iconURL({ size: 32 }) ?? undefined
          }
        }
      ],
      ephemeral: ephemeral
    });
  }

  static async globalStats(interaction: CommandInteraction<'cached'>) {
    const proposals = await prisma.proposal.findMany({
      include: {
        _count: {
          select: {
            approvals: true,
            disapprovals: true
          }
        },
        votes: true
      }
    });

    const membersProposals = proposals.filter(
      (proposal) => proposal.user_id && interaction.guild.members.cache.has(proposal.user_id)
    );
    const membersVotes = proposals.reduce<Vote[]>((votes, proposal) => (votes.push(...proposal.votes), votes), []);
    const godfathersDecisions = await Promise.all([prisma.approval.findMany(), prisma.disapproval.findMany()]);

    const membersIds = [...new Set(membersProposals.map((mP) => mP.user_id!))];

    const membersPoints = membersIds
      .map((userId) => {
        const member = interaction.guild.members.cache.get(userId)!;

        const memberProposals = membersProposals.filter((p) => p.user_id === userId);
        const memberVotes = membersVotes.filter((v) => v.user_id === userId);

        const points = this.calculatePoints(member, memberProposals, memberVotes, godfathersDecisions);

        return { userId, points };
      })
      .sort((a, b) => b.points - a.points)
      .map((entry) => `<@${entry.userId}> : ${entry.points} ${entry.points !== 1 ? 'points' : 'point'}`);

    const pages = chunk(membersPoints, 20).map((entries) => entries.join('\n'));

    const embed: APIEmbed = {
      title: 'Statistiques',
      description: pages[0] || "Il n'y a aucune statistiques.",
      color: Colors.PRIMARY,
      footer: {
        text: pages.length > 1 ? `Page 1/${pages.length} • Blagues-API` : 'Blagues-API',
        icon_url: interaction.guild.iconURL({ size: 32 }) ?? undefined
      }
    };

    return paginate(interaction, embed, pages);
  }

  static calculatePoints(
    member: GuildMember,
    proposals: MemberProposal[],
    votes: Vote[],
    decisions: GodfathersDecisions
  ) {
    let userPoints = 0;

    for (const proposal of proposals) {
      if (proposal.refused) userPoints += 3;
      if (proposal.stale) userPoints += 5;
      if (proposal.merged) {
        userPoints += proposal.type === ProposalType.SUGGESTION ? 10 : 7;

        userPoints += proposal._count.approvals * 2;
        userPoints += proposal._count.disapprovals * -2;

        const [vote_up, vote_down] = partition(proposal.votes, (vote) => vote.type === VoteType.UP);
        userPoints += vote_up.length * 1;
        userPoints += vote_down.length * -1;
      }
    }

    if (isGodfather(member)) {
      const approvals = decisions[0].filter((approval) => approval.user_id === member.id);
      const disapprovals = decisions[1].filter((disapproval) => disapproval.user_id === member.id);

      userPoints += approvals.length * 4;
      userPoints += disapprovals.length * 4;
    }

    userPoints += votes.length * 2;

    return userPoints;
  }
}
