export type ApprovedProjectOption = {
  id: number;
  name: string;
  symbol: string;
};

export type AirdropSocialLinks = {
  telegram?: string;
  x?: string;
  reddit?: string;
  discord?: string;
  youtube?: string;
  facebook?: string;
};

export type PublicAirdropRow = {
  id: string;
  coinId: number;
  name: string;
  projectName: string;
  projectSymbol: string;
  projectLogoUrl: string | null;
  rewards: string;
  winnersCount: number;
  startsAt: string;
  endsAt: string;
  claimRewardsUrl: string;
  website: string;
  socialLinks: AirdropSocialLinks;
  status: string;
};
