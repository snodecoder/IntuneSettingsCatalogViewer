// ─── OMA-URI (Custom profile) → Settings Catalog policy conversion ───
//
// Converts a pasted/uploaded JSON policy expressed in the classic "Custom"
// OMA-URI profile format (rows of { name, omaUri, value }) into the
// equivalent Microsoft Graph `deviceManagementConfigurationPolicy.settings`
// payload, by matching each row's OMA-URI (CSP path = baseUri + offsetUri)
// against the catalog's `oma-uri-index.json` lookup.

import { normalizeCspPath, type OmaUriIndexEntry } from './types';

export interface OmaUriInputRow {
  name?: string;
  description?: string;
  omaUri: string;
  value: unknown;
}

export type ConversionStatus = 'converted' | 'unmatched' | 'unsupported' | 'invalid-value';

export interface ConversionRowResult {
  input: OmaUriInputRow;
  status: ConversionStatus;
  message?: string;
  settingDefinitionId?: string;
  matchedDisplayName?: string;
  settingInstance?: Record<string, unknown>;
}

export interface ConversionResult {
  rows: ConversionRowResult[];
  convertedCount: number;
  totalCount: number;
  /** Ready-to-import Settings Catalog policy payload (Graph `deviceManagementConfigurationPolicy` shape). */
  policy: {
    name: string;
    description: string;
    platforms: string;
    technologies: string;
    settings: Array<{ '@odata.type': string; settingInstance: Record<string, unknown> }>;
  };
}

const ROW_ARRAY_KEYS = ['omaUriSettings', 'settings', 'rows', 'items'];
const URI_KEYS = ['omaUri', 'OmaUri', 'oMAUri', 'OMAUri', 'uri', 'Uri', 'settingUri', 'path', 'oma-uri'];
const VALUE_KEYS = ['value', 'Value', 'settingValue', 'dataValue'];
const NAME_KEYS = ['name', 'Name', 'settingName', 'displayName'];
const DESCRIPTION_KEYS = ['description', 'Description'];

function firstDefined(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

/**
 * Graph serializes `omaSettingString` (and similarly-streamed omaSetting types) with the
 * actual value nested inside an OData media-value wrapper instead of as a plain string, e.g.
 * `{ "@odata.context": "https://graph.microsoft.com/beta/$metadata#Edm.String", "value": "..." }`.
 * Unwrap that shape so the real string is used instead of the wrapper object.
 */
function unwrapODataMediaValue(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if ('@odata.context' in obj && 'value' in obj) return obj.value;
  }
  return value;
}

/**
 * Parse raw JSON text (pasted or uploaded) into a flat list of OMA-URI rows.
 * Accepts a bare array, `{ omaUriSettings: [...] }` / `{ settings: [...] }`
 * wrapper objects, or a single row object.
 */
export function parseOmaUriInput(rawText: string): OmaUriInputRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Input is not valid JSON.');
  }

  let candidates: unknown[];
  if (Array.isArray(parsed)) {
    candidates = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const arrayKey = ROW_ARRAY_KEYS.find((k) => Array.isArray(obj[k]));
    candidates = arrayKey ? (obj[arrayKey] as unknown[]) : [obj];
  } else {
    throw new Error('Input must be a JSON array or object.');
  }

  return candidates.map((item, i) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Row ${i + 1} is not a JSON object.`);
    }
    const obj = item as Record<string, unknown>;
    const uri = firstDefined(obj, URI_KEYS);
    if (typeof uri !== 'string' || !uri.trim()) {
      throw new Error(`Row ${i + 1} is missing an OMA-URI (expected one of: ${URI_KEYS.join(', ')}).`);
    }
    return {
      name: (firstDefined(obj, NAME_KEYS) as string | undefined) || undefined,
      description: (firstDefined(obj, DESCRIPTION_KEYS) as string | undefined) || undefined,
      omaUri: uri,
      value: unwrapODataMediaValue(firstDefined(obj, VALUE_KEYS)),
    };
  });
}

/** Loosely compare a user-supplied raw value against a catalog option's CSP value. */
function valuesMatch(userValue: unknown, optionValue: unknown): boolean {
  if (optionValue === undefined) return false;
  if (userValue === optionValue) return true;
  // Coerce both to string for a case-insensitive, type-agnostic compare
  // (e.g. user passes "1" for an integer option value of 1, or "true" for boolean true).
  return String(userValue).trim().toLowerCase() === String(optionValue).trim().toLowerCase();
}

function buildChoiceInstance(
  settingDefinitionId: string,
  row: OmaUriInputRow,
  entry: OmaUriIndexEntry,
): ConversionRowResult {
  const options = entry.options || [];
  const match =
    options.find((o) => valuesMatch(row.value, o.value)) ||
    options.find((o) => String(row.value).trim().toLowerCase() === o.displayName.trim().toLowerCase());

  if (!match) {
    const available = options.map((o) => `${JSON.stringify(o.value)} (${o.displayName})`).join(', ');
    return {
      input: row,
      status: 'invalid-value',
      settingDefinitionId,
      matchedDisplayName: entry.displayName,
      message: `Value ${JSON.stringify(row.value)} doesn't match any known option. Available: ${available || 'none'}.`,
    };
  }

  return {
    input: row,
    status: 'converted',
    settingDefinitionId,
    matchedDisplayName: entry.displayName,
    settingInstance: {
      '@odata.type': '#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance',
      settingDefinitionId,
      choiceSettingValue: {
        value: match.itemId,
        children: [],
      },
    },
  };
}

function buildSimpleInstance(
  settingDefinitionId: string,
  row: OmaUriInputRow,
  entry: OmaUriIndexEntry,
): ConversionRowResult {
  const vd = entry.valueDefinition;
  const isInteger = vd?.['@odata.type']?.includes('Integer');

  if (isInteger) {
    const num = typeof row.value === 'number' ? row.value : Number(row.value);
    if (!Number.isFinite(num)) {
      return {
        input: row,
        status: 'invalid-value',
        settingDefinitionId,
        matchedDisplayName: entry.displayName,
        message: `Value ${JSON.stringify(row.value)} is not a valid integer for this setting.`,
      };
    }
    return {
      input: row,
      status: 'converted',
      settingDefinitionId,
      matchedDisplayName: entry.displayName,
      settingInstance: {
        '@odata.type': '#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance',
        settingDefinitionId,
        simpleSettingValue: {
          '@odata.type': '#microsoft.graph.deviceManagementConfigurationIntegerSettingValue',
          value: num,
        },
      },
    };
  }

  // String (and secret) settings
  const isSecret = !!vd?.isSecret;
  return {
    input: row,
    status: 'converted',
    settingDefinitionId,
    matchedDisplayName: entry.displayName,
    settingInstance: {
      '@odata.type': '#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance',
      settingDefinitionId,
      simpleSettingValue: isSecret
        ? {
            '@odata.type': '#microsoft.graph.deviceManagementConfigurationSecretSettingValue',
            valueState: 'notEncrypted',
            value: String(row.value ?? ''),
          }
        : {
            '@odata.type': '#microsoft.graph.deviceManagementConfigurationStringSettingValue',
            value: String(row.value ?? ''),
          },
    },
  };
}

/**
 * A handful of CSPs (Defender, Firewall, some Policy areas, etc.) are registered in the
 * catalog with a `baseUri` that omits the `./Device/` or `./User/` scope segment, even
 * though real OMA-URIs always include it. Look up the exact path first, then fall back to
 * adding/stripping the scope segment so those settings still match.
 * ponytail: only tries the two segments actually seen in the catalog (device/user); if a
 * CSP ever needs a 3rd scope keyword this silently misses it.
 */
function lookupIndexEntry(index: Record<string, OmaUriIndexEntry>, cspPath: string): OmaUriIndexEntry | undefined {
  if (index[cspPath]) return index[cspPath];
  const scopeMatch = cspPath.match(/^\.\/(device|user)\/(.+)$/);
  if (scopeMatch) return index[`./${scopeMatch[2]}`];
  return index[`./device/${cspPath.replace(/^\.\//, '')}`] || index[`./user/${cspPath.replace(/^\.\//, '')}`];
}

/** Convert parsed OMA-URI rows into a Settings Catalog policy, using the build-time catalog index. */
export function convertOmaUriRows(
  rows: OmaUriInputRow[],
  index: Record<string, OmaUriIndexEntry>,
  policyName = 'Converted Settings Catalog Policy',
): ConversionResult {
  const results: ConversionRowResult[] = rows.map((row) => {
    const cspPath = normalizeCspPath(row.omaUri);
    const entry = lookupIndexEntry(index, cspPath);
    if (!entry) {
      return { input: row, status: 'unmatched', message: 'No matching Settings Catalog setting found for this OMA-URI.' };
    }
    if (entry.odataType.includes('Choice')) return buildChoiceInstance(entry.id, row, entry);
    if (entry.odataType.includes('Simple')) return buildSimpleInstance(entry.id, row, entry);
    return {
      input: row,
      status: 'unsupported',
      settingDefinitionId: entry.id,
      matchedDisplayName: entry.displayName,
      message: 'This setting type is not yet supported by the converter.',
    };
  });

  const settings = results
    .filter((r) => r.status === 'converted' && r.settingInstance)
    .map((r) => ({
      '@odata.type': '#microsoft.graph.deviceManagementConfigurationSetting',
      settingInstance: r.settingInstance as Record<string, unknown>,
    }));

  return {
    rows: results,
    convertedCount: settings.length,
    totalCount: rows.length,
    policy: {
      name: policyName,
      description: 'Converted from a custom OMA-URI profile.',
      platforms: 'windows10',
      technologies: 'mdm',
      settings,
    },
  };
}
