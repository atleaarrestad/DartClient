export enum Rank {
	Bronze4 = 0,
	Bronze3 = 1,
	Bronze2 = 2,
	Bronze1 = 3,
	Silver4 = 4,
	Silver3 = 5,
	Silver2 = 6,
	Silver1 = 7,
	Gold4 = 8,
	Gold3 = 9,
	Gold2 = 10,
	Gold1 = 11,
	Platinum4 = 12,
	Platinum3 = 13,
	Platinum2 = 14,
	Platinum1 = 15,
	Diamond4 = 16,
	Diamond3 = 17,
	Diamond2 = 18,
	Diamond1 = 19,
	Grandmaster = 20,
}

export const RankDisplayValues: Record<Rank, string> = {
	[Rank.Bronze4]: "Bronze IV",
	[Rank.Bronze3]: "Bronze III",
	[Rank.Bronze2]: "Bronze II",
	[Rank.Bronze1]: "Bronze I",
	[Rank.Silver4]: "Silver IV",
	[Rank.Silver3]: "Silver III",
	[Rank.Silver2]: "Silver II",
	[Rank.Silver1]: "Silver I",
	[Rank.Gold4]: "Gold IV",
	[Rank.Gold3]: "Gold III",
	[Rank.Gold2]: "Gold II",
	[Rank.Gold1]: "Gold I",
	[Rank.Platinum4]: "Platinum IV",
	[Rank.Platinum3]: "Platinum III",
	[Rank.Platinum2]: "Platinum II",
	[Rank.Platinum1]: "Platinum I",
	[Rank.Diamond4]: "Diamond IV",
	[Rank.Diamond3]: "Diamond III",
	[Rank.Diamond2]: "Diamond II",
	[Rank.Diamond1]: "Diamond I",
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
		case Rank.Bronze2:
		case Rank.Bronze3:
		case Rank.Bronze4:
			return "/icons/rank_bronze.png";

		case Rank.Silver1:
		case Rank.Silver2:
		case Rank.Silver3:
		case Rank.Silver4:
			return "/icons/rank_silver.png";

		case Rank.Gold1:
		case Rank.Gold2:
		case Rank.Gold3:
		case Rank.Gold4:
			return "/icons/rank_gold.png";

		case Rank.Platinum1:
		case Rank.Platinum2:
		case Rank.Platinum3:
		case Rank.Platinum4:
			return "/icons/rank_platinum.png";

		case Rank.Diamond1:
		case Rank.Diamond2:
		case Rank.Diamond3:
		case Rank.Diamond4:
			return "/icons/rank_diamond.png";

		case Rank.Grandmaster:
			return "/icons/rank_grandmaster.png";

		default:
			return "/icons/bag.png";
	}
}
