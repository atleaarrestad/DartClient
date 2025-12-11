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

export function getRankIcon(rank: Rank | undefined): string {
	const base = getAbsoluteBase();

	const url = (() => {
		switch (rank) {
		case Rank.Bronze1:
			return './icons/bronze_1.png';
		case Rank.Bronze2:
			return './icons/bronze_2.png';
		case Rank.Bronze3:
			return './icons/bronze_3.png';
		case Rank.Bronze:
			return './icons/bronze.png';

		case Rank.Silver1:
			return './icons/silver_1.png';
		case Rank.Silver2:
			return './icons/silver_2.png';
		case Rank.Silver3:
			return './icons/silver_3.png';
		case Rank.Silver:
			return './icons/silver.png';

		case Rank.Gold1:
			return './icons/gold_1.png';
		case Rank.Gold2:
			return './icons/gold_2.png';
		case Rank.Gold3:
			return './icons/gold_3.png';
		case Rank.Gold:
			return './icons/gold.png';

		case Rank.Platinum1:
			return './icons/platinum_1.png';
		case Rank.Platinum2:
			return './icons/platinum_2.png';
		case Rank.Platinum3:
			return './icons/platinum_3.png';
		case Rank.Platinum:
			return './icons/platinum.png';

		case Rank.Diamond1:
			return './icons/diamond_1.png';
		case Rank.Diamond2:
			return './icons/diamond_2.png';
		case Rank.Diamond3:
			return './icons/diamond_3.png';
		case Rank.Diamond:
			return './icons/diamond.png';

		case Rank.Wizard1:
			return './icons/wizard_1.png';
		case Rank.Wizard2:
			return './icons/wizard_2.png';
		case Rank.Wizard3:
			return './icons/wizard_3.png';
		case Rank.Wizard:
			return './icons/wizard.png';

		case Rank.Mythic1:
			return './icons/mythic_1.png';
		case Rank.Mythic2:
			return './icons/mythic_2.png';
		case Rank.Mythic3:
			return './icons/mythic_3.png';
		case Rank.Mythic:
			return './icons/mythic.png';

		case Rank.Grandmaster:
			return './icons/grandmaster.png';

		default:
			return './icons/rank_unranked.png';
		}
	})();

	return `${ base }${ url }`;
}
