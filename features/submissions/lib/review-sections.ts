import { NETWORKS } from '@/features/coins/networks';
import {
  submissionCategories,
  type CoinSubmissionValues,
} from '@/features/submissions/schemas/coin-submission';
import { providerLabel } from '@/features/submissions/lib/market-options';

const defaultChain = 'ethereum' as const;

export type ReviewSection = {
  title: string;
  logo?: string;
  items: Array<{ label: string; value: string; chainIconUrl?: string }>;
};

export function buildReviewSections(values: CoinSubmissionValues): ReviewSection[] {
  const chainLabel = NETWORKS[values.contracts[0]?.chain || defaultChain].name;
  const contractItems = buildContractItems(values);
  const categoryLabels = values.categories
    .map(
      (category) => submissionCategories.find((item) => item.value === category)?.label || category,
    )
    .join(', ');

  const marketItems = values.isPresale
    ? [
        { label: 'Primary chain', value: chainLabel },
        ...contractItems,
        { label: 'Presale Website Link', value: textValue(values.presale.website) },
        {
          label: 'Presale dates',
          value: `${values.presale.startDate || '—'} → ${values.presale.endDate || '—'}`,
        },
        { label: 'Accepted payment', value: textValue(values.presale.paymentToken) },
        {
          label: 'Caps',
          value: [values.presale.softCap, values.presale.hardCap].filter(Boolean).join(' / '),
        },
      ]
    : [
        { label: 'Primary chain', value: chainLabel },
        ...contractItems,
        { label: 'Launch date', value: textValue(values.launchDate) },
        {
          label: 'Chart source',
          value: textValue(
            providerLabel(
              'chart',
              values.contracts[0]?.chain || defaultChain,
              values.chart.provider || '',
            ),
          ),
        },
        { label: 'Chart Link', value: textValue(values.chart.customUrl) },
        {
          label: 'DEX source',
          value: textValue(
            providerLabel(
              'dex',
              values.contracts[0]?.chain || defaultChain,
              values.dex.provider || '',
            ),
          ),
        },
        { label: 'DEX Link', value: textValue(values.dex.customUrl) },
      ];

  return [
    {
      title: 'Basic info',
      logo: values.logo.dataUrl,
      items: [
        { label: 'Coin name', value: values.name },
        { label: 'Symbol', value: values.symbol ? `$${values.symbol}` : '' },
        { label: 'Categories', value: categoryLabels },
        { label: 'Description', value: values.description },
        { label: 'Presale?', value: values.isPresale ? 'Yes' : 'No' },
      ],
    },
    {
      title: 'Links',
      items: [
        { label: 'Website', value: textValue(values.website) },
        { label: 'Telegram', value: textValue(values.telegram) },
        { label: 'X', value: textValue(values.x) },
        { label: 'Discord', value: textValue(values.discord) },
        { label: 'GitHub', value: textValue(values.github) },
        { label: 'Whitepaper', value: textValue(values.whitepaper) },
      ],
    },
    {
      title: 'Market details',
      items: marketItems,
    },
    {
      title: 'Security details',
      items: [
        { label: 'KYC Link', value: textValue(values.kycUrl) },
        { label: 'Audit report', value: textValue(values.auditUrl) },
      ],
    },
    {
      title: 'Contact details',
      items: [
        { label: 'Email', value: textValue(values.email) },
        { label: 'Telegram', value: textValue(values.telegramContact) },
      ],
    },
  ];
}

function textValue(value?: string | null) {
  return value || '';
}

function buildContractItems(values: CoinSubmissionValues) {
  const visibleContracts = values.contracts.filter(
    (contract, index) => index === 0 || Boolean(contract.chain || contract.address?.trim()),
  );
  const multiple = visibleContracts.length > 1;

  return visibleContracts.map((contract, index) => {
    const chain = NETWORKS[contract.chain || defaultChain];
    const address = contract.address || 'No address yet';

    return {
      label: multiple ? `Contract Address ${index + 1}` : 'Contract Address',
      value: address,
      chainIconUrl: chain.iconUrl || undefined,
    };
  });
}
