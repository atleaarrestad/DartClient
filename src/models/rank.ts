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
	Wizard = 20,
	Wizard1 = 21,
	Wizard2 = 22,
	Wizard3 = 23,
	Mythic = 24,
	Mythic1 = 25,
	Mythic2 = 26,
	Mythic3 = 27,
	Grandmaster = 28,
}

export const RankDisplayValues: Record<Rank, string> = {
	[Rank.Bronze]:      'Bronze',
	[Rank.Bronze1]:     'Bronze I',
	[Rank.Bronze2]:     'Bronze II',
	[Rank.Bronze3]:     'Bronze III',
	[Rank.Silver]:      'Silver',
	[Rank.Silver1]:     'Silver I',
	[Rank.Silver2]:     'Silver II',
	[Rank.Silver3]:     'Silver III',
	[Rank.Gold]:        'Gold',
	[Rank.Gold1]:       'Gold I',
	[Rank.Gold2]:       'Gold II',
	[Rank.Gold3]:       'Gold III',
	[Rank.Platinum]:    'Platinum',
	[Rank.Platinum1]:   'Platinum I',
	[Rank.Platinum2]:   'Platinum II',
	[Rank.Platinum3]:   'Platinum III',
	[Rank.Diamond]:     'Diamond',
	[Rank.Diamond1]:    'Diamond I',
	[Rank.Diamond2]:    'Diamond II',
	[Rank.Diamond3]:    'Diamond III',
	[Rank.Wizard]:      'Wizard',
	[Rank.Wizard1]:     'Wizard I',
	[Rank.Wizard2]:     'Wizard II',
	[Rank.Wizard3]:     'Wizard III',
	[Rank.Mythic]:      'Mythic',
	[Rank.Mythic1]:     'Mythic I',
	[Rank.Mythic2]:     'Mythic II',
	[Rank.Mythic3]:     'Mythic III',
	[Rank.Grandmaster]: 'Grandmaster',
};

export function getRankDisplayValue(rank: Rank | undefined): string {
	if (rank == undefined)
		return 'Unranked';

	return RankDisplayValues[rank];
}

const rankIconFiles: Record<Rank, string> = {
	[Rank.Bronze]:      'bronze.png',
	[Rank.Bronze1]:     'bronze_1.png',
	[Rank.Bronze2]:     'bronze_2.png',
	[Rank.Bronze3]:     'bronze_3.png',
	[Rank.Silver]:      'silver.png',
	[Rank.Silver1]:     'silver_1.png',
	[Rank.Silver2]:     'silver_2.png',
	[Rank.Silver3]:     'silver_3.png',
	[Rank.Gold]:        'gold.png',
	[Rank.Gold1]:       'gold_1.png',
	[Rank.Gold2]:       'gold_2.png',
	[Rank.Gold3]:       'gold_3.png',
	[Rank.Platinum]:    'platinum.png',
	[Rank.Platinum1]:   'platinum_1.png',
	[Rank.Platinum2]:   'platinum_2.png',
	[Rank.Platinum3]:   'platinum_3.png',
	[Rank.Diamond]:     'diamond.png',
	[Rank.Diamond1]:    'diamond_1.png',
	[Rank.Diamond2]:    'diamond_2.png',
	[Rank.Diamond3]:    'diamond_3.png',
	[Rank.Wizard]:      'wizard.png',
	[Rank.Wizard1]:     'wizard_1.png',
	[Rank.Wizard2]:     'wizard_2.png',
	[Rank.Wizard3]:     'wizard_3.png',
	[Rank.Mythic]:      'mythic.png',
	[Rank.Mythic1]:     'mythic_1.png',
	[Rank.Mythic2]:     'mythic_2.png',
	[Rank.Mythic3]:     'mythic_3.png',
	[Rank.Grandmaster]: 'grandmaster.png',
};

export function getRankIcon(rank: Rank | undefined): string {
	const file = rank === undefined ? undefined : rankIconFiles[rank];

	return `${ getAbsoluteBase() }icons/${ file ?? 'rank_unranked.png' }`;
}
