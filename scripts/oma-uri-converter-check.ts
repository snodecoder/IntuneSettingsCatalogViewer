/**
 * oma-uri-converter-check.ts
 *
 * Self-check for the OMA-URI → Settings Catalog converter
 * (src/lib/oma-uri-converter.ts + src/lib/types.ts#normalizeCspPath).
 *
 * Uses an in-memory fake index instead of the real oma-uri-index.json so the
 * check runs without requiring a full data fetch/build.
 *
 * Usage:
 *   npx tsx scripts/oma-uri-converter-check.ts
 */

import * as assert from 'assert';
import { normalizeCspPath, type OmaUriIndexEntry } from '../src/lib/types';
import { parseOmaUriInput, convertOmaUriRows } from '../src/lib/oma-uri-converter';

// ── normalizeCspPath ──
assert.strictEqual(
  normalizeCspPath('./Device/Vendor/MSFT/Policy/Config/Edge/AdsSettingForIntrusiveAdsSites'),
  './device/vendor/msft/policy/config/edge/adssettingforintrusiveadssites',
);
assert.strictEqual(normalizeCspPath('a//b///c/'), 'a/b/c');
assert.strictEqual(normalizeCspPath('A\\B'), 'a/b');
console.log('normalizeCspPath: OK');

// ── parseOmaUriInput ──
assert.deepStrictEqual(parseOmaUriInput('[{"omaUri":"./A/B","value":1}]'), [
  { name: undefined, description: undefined, omaUri: './A/B', value: 1 },
]);
assert.deepStrictEqual(parseOmaUriInput('{"settings":[{"OmaUri":"./A/B","Value":"x"}]}'), [
  { name: undefined, description: undefined, omaUri: './A/B', value: 'x' },
]);
assert.deepStrictEqual(parseOmaUriInput('{"omaUri":"./A/B","value":1,"name":"N"}'), [
  { name: 'N', description: undefined, omaUri: './A/B', value: 1 },
]);
assert.throws(() => parseOmaUriInput('not json'), /not valid JSON/);
assert.throws(() => parseOmaUriInput('[{"value":1}]'), /missing an OMA-URI/);
console.log('parseOmaUriInput: OK');

// ── convertOmaUriRows ──
const fakeIndex: Record<string, OmaUriIndexEntry> = {
  './device/vendor/msft/policy/config/edge/adssetting': {
    id: 'choice-setting',
    displayName: 'Ads setting',
    categoryId: 'cat1',
    odataType: '#microsoft.graph.deviceManagementConfigurationChoiceSettingDefinition',
    options: [
      { itemId: 'choice-setting_0', displayName: 'Show', value: 0 },
      { itemId: 'choice-setting_1', displayName: 'Hide', value: 1 },
    ],
  },
  './device/vendor/msft/policy/config/browser/maxlen': {
    id: 'int-setting',
    displayName: 'Max length',
    categoryId: 'cat1',
    odataType: '#microsoft.graph.deviceManagementConfigurationSimpleSettingDefinition',
    valueDefinition: { '@odata.type': '#microsoft.graph.deviceManagementConfigurationIntegerSettingValueDefinition' },
  },
  './device/vendor/msft/policy/config/browser/name': {
    id: 'string-setting',
    displayName: 'Browser name',
    categoryId: 'cat1',
    odataType: '#microsoft.graph.deviceManagementConfigurationSimpleSettingDefinition',
    valueDefinition: { '@odata.type': '#microsoft.graph.deviceManagementConfigurationStringSettingValueDefinition' },
  },
  './device/vendor/msft/policy/config/group/thing': {
    id: 'group-setting',
    displayName: 'Group thing',
    categoryId: 'cat1',
    odataType: '#microsoft.graph.deviceManagementConfigurationSettingGroupCollectionDefinition',
  },
  // Some CSPs (e.g. Defender) are catalogued with a baseUri that omits the
  // ./Device/ or ./User/ scope segment, even though real OMA-URIs include it.
  './vendor/msft/defender/configuration/allownetworkprotectiononwinserver': {
    id: 'device_vendor_msft_defender_configuration_allownetworkprotectiononwinserver',
    displayName: 'Allow Network Protection On Win Server',
    categoryId: 'cat1',
    odataType: '#microsoft.graph.deviceManagementConfigurationChoiceSettingDefinition',
    options: [
      { itemId: 'device_vendor_msft_defender_configuration_allownetworkprotectiononwinserver_0', displayName: 'Disabled', value: 0 },
      { itemId: 'device_vendor_msft_defender_configuration_allownetworkprotectiononwinserver_1', displayName: 'Enabled', value: 1 },
    ],
  },
};

// Choice: matches by raw CSP value.
{
  const result = convertOmaUriRows(
    [{ omaUri: './Device/Vendor/MSFT/Policy/Config/Edge/AdsSetting', value: 1 }],
    fakeIndex,
  );
  assert.strictEqual(result.rows[0].status, 'converted');
  assert.strictEqual(result.convertedCount, 1);
  const instance = result.rows[0].settingInstance as any;
  assert.strictEqual(instance.choiceSettingValue.value, 'choice-setting_1');
}

// Choice: invalid value is reported, not silently dropped.
{
  const result = convertOmaUriRows(
    [{ omaUri: './Device/Vendor/MSFT/Policy/Config/Edge/AdsSetting', value: 99 }],
    fakeIndex,
  );
  assert.strictEqual(result.rows[0].status, 'invalid-value');
}

// Simple integer.
{
  const result = convertOmaUriRows(
    [{ omaUri: './Device/Vendor/MSFT/Policy/Config/Browser/MaxLen', value: '42' }],
    fakeIndex,
  );
  const instance = result.rows[0].settingInstance as any;
  assert.strictEqual(instance.simpleSettingValue.value, 42);
  assert.strictEqual(instance.simpleSettingValue['@odata.type'], '#microsoft.graph.deviceManagementConfigurationIntegerSettingValue');
}

// Simple string.
{
  const result = convertOmaUriRows(
    [{ omaUri: './Device/Vendor/MSFT/Policy/Config/Browser/Name', value: 'Edge' }],
    fakeIndex,
  );
  const instance = result.rows[0].settingInstance as any;
  assert.strictEqual(instance.simpleSettingValue.value, 'Edge');
  assert.strictEqual(instance.simpleSettingValue['@odata.type'], '#microsoft.graph.deviceManagementConfigurationStringSettingValue');
}

// Unmatched CSP path.
{
  const result = convertOmaUriRows([{ omaUri: './Not/A/Real/Path', value: 1 }], fakeIndex);
  assert.strictEqual(result.rows[0].status, 'unmatched');
}

// Unsupported (Group/Collection) setting type.
{
  const result = convertOmaUriRows(
    [{ omaUri: './Device/Vendor/MSFT/Policy/Config/Group/Thing', value: 1 }],
    fakeIndex,
  );
  assert.strictEqual(result.rows[0].status, 'unsupported');
}

// Scope-prefix mismatch: catalog baseUri omits ./Device/, real OMA-URI includes it.
{
  const result = convertOmaUriRows(
    [{ omaUri: './Device/Vendor/MSFT/Defender/Configuration/AllowNetworkProtectionOnWinServer', value: 0 }],
    fakeIndex,
  );
  assert.strictEqual(result.rows[0].status, 'converted');
  const instance = result.rows[0].settingInstance as any;
  assert.strictEqual(
    instance.choiceSettingValue.value,
    'device_vendor_msft_defender_configuration_allownetworkprotectiononwinserver_0',
  );
}

// Final policy payload only includes converted rows.
{
  const result = convertOmaUriRows(
    [
      { omaUri: './Device/Vendor/MSFT/Policy/Config/Edge/AdsSetting', value: 1 },
      { omaUri: './Not/A/Real/Path', value: 1 },
    ],
    fakeIndex,
    'My Policy',
  );
  assert.strictEqual(result.policy.name, 'My Policy');
  assert.strictEqual(result.policy.settings.length, 1);
  assert.strictEqual(result.totalCount, 2);
}

console.log('convertOmaUriRows: OK');
console.log('\nAll OMA-URI converter checks passed.');
