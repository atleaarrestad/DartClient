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
			return "./icons/bronze_1.png";
		case Rank.Bronze2:
			return "./icons/bronze_2.png";
		case Rank.Bronze3:
			return "./icons/bronze_3.png";
		case Rank.Bronze4:
			return "./icons/bronze_4.png";

		case Rank.Silver1:
			return "./icons/silver_1.png";
		case Rank.Silver2:
			return "./icons/silver_2.png";
		case Rank.Silver3:
			return "./icons/silver_3.png";
		case Rank.Silver4:
			return "./icons/silver_4.png";

		case Rank.Gold1:
			return "./icons/gold_1.png";
		case Rank.Gold2:
			return "./icons/gold_2.png";
		case Rank.Gold3:
			return "./icons/gold_3.png";
		case Rank.Gold4:
			return "./icons/gold_4.png";

		case Rank.Platinum1:
			return "./icons/platinum_1.png";
		case Rank.Platinum2:
			return "./icons/platinum_2.png";
		case Rank.Platinum3:
			return "./icons/platinum_3.png";
		case Rank.Platinum4:
			return "./icons/platinum_4.png";

		case Rank.Diamond1:
			return "./icons/diamond_1.png";
		case Rank.Diamond2:
			return "./icons/diamond_2.png";
		case Rank.Diamond3:
			return "./icons/diamond_3.png";
		case Rank.Diamond4:
			return "./icons/diamond_4.png";

		case Rank.Grandmaster:
			return "./icons/grandmaster.png";

		default:
			return "./icons/rank_unranked.png";
	}
}
