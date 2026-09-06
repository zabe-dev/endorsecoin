import {
  submissionBasicsSchema,
  submissionContactSchema,
  submissionLinksSchema,
  submissionMarketSchema,
  submissionSecuritySchema,
  type CoinSubmissionValues,
} from '@/features/submissions/schemas/coin-submission';

export type FieldErrors = Record<string, string>;

type IssueLike = { path: Array<string | number | symbol>; message: string };

function pathToString(path: Array<string | number | symbol>) {
  return path.map((part) => String(part)).join('.');
}

export function toFieldErrors(error: { issues: IssueLike[] }) {
  return error.issues.reduce<FieldErrors>((fieldErrors, issue) => {
    const path = pathToString(issue.path);
    if (path) fieldErrors[path] = issue.message;
    return fieldErrors;
  }, {});
}

export function stepFromIssues(issues: Array<{ path: Array<string | number | symbol> }>) {
  const firstPath = issues[0]?.path.map((part) => String(part)).join('.') || '';
  if (
    firstPath.startsWith('logo') ||
    firstPath.startsWith('name') ||
    firstPath.startsWith('symbol') ||
    firstPath.startsWith('description') ||
    firstPath.startsWith('categories') ||
    firstPath.startsWith('isPresale')
  )
    return 0;
  if (
    firstPath.startsWith('website') ||
    firstPath.startsWith('telegram') ||
    firstPath.startsWith('x') ||
    firstPath.startsWith('discord') ||
    firstPath.startsWith('github') ||
    firstPath.startsWith('whitepaper')
  )
    return 1;
  if (
    firstPath.startsWith('contracts') ||
    firstPath.startsWith('launchDate') ||
    firstPath.startsWith('chart') ||
    firstPath.startsWith('dex') ||
    firstPath.startsWith('presale')
  )
    return 2;
  if (firstPath.startsWith('kyc') || firstPath.startsWith('audit')) return 3;
  if (firstPath.startsWith('email') || firstPath.startsWith('telegramContact')) return 4;
  if (firstPath.startsWith('agreedToTerms') || firstPath.startsWith('turnstileToken')) return 5;
  return 5;
}

export function validateStep(
  stepIndex: number,
  values: CoinSubmissionValues,
): {
  success: boolean;
  errors: FieldErrors;
  clearedPaths: string[];
} {
  if (stepIndex === 0) {
    const result = submissionBasicsSchema.safeParse(values);
    return result.success
      ? {
          success: true,
          errors: {},
          clearedPaths: ['logo', 'name', 'symbol', 'description', 'categories', 'isPresale'],
        }
      : {
          success: false,
          errors: toFieldErrors(result.error),
          clearedPaths: [],
        };
  }

  if (stepIndex === 1) {
    const result = submissionLinksSchema.safeParse({
      website: values.website,
      telegram: values.telegram,
      x: values.x,
      discord: values.discord,
      github: values.github,
      whitepaper: values.whitepaper,
    });
    return result.success
      ? {
          success: true,
          errors: {},
          clearedPaths: ['website', 'telegram', 'x', 'discord', 'github', 'whitepaper'],
        }
      : { success: false, errors: toFieldErrors(result.error), clearedPaths: [] };
  }

  if (stepIndex === 2) {
    const result = submissionMarketSchema.safeParse(values);
    const errors = result.success ? {} : toFieldErrors(result.error);
    values.contracts.forEach((contract, index) => {
      if (!contract.chain) {
        errors[`contracts.${index}.chain`] = 'Chain is required.';
      }
      if (!values.isPresale && !contract.address?.trim()) {
        errors[`contracts.${index}.address`] = 'Contract address is required.';
      }
    });
    if (!values.isPresale) {
      if (!values.launchDate) errors.launchDate = 'Launch date is required for launched coins.';
    } else {
      if (!values.presale.startDate)
        errors['presale.startDate'] = 'Presale start date is required.';
      if (!values.presale.startTime)
        errors['presale.startTime'] = 'Presale start time is required.';
      if (!values.presale.endDate) errors['presale.endDate'] = 'Presale end date is required.';
      if (!values.presale.endTime) errors['presale.endTime'] = 'Presale end time is required.';
      if (!values.presale.paymentToken)
        errors['presale.paymentToken'] = 'Select a presale payment token.';
    }
    return {
      success: Object.keys(errors).length === 0,
      errors,
      clearedPaths: ['contracts', 'launchDate', 'chart', 'dex', 'presale'],
    };
  }

  if (stepIndex === 3) {
    const result = submissionSecuritySchema.safeParse(values);
    return result.success
      ? {
          success: true,
          errors: {},
          clearedPaths: ['kycUrl', 'auditUrl'],
        }
      : { success: false, errors: toFieldErrors(result.error), clearedPaths: [] };
  }

  if (stepIndex === 4) {
    const result = submissionContactSchema.safeParse({
      email: values.email,
      telegramContact: values.telegramContact,
      agreedToTerms: true,
      turnstileToken: values.turnstileToken,
    });
    return result.success
      ? {
          success: true,
          errors: {},
          clearedPaths: ['email', 'telegramContact'],
        }
      : { success: false, errors: toFieldErrors(result.error), clearedPaths: [] };
  }

  return { success: true, errors: {}, clearedPaths: [] };
}

export function clearScopedErrors(errors: FieldErrors, scopes: string[]) {
  const next = { ...errors };
  scopes.forEach((scope) => {
    Object.keys(next).forEach((key) => {
      if (key === scope || key.startsWith(`${scope}.`)) delete next[key];
    });
  });
  return next;
}

export function setByPath<T extends Record<string, unknown>>(
  source: T,
  path: string,
  value: string,
): T {
  const parts = path.split('.');
  const next: Record<string, unknown> = { ...source };
  let cursor: Record<string, unknown> = next;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    const current = cursor[key];
    cursor[key] = Array.isArray(current)
      ? [...current]
      : { ...(current as Record<string, unknown>) };
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
  return next as T;
}
