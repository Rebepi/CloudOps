import test from 'node:test';
import assert from 'node:assert/strict';
import type { ConfigServiceClient } from '@aws-sdk/client-config-service';
import { collectConfigPosture } from './configCollector.js';

type Command = { constructor: { name: string }; input: Record<string, unknown> };
function clientFor(handler: (command: Command) => Record<string, unknown> | Promise<Record<string, unknown>>) {
  return { send: handler } as unknown as Pick<ConfigServiceClient, 'send'>;
}
const rule = { ConfigRuleName: 'company-rds-encryption', Compliance: { ComplianceType: 'NON_COMPLIANT', ComplianceContributorCount: { CappedCount: 2 } } };
const result = (id: string) => ({ ComplianceType: 'NON_COMPLIANT', EvaluationResultIdentifier: { EvaluationResultQualifier: {
  ResourceType: 'AWS::RDS::DBInstance', ResourceId: id,
} } });

test('Config consulta recursos por regla y usa el identificador administrado, no su nombre', async () => {
  const inputs: Record<string, unknown>[] = [];
  const posture = await collectConfigPosture(clientFor((command) => {
    switch (command.constructor.name) {
      case 'DescribeComplianceByConfigRuleCommand': return { ComplianceByConfigRules: [rule] };
      case 'DescribeConfigRulesCommand': return { ConfigRules: [{ ConfigRuleName: rule.ConfigRuleName, Source: { Owner: 'AWS', SourceIdentifier: 'RDS_STORAGE_ENCRYPTED' } }] };
      case 'GetComplianceDetailsByConfigRuleCommand':
        inputs.push(command.input);
        return command.input.NextToken ? { EvaluationResults: [result('orders'), result('payments')] }
          : { EvaluationResults: [result('orders')], NextToken: 'page2' };
      default: return {};
    }
  }));
  assert.equal(posture.rules[0]!.sourceIdentifier, 'RDS_STORAGE_ENCRYPTED');
  assert.deepEqual(posture.rules[0]!.resources.map((resource) => resource.id), ['orders', 'payments']);
  assert.equal(posture.truncated, false);
  assert.deepEqual(inputs[0]!.ComplianceTypes, ['NON_COMPLIANT']);
});

test('errores de permisos en detalle y metadatos conservan inventario base y reducen cobertura', async () => {
  const posture = await collectConfigPosture(clientFor((command) => {
    if (command.constructor.name === 'DescribeComplianceByConfigRuleCommand') return { ComplianceByConfigRules: [rule] };
    if (['DescribeConfigRulesCommand', 'GetComplianceDetailsByConfigRuleCommand'].includes(command.constructor.name)) throw new Error('AccessDenied');
    return {};
  }));
  assert.equal(posture.rules.length, 1);
  assert.equal(posture.rules[0]!.resources.length, 0);
  assert.equal(posture.rules[0]!.detailError, 'AccessDenied');
  assert.equal(posture.metadataError, 'AccessDenied');
  assert.equal(posture.truncated, true);
});

test('límites de páginas y reglas se registran sin emitir consultas ilimitadas', async () => {
  let calls = 0;
  const posture = await collectConfigPosture(clientFor((command) => {
    if (command.constructor.name === 'DescribeComplianceByConfigRuleCommand') return { ComplianceByConfigRules: Array.from({ length: 21 }, (_, i) => ({ ...rule, ConfigRuleName: `rule-${i}` })) };
    if (command.constructor.name === 'GetComplianceDetailsByConfigRuleCommand') { calls++; return { EvaluationResults: [result('orders')], NextToken: 'more' }; }
    return {};
  }));
  assert.equal(calls, 40);
  assert.equal(posture.rules[20]!.detailsTruncated, true);
  assert.equal(posture.truncated, true);
});

test('reglas personalizadas no se presentan como equivalentes a reglas administradas', async () => {
  const posture = await collectConfigPosture(clientFor((command) => {
    if (command.constructor.name === 'DescribeComplianceByConfigRuleCommand') return { ComplianceByConfigRules: [{ ...rule, Compliance: { ComplianceType: 'COMPLIANT' } }] };
    if (command.constructor.name === 'DescribeConfigRulesCommand') return { ConfigRules: [{ ConfigRuleName: rule.ConfigRuleName, Source: { Owner: 'CUSTOM_LAMBDA', SourceIdentifier: 'RDS_STORAGE_ENCRYPTED' } }] };
    if (command.constructor.name === 'GetComplianceDetailsByConfigRuleCommand') throw new Error('No debe consultar una regla conforme');
    return {};
  }));
  assert.equal(posture.rules[0]!.sourceIdentifier, undefined);
});

test('un fallo en páginas posteriores conserva los recursos ya observados', async () => {
  const posture = await collectConfigPosture(clientFor((command) => {
    if (command.constructor.name === 'DescribeComplianceByConfigRuleCommand') return { ComplianceByConfigRules: [rule] };
    if (command.constructor.name === 'GetComplianceDetailsByConfigRuleCommand') {
      if (command.input.NextToken) throw new Error('ThrottlingException');
      return { EvaluationResults: [result('orders')], NextToken: 'page2' };
    }
    return {};
  }));
  assert.equal(posture.rules[0]!.resources[0]!.id, 'orders');
  assert.equal(posture.rules[0]!.detailError, 'ThrottlingException');
  assert.equal(posture.truncated, true);
});

test('paginación de metadatos queda acotada y explícita', async () => {
  let pages = 0;
  const posture = await collectConfigPosture(clientFor((command) => {
    if (command.constructor.name === 'DescribeConfigRulesCommand') { pages++; return { NextToken: 'more' }; }
    return {};
  }));
  assert.equal(pages, 5);
  assert.equal(posture.truncated, true);
});
