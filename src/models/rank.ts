import { getAbsoluteBase } from '../getAbsoluteBase.js';
const base = getAbsoluteBase();
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
	Grandmaster = 20,
}

export const RankDisplayValues: Record<Rank, string> = {
	[Rank.Bronze]: "Bronze",
	[Rank.Bronze1]: "Bronze I",
	[Rank.Bronze2]: "Bronze II",
	[Rank.Bronze3]: "Bronze III",
	[Rank.Silver]: "Silver",
	[Rank.Silver1]: "Silver I",
	[Rank.Silver2]: "Silver II",
	[Rank.Silver3]: "Silver III",
	[Rank.Gold]: "Gold",
	[Rank.Gold1]: "Gold I",
	[Rank.Gold2]: "Gold II",
	[Rank.Gold3]: "Gold III",
	[Rank.Platinum]: "Platinum",
	[Rank.Platinum1]: "Platinum I",
	[Rank.Platinum2]: "Platinum II",
	[Rank.Platinum3]: "Platinum III",
	[Rank.Diamond]: "Diamond",
	[Rank.Diamond1]: "Diamond I",
	[Rank.Diamond2]: "Diamond II",
	[Rank.Diamond3]: "Diamond III",
	[Rank.Grandmaster]: "Grandmaster",
};

export function getRankDisplayValue(rank: Rank | undefined): string {
	if (rank == undefined) {
		return "Unranked";
	}

	return RankDisplayValues[rank];
}

export function getRankIcon(rank: Rank | undefined): string {
	switch (rank) {
		case Rank.Bronze1:
			return `${base}icons/bronze_1.png`;
		case Rank.Bronze2:
			return `${base}icons/bronze_2.png`;
		case Rank.Bronze3:
			return `${base}icons/bronze_3.png`;
		case Rank.Bronze:
			return `${base}icons/bronze.png`;

		case Rank.Silver1:
			return `${base}icons/silver_1.png`;
		case Rank.Silver2:
			return `${base}icons/silver_2.png`;
			case Rank.Silver3:
			return `${base}icons/silver_3.png`;
		case Rank.Silver:
			return `${base}icons/silver.png`;

		case Rank.Gold1:
			return `${base}icons/gold_1.png`;
		case Rank.Gold2:
			return `${base}icons/gold_2.png`;
		case Rank.Gold3:
			return `${base}icons/gold_3.png`;
		case Rank.Gold:
			return `${base}icons/gold.png`;

		case Rank.Platinum1:
			return `${base}icons/platinum_1.png`;
		case Rank.Platinum2:
			return `${base}icons/platinum_2.png`;
		case Rank.Platinum3:
			return `${base}icons/platinum_3.png`;
		case Rank.Platinum:
			return `${base}icons/platinum.png`;

		case Rank.Diamond1:
			return `${base}icons/diamond_1.png`;
		case Rank.Diamond2:
			return `${base}icons/diamond_2.png`;
		case Rank.Diamond3:
			return `${base}icons/diamond_3.png`;
		case Rank.Diamond:
			return `${base}icons/diamond.png`;

		case Rank.Grandmaster:
			return `${base}icons/grandmaster.png`;

		default:
			return `${base}icons/rank_unranked.png`;
	}
}
