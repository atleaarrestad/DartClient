import { getAbsoluteBase } from '../getAbsoluteBase.js';

export enum Rank {
	Bronze = 0,
	Bronze1 = 1,
	Bronze2 = 2,
	Bronze3 = 3,
	Silver = 4,
	Silver1 = 5,
	Silver2 = 6,
	Silver3 = 7,
	Gold = 8,
	Gold1 = 9,
	Gold2 = 10,
	Gold3 = 11,
	Platinum = 12,
	Platinum1 = 13,
	Platinum2 = 14,
	Platinum3 = 15,
	Diamond = 16,
	Diamond1 = 17,
	Diamond2 = 18,
	Diamond3 = 19,
	Master = 20,
	Master1 = 21,
	Master2 = 22,
	Master3 = 23,
	Wizard = 24,
	Wizard1 = 25,
	Wizard2 = 26,
	Wizard3 = 27,
	Mythic = 28,
	Mythic1 = 29,
	Mythic2 = 30,
	Mythic3 = 31,
	GlennMaster = 32,
	GlennMaster1 = 33,
	GlennMaster2 = 34,
	GlennMaster3 = 35,
	Grandmaster = 36,
}

export const RankDisplayValues: Record<Rank, string> = {
	[Rank.Bronze]:       'Bronze',
	[Rank.Bronze1]:      'Bronze I',
	[Rank.Bronze2]:      'Bronze II',
	[Rank.Bronze3]:      'Bronze III',
	[Rank.Silver]:       'Silver',
	[Rank.Silver1]:      'Silver I',
	[Rank.Silver2]:      'Silver II',
	[Rank.Silver3]:      'Silver III',
	[Rank.Gold]:         'Gold',
	[Rank.Gold1]:        'Gold I',
	[Rank.Gold2]:        'Gold II',
	[Rank.Gold3]:        'Gold III',
	[Rank.Platinum]:     'Platinum',
	[Rank.Platinum1]:    'Platinum I',
	[Rank.Platinum2]:    'Platinum II',
	[Rank.Platinum3]:    'Platinum III',
	[Rank.Diamond]:      'Diamond',
	[Rank.Diamond1]:     'Diamond I',
	[Rank.Diamond2]:     'Diamond II',
	[Rank.Diamond3]:     'Diamond III',
	[Rank.Master]:       'Master',
	[Rank.Master1]:      'Master I',
	[Rank.Master2]:      'Master II',
	[Rank.Master3]:      'Master III',
	[Rank.Wizard]:       'Wizard',
	[Rank.Wizard1]:      'Wizard I',
	[Rank.Wizard2]:      'Wizard II',
	[Rank.Wizard3]:      'Wizard III',
	[Rank.Mythic]:       'Mythic',
	[Rank.Mythic1]:      'Mythic I',
	[Rank.Mythic2]:      'Mythic II',
	[Rank.Mythic3]:      'Mythic III',
	[Rank.GlennMaster]:  'Glenn Master',
	[Rank.GlennMaster1]: 'Glenn Master I',
	[Rank.GlennMaster2]: 'Glenn Master II',
	[Rank.GlennMaster3]: 'Glenn Master III',
	[Rank.Grandmaster]:  'Grandmaster',
};

export function getRankDisplayValue(rank: Rank | undefined): string {
	if (rank == undefined)
		return 'Unranked';

	return RankDisplayValues[rank];
}

const rankIconFiles: Record<Rank, string> = {
	[Rank.Bronze]:       'bronze.png',
	[Rank.Bronze1]:      'bronze_1.png',
	[Rank.Bronze2]:      'bronze_2.png',
	[Rank.Bronze3]:      'bronze_3.png',
	[Rank.Silver]:       'silver.png',
	[Rank.Silver1]:      'silver_1.png',
	[Rank.Silver2]:      'silver_2.png',
	[Rank.Silver3]:      'silver_3.png',
	[Rank.Gold]:         'gold.png',
	[Rank.Gold1]:        'gold_1.png',
	[Rank.Gold2]:        'gold_2.png',
	[Rank.Gold3]:        'gold_3.png',
	[Rank.Platinum]:     'platinum.png',
	[Rank.Platinum1]:    'platinum_1.png',
	[Rank.Platinum2]:    'platinum_2.png',
	[Rank.Platinum3]:    'platinum_3.png',
	[Rank.Diamond]:      'diamond.png',
	[Rank.Diamond1]:     'diamond_1.png',
	[Rank.Diamond2]:     'diamond_2.png',
	[Rank.Diamond3]:     'diamond_3.png',
	[Rank.Master]:       'master.png',
	[Rank.Master1]:      'master_1.png',
	[Rank.Master2]:      'master_2.png',
	[Rank.Master3]:      'master_3.png',
	[Rank.Wizard]:       'wizard.png',
	[Rank.Wizard1]:      'wizard_1.png',
	[Rank.Wizard2]:      'wizard_2.png',
	[Rank.Wizard3]:      'wizard_3.png',
	[Rank.Mythic]:       'mythic.png',
	[Rank.Mythic1]:      'mythic_1.png',
	[Rank.Mythic2]:      'mythic_2.png',
	[Rank.Mythic3]:      'mythic_3.png',
	[Rank.GlennMaster]:  'glenn_master.png',
	[Rank.GlennMaster1]: 'glenn_master_1.png',
	[Rank.GlennMaster2]: 'glenn_master_2.png',
	[Rank.GlennMaster3]: 'glenn_master_3.png',
	[Rank.Grandmaster]:  'grandmaster.png',
};

export function getRankIcon(rank: Rank | undefined): string {
	const file = rank === undefined ? undefined : rankIconFiles[rank];

	return `${ getAbsoluteBase() }icons/${ file ?? 'rank_unranked.png' }`;
}

/** Ranks come in tiers of four (Diamond, Diamond I–III); Grandmaster is a tier of its own. */
export const ranksPerTier = 4;

/** The first rank of a rank's tier: Diamond for Diamond II. */
export const getRankTier = (rank: Rank): Rank => (rank - rank % ranksPerTier) as Rank;
